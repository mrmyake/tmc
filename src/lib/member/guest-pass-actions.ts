"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import GuestConfirmation from "@/emails/guest_confirmation";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import {
  allocationFor,
  currentPeriod,
  DEFAULT_CYCLE_WEEKS,
  GUEST_VISIT_MAX_WITHIN_WINDOW,
  GUEST_VISIT_WINDOW_MONTHS,
} from "./guest-pass-allocation";

export type GuestPassResult =
  | {
      ok: true;
      message: string;
      allocated?: number;
      used?: number;
      remaining?: number;
      periodEnd?: string;
    }
  | { ok: false; message: string };

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

/**
 * Find or lazily create the current-period guest-passes row for a member.
 * Returns null if the member has no membership that qualifies for passes.
 * We write with the admin client because lazy-allocation is a
 * read-path side-effect that would otherwise need a separate policy.
 */
async function ensureCurrentPeriod(profileId: string): Promise<
  | {
      id: string;
      allocated: number;
      used: number;
      periodStart: string;
      periodEnd: string;
      membershipId: string | null;
    }
  | null
> {
  const admin = createAdminClient();

  const { data: memberships } = await admin
    .from("memberships")
    .select(
      "id, plan_type, frequency_cap, status, start_date, billing_cycle_weeks",
    )
    .eq("profile_id", profileId)
    .in("status", ["active", "paused"])
    .order("start_date", { ascending: false });

  const membership = memberships?.[0] ?? null;
  if (!membership) return null;

  const allocation = allocationFor({
    planType: membership.plan_type,
    frequencyCap: membership.frequency_cap,
    status: membership.status,
  });
  if (allocation === 0) return null;

  const cycleWeeks = membership.billing_cycle_weeks ?? DEFAULT_CYCLE_WEEKS;
  const { periodStart, periodEnd } = currentPeriod(
    membership.start_date,
    cycleWeeks,
  );

  const { data: existing } = await admin
    .from("guest_passes")
    .select("id, passes_allocated, passes_used")
    .eq("profile_id", profileId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      allocated: existing.passes_allocated,
      used: existing.passes_used,
      periodStart,
      periodEnd,
      membershipId: membership.id,
    };
  }

  const { data: created, error } = await admin
    .from("guest_passes")
    .insert({
      profile_id: profileId,
      membership_id: membership.id,
      period_start: periodStart,
      period_end: periodEnd,
      passes_allocated: allocation,
      passes_used: 0,
    })
    .select("id, passes_allocated, passes_used")
    .single();

  if (error || !created) {
    console.error("[ensureCurrentPeriod] insert failed", error);
    return null;
  }

  return {
    id: created.id,
    allocated: created.passes_allocated,
    used: created.passes_used,
    periodStart,
    periodEnd,
    membershipId: membership.id,
  };
}

// ----------------------------------------------------------------------------
// Status — returns the member's current pass state for UI.
// ----------------------------------------------------------------------------

export interface GuestPassStatus {
  eligible: boolean;
  allocated: number;
  used: number;
  remaining: number;
  periodStart: string | null;
  periodEnd: string | null;
  invitedThisPeriod: GuestVisit[];
}

export interface GuestVisit {
  id: string;
  guestName: string;
  sessionStart: string;
  className: string;
  status: string;
}

export async function getGuestPassStatus(): Promise<GuestPassStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      eligible: false,
      allocated: 0,
      used: 0,
      remaining: 0,
      periodStart: null,
      periodEnd: null,
      invitedThisPeriod: [],
    };
  }

  const period = await ensureCurrentPeriod(user.id);
  if (!period) {
    return {
      eligible: false,
      allocated: 0,
      used: 0,
      remaining: 0,
      periodStart: null,
      periodEnd: null,
      invitedThisPeriod: [],
    };
  }

  const admin = createAdminClient();
  const { data: bookings } = await admin
    .from("guest_bookings")
    .select(
      `id, guest_name, status,
       session:class_sessions(start_at, class_type:class_types(name))`,
    )
    .eq("guest_pass_id", period.id)
    .order("booked_at", { ascending: false });

  type S = {
    start_at: string;
    class_type: { name: string | null } | { name: string | null }[] | null;
  } | null;

  const invited: GuestVisit[] = (bookings ?? []).map((b) => {
    const s = (Array.isArray(b.session) ? b.session[0] : b.session) as S;
    const ct = s
      ? ((Array.isArray(s.class_type) ? s.class_type[0] : s.class_type) as {
          name: string | null;
        } | null)
      : null;
    return {
      id: b.id,
      guestName: b.guest_name,
      sessionStart: s?.start_at ?? "",
      className: ct?.name ?? "Sessie",
      status: b.status,
    };
  });

  return {
    eligible: true,
    allocated: period.allocated,
    used: period.used,
    remaining: Math.max(0, period.allocated - period.used),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    invitedThisPeriod: invited,
  };
}

// ----------------------------------------------------------------------------
// Book a guest into a session.
// ----------------------------------------------------------------------------

interface BookGuestInput {
  sessionId: string;
  guestName: string;
  guestEmail: string;
}

