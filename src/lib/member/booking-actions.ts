"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendEmail } from "@/lib/email";
import BookingConfirmation from "@/emails/booking_confirmation";
import BookingCancelled from "@/emails/booking_cancelled";
import {
  formatRelativeWhen,
  formatTimeRange,
  formatWeekdayDate,
} from "@/lib/format-date";
import { planCovers } from "./plan-coverage";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

/** Fire-and-forget booking-confirmation email. Never blocks the action. */
async function sendBookingConfirmationEmail(args: {
  profileId: string;
  sessionId: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [profileRes, sessionRes] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name, email")
        .eq("id", args.profileId)
        .maybeSingle(),
      admin
        .from("class_sessions")
        .select(
          `start_at, end_at,
           class_type:class_types(name),
           trainer:trainers(display_name)`,
        )
        .eq("id", args.sessionId)
        .maybeSingle(),
    ]);
    const profile = profileRes.data;
    const sessionRow = sessionRes.data;
    if (!profile?.email || !sessionRow) return;

    type Ref<T> = T | T[] | null;
    const ct = (Array.isArray(sessionRow.class_type)
      ? sessionRow.class_type[0]
      : sessionRow.class_type) as { name: string | null } | null;
    const tr = (Array.isArray(sessionRow.trainer)
      ? sessionRow.trainer[0]
      : sessionRow.trainer) as { display_name: string | null } | null;
    void (0 as unknown as Ref<never>);

    const start = new Date(sessionRow.start_at);
    const end = new Date(sessionRow.end_at);
    const whenLabel = `${formatRelativeWhen(start).replace(/\s·\s.*/, "")} · ${formatTimeRange(start, end)}`;

    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: `Bevestigd: ${ct?.name ?? "Sessie"} ${whenLabel}`,
      react: BookingConfirmation({
        firstName: profile.first_name ?? "",
        className: ct?.name ?? "Sessie",
        trainerName: tr?.display_name ?? "je coach",
        whenLabel,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[booking-confirmation email] skipped", err);
  }
}

/** Fire-and-forget cancellation-by-member email. Never blocks the action. */
async function sendBookingCancelledEmail(args: {
  profileId: string;
  sessionId: string;
  withinWindow: boolean;
  lateMessage: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [profileRes, sessionRes] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name, email")
        .eq("id", args.profileId)
        .maybeSingle(),
      admin
        .from("class_sessions")
        .select(
          `start_at, end_at, class_type:class_types(name)`,
        )
        .eq("id", args.sessionId)
        .maybeSingle(),
    ]);
    const profile = profileRes.data;
    const sessionRow = sessionRes.data;
    if (!profile?.email || !sessionRow) return;

    const ct = (Array.isArray(sessionRow.class_type)
      ? sessionRow.class_type[0]
      : sessionRow.class_type) as { name: string | null } | null;
    const start = new Date(sessionRow.start_at);
    const end = new Date(sessionRow.end_at);
    const whenLabel = `${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`;

    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: `Geannuleerd: ${ct?.name ?? "Sessie"}`,
      react: BookingCancelled({
        firstName: profile.first_name ?? "",
        className: ct?.name ?? "Sessie",
        whenLabel,
        withinWindow: args.withinWindow,
        lateMessage: args.lateMessage,
        siteUrl: siteUrl(),
      }),
    });
  } catch (err) {
    console.error("[booking-cancelled email] skipped", err);
  }
}

export type BookingActionResult =
  | { ok: true; action: "booked" | "waitlisted" | "cancelled"; message: string }
  | {
      ok: false;
      message: string;
      /**
       * Gezet wanneer de user over de weekly cap zou gaan op een pillar met
       * check-in aan. Client kan dit als "soft warning" gebruiken: dialoog
       * tonen met combined/cap + knop "Toch boeken" die createBooking
       * opnieuw aanroept met `acknowledgeOverCap: true`.
       */
      needsConfirmation?: {
        kind: "weekly_cap_combined";
        combined: number;
        cap: number;
      };
    };

