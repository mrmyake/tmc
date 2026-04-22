"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  canBook,
  REASON_COPY,
  type CanBookMembership,
  type CanBookResult,
} from "./can-book";

export type BookingActionResult =
  | { ok: true; action: "booked" | "waitlisted" | "cancelled"; message: string }
  | { ok: false; message: string };

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

export async function createBooking(
  sessionId: string,
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
        "booking_window_days, fair_use_daily_max, no_show_strike_threshold, no_show_block_days, cancellation_window_hours",
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
  };

  const sessionStart = new Date(session.start_at);
  const dayStart = new Date(sessionStart);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const sessionIso = getIsoWeekYear(sessionStart);

  const [bookedCountResult, sameDayCountResult, pillarWeekCountResult] =
    await Promise.all([
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
    },
    settings,
    now,
  });

  if (!decision.allowed) {
    if (decision.canJoinWaitlist) {
      return await joinWaitlist(sessionId, user.id);
    }
    return { ok: false, message: REASON_COPY[decision.reason] };
  }

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
        "id, status, credits_used, membership_id, pillar, session:class_sessions(start_at)",
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
    ? "Je boeking is geannuleerd. Deze sessie telt mee — je was binnen vijf minuten voor de start."
    : "Je boeking is geannuleerd. Omdat je binnen het cancel-venster zit telt deze sessie mee.";

  return {
    ok: true,
    action: "cancelled",
    message: withinWindow ? "Je boeking is geannuleerd." : lateMessage,
  };
}
