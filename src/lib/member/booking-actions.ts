"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import BookingConfirmation from "@/emails/booking_confirmation";
import BookingCancelled from "@/emails/booking_cancelled";
import {
  formatRelativeWhen,
  formatTimeRange,
  formatWeekdayDate,
} from "@/lib/format-date";
import {
  canBook,
  REASON_COPY,
  type CanBookMembership,
  type CanBookResult,
} from "./can-book";

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

export async function createBooking(
  sessionId: string,
  options: CreateBookingOptions = {},
): Promise<BookingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const now = new Date();

  const [
    sessionResult,
    profileResult,
    membershipsResult,
    settingsResult,
    existingBookingResult,
    strikesResult,
  ] = await Promise.all([
    supabase
      .from("class_sessions")
      .select(
        "id, start_at, end_at, status, pillar, age_category, capacity",
      )
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("age_category")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, plan_type, frequency_cap, credits_remaining")
      .eq("profile_id", user.id)
      .eq("status", "active"),
    supabase
      .from("booking_settings")
      .select(
        "booking_window_days, fair_use_daily_max, no_show_strike_threshold, no_show_block_days, cancellation_window_hours, check_in_enabled, check_in_pillars",
      )
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("id, status")
      .eq("profile_id", user.id)
      .eq("session_id", sessionId)
      .in("status", ["booked", "waitlisted"])
      .maybeSingle(),
    supabase
      .from("v_active_strikes")
      .select("strike_count, last_strike_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  if (existingBookingResult.data) {
    return { ok: false, message: "Je hebt deze sessie al geboekt." };
  }

  const session = sessionResult.data;
  const profile = profileResult.data;
  if (!session) return { ok: false, message: "Sessie niet gevonden." };
  if (!profile) return { ok: false, message: "Profiel niet gevonden." };

  const settings = settingsResult.data ?? {
    booking_window_days: 14,
    fair_use_daily_max: 2,
    no_show_strike_threshold: 3,
    no_show_block_days: 7,
    cancellation_window_hours: 6,
    check_in_enabled: true,
    check_in_pillars: ["yoga_mobility", "kettlebell", "vrij_trainen"],
  };

  const checkInEnabledForPillar =
    Boolean(settings.check_in_enabled) &&
    Array.isArray(settings.check_in_pillars) &&
    settings.check_in_pillars.includes(session.pillar);

  const sessionStart = new Date(session.start_at);
  const dayStart = new Date(sessionStart);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const sessionIso = getIsoWeekYear(sessionStart);

  // Voor de check-ins count hebben we een datum-range nodig (ISO-week
  // bestaat niet als kolom op check_ins). Maandag 00:00 UTC → volgende
  // maandag 00:00 UTC van de week waarin de sessie valt.
  const weekStart = new Date(sessionStart);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekDow = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekDow - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const [
    bookedCountResult,
    sameDayCountResult,
    pillarWeekCountResult,
    checkInWeekCountResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "booked"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .eq("session_date", dayStart.toISOString().slice(0, 10)),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .eq("pillar", session.pillar)
      .eq("iso_week", sessionIso.isoWeek)
      .eq("iso_year", sessionIso.isoYear),
    checkInEnabledForPillar
      ? supabase
          .from("check_ins")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", user.id)
          .eq("pillar", session.pillar)
          .gte("checked_in_at", weekStart.toISOString())
          .lt("checked_in_at", weekEnd.toISOString())
      : Promise.resolve({ count: 0, error: null, data: null }),
  ]);

  const strikeCount = strikesResult.data?.strike_count ?? 0;
  const strikeBlockUntil =
    strikeCount >= settings.no_show_strike_threshold &&
    strikesResult.data?.last_strike_at
      ? new Date(
          new Date(strikesResult.data.last_strike_at).getTime() +
            settings.no_show_block_days * 86400000,
        ).toISOString()
      : null;

  const memberships: CanBookMembership[] = (
    membershipsResult.data ?? []
  ).map((m) => ({
    id: m.id,
    plan_type: m.plan_type,
    frequency_cap: m.frequency_cap,
    credits_remaining: m.credits_remaining,
  }));

  const decision: CanBookResult = canBook({
    session,
    profile: {
      age_category: profile.age_category,
      active_strikes: strikeCount,
      strikes_block_until: strikeBlockUntil,
    },
    memberships,
    usage: {
      bookedCountThisSession: bookedCountResult.count ?? 0,
      bookingsSameDay: sameDayCountResult.count ?? 0,
      bookingsSamePillarThisWeek: pillarWeekCountResult.count ?? 0,
      checkInsSamePillarThisWeek: checkInWeekCountResult.count ?? 0,
    },
    settings: { ...settings, checkInEnabledForPillar },
    now,
    acknowledgeOverCap: options.acknowledgeOverCap ?? false,
  });

  if (!decision.allowed) {
    if (decision.canJoinWaitlist) {
      return await joinWaitlist(sessionId, user.id);
    }
    return { ok: false, message: REASON_COPY[decision.reason] };
  }

  if (decision.confirmation) {
    const { combined, cap, kind } = decision.confirmation;
    return {
      ok: false,
      message: `Je hebt deze week al ${combined} van ${cap} trainingen voor deze discipline. Toch doorgaan?`,
      needsConfirmation: { kind, combined, cap },
    };
  }

  // Rentals only make sense on yoga_mobility. Other pillars: silently
  // ignore, per spec.
  const isYogaMobility = session.pillar === "yoga_mobility";
  const rentalMat = isYogaMobility && Boolean(options.rentals?.mat);
  const rentalTowel = isYogaMobility && Boolean(options.rentals?.towel);

  const insertResult = await supabase
    .from("bookings")
    .insert({
      profile_id: user.id,
      session_id: sessionId,
      session_date: dayStart.toISOString().slice(0, 10),
      pillar: session.pillar,
      iso_week: sessionIso.isoWeek,
      iso_year: sessionIso.isoYear,
      membership_id: decision.coveringMembership?.id ?? null,
      credits_used:
        decision.coveringMembership?.plan_type === "ten_ride_card" ? 1 : 0,
      status: "booked",
      rental_mat: rentalMat,
      rental_towel: rentalTowel,
    })
    .select("id")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      return { ok: false, message: "Je hebt deze sessie al geboekt." };
    }
    console.error("[createBooking] insert failed", insertResult.error);
    return { ok: false, message: "Boeken lukte niet. Probeer het opnieuw." };
  }

  if (decision.coveringMembership?.plan_type === "ten_ride_card") {
    await supabase
      .from("memberships")
      .update({
        credits_remaining:
          (decision.coveringMembership.credits_remaining ?? 1) - 1,
      })
      .eq("id", decision.coveringMembership.id);
  }

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

  const insertResult = await supabase.from("waitlist_entries").insert({
    profile_id: userId,
    session_id: sessionId,
    position,
  });

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

  const [bookingResult, settingsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, session_id, status, credits_used, membership_id, pillar, session:class_sessions(start_at)",
      )
      .eq("id", bookingId)
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("booking_settings")
      .select(
        "cancellation_window_hours, vrij_trainen_cancel_window_minutes",
      )
      .limit(1)
      .maybeSingle(),
  ]);

  const booking = bookingResult.data;
  if (!booking) return { ok: false, message: "Boeking niet gevonden." };
  if (booking.status !== "booked") {
    return { ok: false, message: "Deze boeking staat al open." };
  }

  // Vrij trainen gebruikt een veel soepeler venster dan groepslessen.
  const isVrijTrainen = booking.pillar === "vrij_trainen";
  const windowMs = isVrijTrainen
    ? (settingsResult.data?.vrij_trainen_cancel_window_minutes ?? 5) * 60_000
    : (settingsResult.data?.cancellation_window_hours ?? 6) * 3_600_000;

  const sessionRow = Array.isArray(booking.session)
    ? booking.session[0]
    : booking.session;
  if (!sessionRow) return { ok: false, message: "Sessie niet gevonden." };
  const sessionStart = new Date(sessionRow.start_at);
  const msUntil = sessionStart.getTime() - Date.now();
  const withinWindow = msUntil >= windowMs;

  const updateResult = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: withinWindow ? "within_window" : "late",
    })
    .eq("id", bookingId)
    .eq("profile_id", user.id);

  if (updateResult.error) {
    console.error("[cancelBooking] update failed", updateResult.error);
    return {
      ok: false,
      message: "Annuleren lukte niet. Probeer het opnieuw.",
    };
  }

  if (
    withinWindow &&
    booking.credits_used > 0 &&
    booking.membership_id
  ) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("credits_remaining")
      .eq("id", booking.membership_id)
      .maybeSingle();
    if (membership) {
      await supabase
        .from("memberships")
        .update({
          credits_remaining:
            (membership.credits_remaining ?? 0) + booking.credits_used,
        })
        .eq("id", booking.membership_id);
    }
  }

  revalidatePath("/app/rooster");
  revalidatePath("/app");
  revalidatePath("/app/boekingen");

  const lateMessage = isVrijTrainen
    ? "Je boeking is geannuleerd. Deze sessie telt mee. Je was binnen vijf minuten voor de start."
    : "Je boeking is geannuleerd. Omdat je binnen het cancel-venster zit telt deze sessie mee.";

  // Fire-and-forget confirmation mail. Catch inside helper.
  void sendBookingCancelledEmail({
    profileId: user.id,
    sessionId: booking.session_id,
    withinWindow,
    lateMessage,
  });

  return {
    ok: true,
    action: "cancelled",
    message: withinWindow ? "Je boeking is geannuleerd." : lateMessage,
  };
}
