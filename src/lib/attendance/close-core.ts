import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmitEventInput } from "@/lib/events/emit";
import { isMissingColumnError } from "@/lib/supabase/missing-column";
import { setMemberAttendance, type AttendanceActor } from "./core";
import { setGuestAttendanceCore } from "./guest-core";
import { markTrialAttendanceCore } from "./trial-core";

/**
 * Lessen afsluiten (fase-2-checkin-model.md, check-in-spoor PR 4, cron
 * close-sessions). Model: geboekt is aanwezig, tenzij de trainer iemand als
 * no-show heeft gemarkeerd. Dit draait het no-show-besluit van 2026-09-26
 * om: niet ingecheckt wordt bij het afsluiten aanwezig, niet no-show.
 *
 * Een groepsles (niet vrij trainen, status scheduled) is afsluitbaar zodra
 * end_at plus CLOSE_AFTER_END_MINUTES voorbij is, closed_at nog leeg is en
 * end_at op of na CLOSE_SESSIONS_NOT_BEFORE ligt (lessen van voor de deploy
 * blijven met rust; een backfill is een apart besluit). Per les, in deze
 * volgorde en elk voor zich idempotent:
 *   1. booked boekingen zonder attended_at en zonder no_show_at: aanwezig via
 *      setMemberAttendance (method auto_close, actor system). No-show,
 *      cancelled, waitlisted en al aanwezige rijen (walk-ins) blijven staan.
 *   2. gasten booked: attended (setGuestAttendanceCore).
 *   3. proeflessen paid: attended (markTrialAttendanceCore); pending blijft.
 *   4. closed_at zetten en session.closed schrijven met de aantallen.
 * Mislukt een stap, dan blijft closed_at leeg en pakt de volgende run de
 * les opnieuw op; wat al gezet is, wordt niet nog eens gezet.
 *
 * Geen credits: de rit is bij het boeken afgeschreven. Geen auth: de route
 * doet verifyCronAuth. Alles via deps, zodat scripts/attendance/
 * close-core.test.mts zonder database draait.
 *
 * Pre-push-venster: bestaat class_sessions.closed_at nog niet (42703), dan
 * schrijft deze kern niets en meldt hij migrationPending.
 */

/** Minuten na end_at waarop een les wordt afgesloten. */
export const CLOSE_AFTER_END_MINUTES = 30;

/**
 * Ondergrens op end_at: lessen die hiervoor eindigden sluit de cron nooit
 * af. Mergedag van PR 4, 00:00 Europe/Amsterdam (CEST, UTC+2).
 */
export const CLOSE_SESSIONS_NOT_BEFORE = "2026-10-23T00:00:00+02:00";

/** Rem per run; met een cron elke 15 minuten gaat het om één tot drie lessen. */
export const CLOSE_SESSIONS_MAX_PER_RUN = 50;

export const SYSTEM_ACTOR: AttendanceActor = { userId: null, actorType: "system" };

export interface CloseDeps {
  /** Service-role-client (createAdminClient()); bypasst RLS. */
  admin: SupabaseClient;
  emit: (input: EmitEventInput) => Promise<boolean>;
}

export interface CloseCounts {
  members_present: number;
  members_no_show: number;
  guests_present: number;
  guests_no_show: number;
  trials_present: number;
  trials_no_show: number;
  /** Door deze run op aanwezig gezet (leden, gasten en proeflessen samen). */
  auto_marked: number;
}

export type CloseSessionResult =
  | { ok: true; sessionId: string; counts: CloseCounts }
  | { ok: false; sessionId: string; reason: "session_not_found" | "db_error" | "attendance_failed"; message: string };

export type ClosableSession = { id: string; end_at: string };

export type FindClosableResult =
  | { ok: true; sessions: ClosableSession[] }
  | { ok: false; migrationPending: true }
  | { ok: false; migrationPending: false; message: string };