function getIsoWeekYear(date: Date): { isoWeek: number; isoYear: number } {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { isoWeek, isoYear: target.getUTCFullYear() };
}

export interface CreateBookingOptions {
  /** Optional yoga/mobility-only rentals. Ignored on other pillars. */
  rentals?: { mat?: boolean; towel?: boolean };
  /**
   * Lid heeft de "je zit over je weekcap" dialoog bevestigd. Vallen we in
   * de soft-warning pad terug, dan slaan we die deze keer over en committen
   * we direct.
   */
  acknowledgeOverCap?: boolean;
}

/**
 * Copy voor de weiger-redenen die tmc.book_class_session teruggeeft. De
 * harde regels zelf leven sinds audit-fix #3 in de SECURITY DEFINER RPC;
 * dit is alleen de vertaling naar user-facing tekst.
 */
const BOOK_REASON_COPY: Record<string, string> = {
  session_not_found: "Sessie niet gevonden.",
  profile_not_found: "Profiel niet gevonden.",
  age_mismatch: "Deze sessie valt buiten jouw leeftijdscategorie.",
  booking_window_closed: "Nog niet open voor boeking.",
  session_not_scheduled: "Deze sessie is niet meer beschikbaar.",
  session_in_past: "Deze sessie is al voorbij.",
  capacity_full: "Vol. Je kunt je op de wachtlijst zetten.",
  strike_blocked:
    "Door meerdere no-shows is boeken tijdelijk geblokkeerd. Neem contact op als je vragen hebt.",
  weekly_cap_reached:
    "Je weekcap voor deze discipline is bereikt. Volgende week weer.",
  daily_cap_reached: "Maximaal twee sessies per dag.",
  no_coverage: "Deze sessie valt buiten je huidige abonnement.",
  already_booked: "Je hebt deze sessie al geboekt.",
};

type BookClassSessionResult = {
  ok: boolean;
  reason?: string;
  can_join_waitlist?: boolean;
  booking_id?: string;
  membership_id?: string | null;
  credits_used?: number;
  pillar?: string;
  session_date?: string;
};

type CancelClassBookingResult = {
  ok: boolean;
  reason?: string;
  session_id?: string;
  pillar?: string;
  within_window?: boolean;
  credits_refunded?: boolean;
};

/**
 * Zachte weekly-cap check (besluit #1, optie B): puur een UX-nudge vóór de
 * RPC-call, voor pillars mét check-in. Geeft de bevestig-dialoog terug als
 * bookings + check-ins deze week op of over de cap zitten. De hárde cap
 * (pillars zonder check-in) wordt server-side in tmc.book_class_session
 * afgedwongen; deze check handhaaft niets.
 */