export async function bookGuest(
  input: BookGuestInput,
): Promise<GuestPassResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const name = input.guestName.trim();
  const email = input.guestEmail.trim().toLowerCase();
  if (!name) return { ok: false, message: "Naam van je gast is verplicht." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "E-mail klopt niet." };
  }

  const period = await ensureCurrentPeriod(user.id);
  if (!period) {
    return {
      ok: false,
      message:
        "Je abonnement geeft geen recht op guest passes. Vraag Marlon over een upgrade.",
    };
  }
  if (period.used >= period.allocated) {
    return {
      ok: false,
      message: "Je guest passes voor deze periode zijn op.",
    };
  }

  const admin = createAdminClient();

  // 1. Guest mag geen actief lid zijn bij TMC.
  const { data: existingMemberProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingMemberProfile) {
    const { count: activeMemberships } = await admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", existingMemberProfile.id)
      .in("status", ["active", "paused"]);
    if ((activeMemberships ?? 0) > 0) {
      return {
        ok: false,
        message:
          "Dit e-mailadres hoort al bij een actief lid. Ze kunnen gewoon zelf boeken.",
      };
    }
  }

  // 2. Rate-limit — gast mag maximaal 2× per 3 maanden.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - GUEST_VISIT_WINDOW_MONTHS);
  const { count: recentCount } = await admin
    .from("guest_bookings")
    .select("id", { count: "exact", head: true })
    .eq("guest_email", email)
    .in("status", ["booked", "attended"])
    .gte("booked_at", cutoff.toISOString());

  if ((recentCount ?? 0) >= GUEST_VISIT_MAX_WITHIN_WINDOW) {
    return {
      ok: false,
      message:
        `${name} is al ${GUEST_VISIT_MAX_WITHIN_WINDOW}× te gast geweest dit kwartaal. Een lidmaatschap ligt nu voor de hand — laat 'm even langs Marlon lopen.`,
    };
  }

  // 3. Session capaciteit.
  const { data: session } = await admin
    .from("class_sessions")
    .select(
      `id, start_at, end_at, capacity, status, pillar,
       class_type:class_types(name),
       trainer:trainers(display_name)`,
    )
    .eq("id", input.sessionId)
    .maybeSingle();

  if (!session) return { ok: false, message: "Sessie niet gevonden." };
  if (session.status !== "scheduled") {
    return { ok: false, message: "Deze sessie staat niet open." };
  }
  if (new Date(session.start_at).getTime() <= Date.now()) {
    return { ok: false, message: "Sessie is al begonnen of voorbij." };
  }

  const [{ count: bookedCount }, { count: guestCount }] = await Promise.all([
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId)
      .eq("status", "booked"),
    admin
      .from("guest_bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId)
      .in("status", ["booked", "attended"]),
  ]);

  const taken = (bookedCount ?? 0) + (guestCount ?? 0);
  if (taken >= session.capacity) {
    return { ok: false, message: "Deze sessie is vol." };
  }

  // 4. Insert met idempotent-check op unique(session_id, email).
  const { error: insertError } = await admin.from("guest_bookings").insert({
    guest_pass_id: period.id,
    session_id: input.sessionId,
    booked_by: user.id,
    guest_name: name,
    guest_email: email,
    status: "booked",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        ok: false,
        message: "Deze gast staat al op deze sessie.",
      };
    }
    console.error("[bookGuest] insert failed", insertError);
    return { ok: false, message: "Gast toevoegen lukte niet." };
  }

  // 5. Bump passes_used.
  const { error: updateError } = await admin
    .from("guest_passes")
    .update({ passes_used: period.used + 1 })
    .eq("id", period.id);

  if (updateError) {
    console.error("[bookGuest] passes_used update failed", updateError);
  }

  // 6. Fetch member name for the email greeting.
  const { data: memberProfile } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();

  // 7. Fire-and-forget guest email. Also mark reminder_sent so follow-up
  //    crons don't re-send.
  type Ref<T> = T | T[] | null;
  const classType = (
    Array.isArray(session.class_type)
      ? session.class_type[0]
      : session.class_type
  ) as { name: string | null } | null;
  const trainer = (
    Array.isArray(session.trainer) ? session.trainer[0] : session.trainer
  ) as { display_name: string | null } | null;
  void (0 as unknown as Ref<never>);

  const start = new Date(session.start_at);
  const end = new Date(session.end_at);
  const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;

  void (async () => {
    try {
      await sendEmail({
        to: email,
        toName: name,
        subject: `Je staat op de lijst: ${classType?.name ?? "een sessie"} bij The Movement Club`,
        react: GuestConfirmation({
          guestFirstName: name.split(" ")[0] ?? name,
          memberFirstName: memberProfile?.first_name ?? "een lid",
          className: classType?.name ?? "Sessie",
          trainerName: trainer?.display_name ?? "je coach",
          whenLabel,
          siteUrl: siteUrl(),
        }),
      });
      await admin
        .from("guest_bookings")
        .update({ reminder_sent: true })
        .eq("session_id", input.sessionId)
        .eq("guest_email", email);
    } catch (err) {
      console.error("[bookGuest] guest email failed", err);
    }
  })();

  revalidatePath("/app/rooster");
  revalidatePath("/app/abonnement");

  return {
    ok: true,
    message: `${name} staat op de lijst. Bevestiging gaat per mail.`,
    allocated: period.allocated,
    used: period.used + 1,
    remaining: Math.max(0, period.allocated - period.used - 1),
    periodEnd: period.periodEnd,
  };
}