/** Alle lessen die nu afgesloten mogen worden, oudste eerst. */
export async function findClosableSessions(
  deps: CloseDeps,
  now: Date,
): Promise<FindClosableResult> {
  const cutoff = new Date(now.getTime() - CLOSE_AFTER_END_MINUTES * 60_000);
  const { data, error } = await deps.admin
    .from("class_sessions")
    .select("id, end_at")
    .eq("status", "scheduled")
    .neq("pillar", "vrij_trainen")
    .is("closed_at", null)
    .gte("end_at", new Date(CLOSE_SESSIONS_NOT_BEFORE).toISOString())
    .lte("end_at", cutoff.toISOString())
    .order("end_at", { ascending: true })
    .limit(CLOSE_SESSIONS_MAX_PER_RUN);
  if (error) {
    if (isMissingColumnError(error)) return { ok: false, migrationPending: true };
    console.error("[close-sessions] candidates", error);
    return { ok: false, migrationPending: false, message: error.message };
  }
  return { ok: true, sessions: (data ?? []) as ClosableSession[] };
}

interface BookingRow {
  id: string;
  profile_id: string;
  attended_at: string | null;
  no_show_at: string | null;
}

/** Sluit één les af. Idempotent: een al afgesloten les geeft de aantallen terug zonder te schrijven. */
export async function closeSessionCore(
  deps: CloseDeps,
  input: { sessionId: string; now: Date },
): Promise<CloseSessionResult> {
  const { admin } = deps;
  const { sessionId } = input;
  const fail = (
    reason: "session_not_found" | "db_error" | "attendance_failed",
    message: string,
  ): CloseSessionResult => ({ ok: false, sessionId, reason, message });

  const { data: session, error: sessionErr } = await admin
    .from("class_sessions")
    .select("id, closed_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) {
    console.error("[close-sessions] session select", sessionErr);
    return fail("db_error", sessionErr.message);
  }
  if (!session) return fail("session_not_found", "Sessie niet gevonden.");
  const alreadyClosed = Boolean((session as { closed_at: string | null }).closed_at);

  // 1. Leden.
  const { data: bookingRows, error: bookingsErr } = await admin
    .from("bookings")
    .select("id, profile_id, attended_at, no_show_at")
    .eq("session_id", sessionId)
    .eq("status", "booked");
  if (bookingsErr) {
    console.error("[close-sessions] bookings select", bookingsErr);
    return fail("db_error", bookingsErr.message);
  }
  const bookings = (bookingRows ?? []) as BookingRow[];
  let autoMarked = 0;
  let membersPresent = 0;
  let membersNoShow = 0;
  for (const b of bookings) {
    if (b.no_show_at) {
      membersNoShow++;
      continue;
    }
    if (b.attended_at) {
      membersPresent++;
      continue;
    }
    if (alreadyClosed) continue;
    const res = await setMemberAttendance(deps, {
      sessionId,
      bookingId: b.id,
      present: true,
      actor: SYSTEM_ACTOR,
      method: "auto_close",
      source: "auto_close",
    });
    if (!res.ok) {
      // booking_cancelled kan niet (we filteren op booked); alles anders is
      // een echte fout en laat de les open voor de volgende run.
      console.error("[close-sessions] member attendance", sessionId, b.id, res.reason);
      return fail("attendance_failed", res.message);
    }
    membersPresent++;
    if (res.changed) autoMarked++;
  }

  // 2. Gasten.
  const { data: guestRows, error: guestsErr } = await admin
    .from("guest_bookings")
    .select("id, status")
    .eq("session_id", sessionId);
  if (guestsErr) {
    console.error("[close-sessions] guests select", guestsErr);
    return fail("db_error", guestsErr.message);
  }
  const guests = (guestRows ?? []) as Array<{ id: string; status: string }>;
  let guestsPresent = guests.filter((g) => g.status === "attended").length;
  const guestsNoShow = guests.filter((g) => g.status === "no_show").length;
  const openGuests = alreadyClosed ? [] : guests.filter((g) => g.status === "booked");
  if (openGuests.length > 0) {
    const res = await setGuestAttendanceCore(
      deps,
      { userId: null, role: "system" },
      sessionId,
      openGuests.map((g) => ({ guestBookingId: g.id, status: "attended" as const })),
      "auto_close",
    );
    if (!res.ok) return fail("attendance_failed", res.message);
    guestsPresent += res.changed;
    autoMarked += res.changed;
  }

  // 3. Proeflessen.
  const { data: trialRows, error: trialsErr } = await admin
    .from("trial_bookings")
    .select("id, status")
    .eq("session_id", sessionId);
  if (trialsErr) {
    console.error("[close-sessions] trials select", trialsErr);
    return fail("db_error", trialsErr.message);
  }
  const trials = (trialRows ?? []) as Array<{ id: string; status: string }>;
  let trialsPresent = trials.filter((t) => t.status === "attended").length;
  const trialsNoShow = trials.filter((t) => t.status === "no_show").length;
  const openTrials = alreadyClosed ? [] : trials.filter((t) => t.status === "paid");
  if (openTrials.length > 0) {
    const res = await markTrialAttendanceCore(
      deps,
      { userId: null, role: "system" },
      sessionId,
      openTrials.map((t) => ({ trialBookingId: t.id, status: "attended" as const })),
      "auto_close",
    );
    if (!res.ok) return fail("attendance_failed", res.message);
    trialsPresent += res.changed;
    autoMarked += res.changed;
  }

  const counts: CloseCounts = {
    members_present: membersPresent,
    members_no_show: membersNoShow,
    guests_present: guestsPresent,
    guests_no_show: guestsNoShow,
    trials_present: trialsPresent,
    trials_no_show: trialsNoShow,
    auto_marked: autoMarked,
  };

  if (alreadyClosed) return { ok: true, sessionId, counts };

  // 4. Afsluiten. De WHERE op closed_at is null vangt een gelijktijdige run.
  const { data: closedRows, error: closeErr } = await admin
    .from("class_sessions")
    .update({ closed_at: input.now.toISOString() })
    .eq("id", sessionId)
    .is("closed_at", null)
    .select("id");
  if (closeErr) {
    console.error("[close-sessions] closed_at update", closeErr);
    return fail("db_error", closeErr.message);
  }
  if ((closedRows?.length ?? 0) === 0) return { ok: true, sessionId, counts };

  await deps.emit({
    type: "session.closed",
    actorType: "system",
    actorId: null,
    subjectType: "session",
    subjectId: sessionId,
    payload: { session_id: sessionId, ...counts },
  });

  return { ok: true, sessionId, counts };
}

export type RunCloseSessionsResult =
  | { ok: true; migrationPending: true; closed: 0 }
  | {
      ok: true;
      migrationPending: false;
      closed: number;
      failed: Array<{ sessionId: string; reason: string }>;
      autoMarked: number;
    }
  | { ok: false; message: string };

/** Eén cron-run: kandidaten zoeken en een voor een afsluiten. */
export async function runCloseSessions(
  deps: CloseDeps,
  now: Date = new Date(),
): Promise<RunCloseSessionsResult> {
  const found = await findClosableSessions(deps, now);
  if (!found.ok) {
    if (found.migrationPending) return { ok: true, migrationPending: true, closed: 0 };
    return { ok: false, message: found.message };
  }
  let closed = 0;
  let autoMarked = 0;
  const failed: Array<{ sessionId: string; reason: string }> = [];
  for (const s of found.sessions) {
    const res = await closeSessionCore(deps, { sessionId: s.id, now });
    if (res.ok) {
      closed++;
      autoMarked += res.counts.auto_marked;
    } else {
      failed.push({ sessionId: s.id, reason: res.reason });
    }
  }
  return { ok: true, migrationPending: false, closed, failed, autoMarked };
}