async function softWeeklyCapCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
): Promise<{ combined: number; cap: number } | null> {
  const [sessionResult, settingsResult, membershipsResult] =
    await Promise.all([
      supabase
        .from("class_sessions")
        .select("start_at, pillar")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase
        .from("booking_settings")
        .select("check_in_enabled, check_in_pillars")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select(
          "plan_type, frequency_cap, status, cancellation_effective_date",
        )
        .eq("profile_id", userId)
        .in("status", ["active", "cancellation_requested"]),
    ]);

  const session = sessionResult.data;
  if (!session) return null; // RPC geeft zo de echte foutmelding

  const settings = settingsResult.data ?? {
    check_in_enabled: true,
    check_in_pillars: ["yoga_mobility", "kettlebell", "vrij_trainen"],
  };
  const checkInEnabledForPillar =
    Boolean(settings.check_in_enabled) &&
    Array.isArray(settings.check_in_pillars) &&
    settings.check_in_pillars.includes(session.pillar);
  if (!checkInEnabledForPillar) return null;

  const sessionStart = new Date(session.start_at);
  const sessionDateStr = sessionStart.toISOString().slice(0, 10);
  const covering = (membershipsResult.data ?? [])
    .filter(
      (m) =>
        m.status === "active" ||
        (m.status === "cancellation_requested" &&
          m.cancellation_effective_date != null &&
          m.cancellation_effective_date >= sessionDateStr),
    )
    .find((m) => planCovers(m.plan_type, session.pillar));
  if (!covering || covering.frequency_cap == null) return null;

  const sessionIso = getIsoWeekYear(sessionStart);
  // Maandag 00:00 UTC → volgende maandag 00:00 UTC van de sessie-week
  // (check_ins heeft geen iso_week-kolom, dus datum-range).
  const weekStart = new Date(sessionStart);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekDow = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekDow - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const [pillarWeekCountResult, checkInWeekCountResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("status", "booked")
      .eq("pillar", session.pillar)
      .eq("iso_week", sessionIso.isoWeek)
      .eq("iso_year", sessionIso.isoYear),
    supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .eq("pillar", session.pillar)
      .gte("checked_in_at", weekStart.toISOString())
      .lt("checked_in_at", weekEnd.toISOString()),
  ]);

  const combined =
    (pillarWeekCountResult.count ?? 0) + (checkInWeekCountResult.count ?? 0);
  if (combined >= covering.frequency_cap) {
    return { combined, cap: covering.frequency_cap };
  }
  return null;
}

export async function createBooking(
  sessionId: string,
  options: CreateBookingOptions = {},
): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  // Telefoon is sinds de profiles_phone_nullable-migratie optioneel bij
  // signup (geen verzonnen fallback meer) — verplicht wel vóór de eerste
  // boeking, want de studio moet een lid kunnen bereiken bij een
  // last-minute wijziging.
  const { data: profileForPhone } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileForPhone?.phone) {
    return {
      ok: false,
      message: "Vul eerst je telefoonnummer in bij je profiel.",
    };
  }

  // Zachte weekcap-nudge (alleen check-in-pillars) vóór de RPC. Server-side
  // wordt deze bewust niet gehandhaafd — besluit #1, optie B.
  if (!options.acknowledgeOverCap) {
    const overCap = await softWeeklyCapCheck(supabase, user.id, sessionId);
    if (overCap) {
      return {
        ok: false,
        message: `Je hebt deze week al ${overCap.combined} van ${overCap.cap} trainingen voor deze discipline. Toch doorgaan?`,
        needsConfirmation: { kind: "weekly_cap_combined", ...overCap },
      };
    }
  }

  // Alle harde regels (capaciteit, caps, dekking, credits) + de insert en
  // credit-aftrek zitten atomair in de SECURITY DEFINER RPC (audit-fix #3).
  const rpcResult = await supabase.rpc("book_class_session", {
    p_session_id: sessionId,
    p_rental_mat: Boolean(options.rentals?.mat),
    p_rental_towel: Boolean(options.rentals?.towel),
  });

  if (rpcResult.error) {
    console.error("[createBooking] rpc failed", rpcResult.error);
    return { ok: false, message: "Boeken lukte niet. Probeer het opnieuw." };
  }

  const result = rpcResult.data as BookClassSessionResult;

  if (!result.ok) {
    if (result.reason === "capacity_full" && result.can_join_waitlist) {
      return await joinWaitlist(sessionId, user.id);
    }
    return {
      ok: false,
      message:
        BOOK_REASON_COPY[result.reason ?? ""] ??
        "Boeken lukte niet. Probeer het opnieuw.",
    };
  }

  await emitEvent({
    type: "booking.created",
    actorType: "member",
    actorId: user.id,
    subjectType: "booking",
    subjectId: result.booking_id ?? null,
    payload: {
      profile_id: user.id,
      session_id: sessionId,
      membership_id: result.membership_id ?? null,
      credits_used: result.credits_used ?? 0,
      pillar: result.pillar ?? null,
      session_date: result.session_date ?? null,
    },
  });

  revalidatePath("/app/rooster");
  revalidatePath("/app");
  revalidatePath("/app/boekingen");

  // Fire-and-forget confirmation email. Catch inside helper so this can
  // never crash the action.
  void sendBookingConfirmationEmail({
    profileId: user.id,
    sessionId,
  });

  return {
    ok: true,
    action: "booked",
    message: "Je sessie staat. Tot dan.",
  };
}

async function joinWaitlist(
  sessionId: string,
  userId: string,
): Promise<BookingActionResult> {
  const supabase = await createClient();

  const positionResult = await supabase
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  const position = (positionResult.count ?? 0) + 1;

  const insertResult = await supabase
    .from("waitlist_entries")
    .insert({
      profile_id: userId,
      session_id: sessionId,
      position,
    })
    .select("id")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      return { ok: false, message: "Je staat al op de wachtlijst." };
    }
    console.error("[joinWaitlist] insert failed", insertResult.error);
    return {
      ok: false,
      message: "Wachtlijst-inschrijving lukte niet. Probeer het opnieuw.",
    };
  }

  await emitEvent({
    type: "booking.waitlisted",
    actorType: "member",
    actorId: userId,
    subjectType: "waitlist",
    subjectId: insertResult.data.id,
    payload: { profile_id: userId, session_id: sessionId, position },
  });

  revalidatePath("/app/rooster");

  return {
    ok: true,
    action: "waitlisted",
    message: `Je staat op de wachtlijst, plek ${position}.`,
  };
}

export async function cancelBooking(
  bookingId: string,
): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  // Status-check, cancel-venster, status-flip én credit-refund zitten
  // atomair in de SECURITY DEFINER RPC (audit-fix #3 + #1 deel 2).
  const rpcResult = await supabase.rpc("cancel_class_booking", {
    p_booking_id: bookingId,
  });

  if (rpcResult.error) {
    console.error("[cancelBooking] rpc failed", rpcResult.error);
    return {
      ok: false,
      message: "Annuleren lukte niet. Probeer het opnieuw.",
    };
  }

  const result = rpcResult.data as CancelClassBookingResult;

  if (!result.ok) {
    if (result.reason === "not_found") {
      return { ok: false, message: "Boeking niet gevonden." };
    }
    if (result.reason === "not_booked") {
      return { ok: false, message: "Deze boeking staat al open." };
    }
    if (result.reason === "session_not_found") {
      return { ok: false, message: "Sessie niet gevonden." };
    }
    return {
      ok: false,
      message: "Annuleren lukte niet. Probeer het opnieuw.",
    };
  }

  const isVrijTrainen = result.pillar === "vrij_trainen";
  const withinWindow = Boolean(result.within_window);
  const sessionId = result.session_id as string;

  await emitEvent({
    type: "booking.cancelled",
    actorType: "member",
    actorId: user.id,
    subjectType: "booking",
    subjectId: bookingId,
    payload: {
      profile_id: user.id,
      session_id: sessionId,
      reason: withinWindow ? "within_window" : "late",
      credits_refunded: Boolean(result.credits_refunded),
    },
  });

  revalidatePath("/app/rooster");
  revalidatePath("/app");
  revalidatePath("/app/boekingen");

  const lateMessage = isVrijTrainen
    ? "Je boeking is geannuleerd. Deze sessie telt mee. Je was binnen vijf minuten voor de start."
    : "Je boeking is geannuleerd. Omdat je binnen het cancel-venster zit telt deze sessie mee.";

  // Fire-and-forget confirmation mail. Catch inside helper.
  void sendBookingCancelledEmail({
    profileId: user.id,
    sessionId,
    withinWindow,
    lateMessage,
  });

  return {
    ok: true,
    action: "cancelled",
    message: withinWindow ? "Je boeking is geannuleerd." : lateMessage,
  };
}
