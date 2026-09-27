import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmitEventInput } from "@/lib/events/emit";

/**
 * Schrijfkern voor de aanwezigheid van een lid bij een les (fase-2-checkin-
 * model.md, check-in-spoor PR 1; discovery-kiosk-checkin.md §D). Eén ingang
 * voor de deelnemerslijst (markAttendance), de admin-override (overrideNoShow)
 * en de tablet (checkInByProfileId met sessie); straks ook de kiosk en de
 * cron. Geen auth: de aanroeper doet de gate en geeft de actor door.
 *
 * Model: bookings.status kent alleen booked, cancelled en waitlisted.
 * Aanwezigheid is een check_ins-rij plus bookings.attended_at; afwezigheid
 * na afloop is bookings.no_show_at plus een no_show_strikes-rij. Deze kern
 * zet en wist de aanwezigheid; no-show markeren blijft bij de aanroepers
 * (en straks bij de cron close-sessions), maar loopt voor het verwijderen
 * van een eerdere check-in wel door deze kern (keepStrike).
 *
 * De vijf verschillen tussen de oude paden, hier vastgelegd:
 *  1. booking_id is altijd gekoppeld: een booked booking is verplicht; een
 *     losse check_in op (sessie, profiel) zonder booking_id wordt bijgekoppeld.
 *     Geen boeking betekent no_booking; een walk-in maakt eerst een boeking
 *     (walk-in-RPC, PR 3).
 *  2. access_type komt uit de booking (credits_used, membership_id), niet uit
 *     een membership-heuristiek op het moment van inchecken.
 *  3. Geen credit-mutaties: book_class_session boekt de rit af bij het
 *     boeken en cancel_class_booking boekt hem terug (live geverifieerd).
 *     Inchecken of terugdraaien raakt adjust_membership_credits nooit.
 *  4. Strikes: aanwezig wist de strike van de booking; terugdraaien ook,
 *     tenzij keepStrike (no-show-correctie door de aanroeper).
 *  5. Events: subject_type "booking" met het booking-id, actor uit de gate,
 *     alleen bij een echte wijziging (rij aangemaakt of verwijderd).
 *
 * Idempotent: dezelfde kant nog eens op geeft changed: false zonder event.
 * Geen transactie (net als de oude paden): bij een fout halverwege herstelt
 * de volgende aanroep de staat.
 */

export interface AttendanceDeps {
  /** Service-role-client (createAdminClient()); bypasst RLS. */
  admin: SupabaseClient;
  emit: (input: EmitEventInput) => Promise<boolean>;
}

export type AttendanceActor = { userId: string; actorType: "admin" | "trainer" };
export type AttendanceMethod = "admin_web" | "admin_tablet";
export type BookingAccessType = "membership" | "credit" | "drop_in";

export type SetMemberAttendanceInput = {
  sessionId: string;
  present: boolean;
  actor: AttendanceActor;
  /** Herkomst op de check_ins-rij. Default admin_web. */
  method?: AttendanceMethod;
  /** Alleen voor de event-payload: attendance, override, kiosk, undo, no_show_correction. */
  source?: string;
  /** present: false laat de strike staan (de aanroeper zet direct no_show). */
  keepStrike?: boolean;
} & ({ bookingId: string; profileId?: undefined } | { profileId: string; bookingId?: undefined });

export type AttendanceFailReason =
  | "booking_not_found"
  | "booking_not_in_session"
  | "booking_cancelled"
  | "no_booking"
  | "session_not_found"
  | "db_error";

// COPY: confirm met Marlon
export const ATTENDANCE_FAIL_COPY: Record<AttendanceFailReason, string> = {
  booking_not_found: "Boeking niet gevonden.",
  booking_not_in_session: "Boeking hoort niet bij deze sessie.",
  booking_cancelled: "Geannuleerde boeking kan niet worden gemarkeerd.",
  no_booking: "Geen boeking voor deze les. Voeg eerst een boeking toe.",
  session_not_found: "Sessie niet gevonden.",
  db_error: "Bijwerken lukte niet.",
};

export type SetMemberAttendanceResult =
  | {
      ok: true;
      /** False als de gevraagde staat er al was; dan is er ook geen event. */
      changed: boolean;
      bookingId: string;
      profileId: string;
      /** null na terugdraaien. */
      checkInId: string | null;
      accessType: BookingAccessType;
    }
  | { ok: false; reason: AttendanceFailReason; message: string };

interface BookingRow {
  id: string;
  session_id: string;
  profile_id: string;
  status: string;
  credits_used: number | null;
  membership_id: string | null;
  attended_at: string | null;
  no_show_at: string | null;
}

/** Verschil 2: wat er betaald is, uit de booking zelf. */
export function accessTypeForBooking(b: {
  credits_used: number | null;
  membership_id: string | null;
}): BookingAccessType {
  if ((b.credits_used ?? 0) > 0) return "credit";
  if (b.membership_id) return "membership";
  return "drop_in";
}

function fail(reason: AttendanceFailReason): SetMemberAttendanceResult {
  return { ok: false, reason, message: ATTENDANCE_FAIL_COPY[reason] };
}

export async function setMemberAttendance(
  deps: AttendanceDeps,
  input: SetMemberAttendanceInput,
): Promise<SetMemberAttendanceResult> {
  const { admin } = deps;
  const method: AttendanceMethod = input.method ?? "admin_web";
  const source = input.source ?? "attendance";

  // 1. De booking (verschil 1: verplicht en altijd gekoppeld).
  const bookingSelect = "id, session_id, profile_id, status, credits_used, membership_id, attended_at, no_show_at";
  const bookingRes = input.bookingId
    ? await admin.from("bookings").select(bookingSelect).eq("id", input.bookingId).maybeSingle()
    : await admin
        .from("bookings")
        .select(bookingSelect)
        .eq("session_id", input.sessionId)
        .eq("profile_id", input.profileId)
        .maybeSingle();
  if (bookingRes.error) {
    console.error("[setMemberAttendance] booking select", bookingRes.error);
    return fail("db_error");
  }
  const booking = (bookingRes.data ?? null) as BookingRow | null;
  if (!booking) return fail(input.bookingId ? "booking_not_found" : "no_booking");
  if (booking.session_id !== input.sessionId) return fail("booking_not_in_session");
  if (booking.status === "cancelled") return fail("booking_cancelled");
  if (booking.status !== "booked") return fail("no_booking");

  // 2. De sessie, voor de pillar op de check_ins-rij.
  const { data: session, error: sessionErr } = await admin
    .from("class_sessions")
    .select("id, pillar")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionErr) {
    console.error("[setMemberAttendance] session select", sessionErr);
    return fail("db_error");
  }
  if (!session) return fail("session_not_found");

  // 3. Bestaande check_in op (sessie, profiel): uniek per index.
  const { data: existingCi } = await admin
    .from("check_ins")
    .select("id, booking_id")
    .eq("session_id", input.sessionId)
    .eq("profile_id", booking.profile_id)
    .maybeSingle();
  const ci = (existingCi ?? null) as { id: string; booking_id: string | null } | null;

  // 4. Bestaande strike op de booking.
  const { data: existingStrike } = await admin
    .from("no_show_strikes")
    .select("id")
    .eq("booking_id", booking.id)
    .maybeSingle();
  const strikeId = (existingStrike as { id: string } | null)?.id ?? null;

  const accessType = accessTypeForBooking(booking);
  const nowIso = new Date().toISOString();
  const base = {
    ok: true as const,
    bookingId: booking.id,
    profileId: booking.profile_id,
    accessType,
  };

  if (input.present) {
    let checkInId = ci?.id ?? null;
    let created = false;
    if (!ci) {
      const { data: inserted, error: insertErr } = await admin
        .from("check_ins")
        .insert({
          profile_id: booking.profile_id,
          session_id: input.sessionId,
          booking_id: booking.id,
          check_in_method: method,
          access_type: accessType,
          pillar: session.pillar,
          checked_in_at: nowIso,
          checked_in_by: input.actor.userId,
        })
        .select("id")
        .single();
      if (insertErr && (insertErr as { code?: string }).code !== "23505") {
        console.error("[setMemberAttendance] check_in insert", insertErr);
        return fail("db_error");
      }
      if (insertErr) {
        // Race: een andere schrijver was ons net voor. Dan is de rij er en
        // is dit een no-op op de rij zelf.
        const { data: raced } = await admin
          .from("check_ins")
          .select("id")
          .eq("session_id", input.sessionId)
          .eq("profile_id", booking.profile_id)
          .maybeSingle();
        checkInId = (raced as { id: string } | null)?.id ?? null;
      } else {
        checkInId = (inserted as { id: string }).id;
        created = true;
      }
    } else if (!ci.booking_id) {
      // Verschil 1: bestaande losse rij bijkoppelen aan de booking.
      const { error } = await admin
        .from("check_ins")
        .update({ booking_id: booking.id })
        .eq("id", ci.id);
      if (error) console.error("[setMemberAttendance] booking_id koppelen", error);
    }

    const bookingDirty = booking.attended_at === null || booking.no_show_at !== null;
    if (bookingDirty) {
      const { error } = await admin
        .from("bookings")
        .update({ no_show_at: null, attended_at: nowIso })
        .eq("id", booking.id);
      if (error) {
        console.error("[setMemberAttendance] bookings update", error);
        return fail("db_error");
      }
    }

    // Verschil 4: aanwezig overrulet een eerdere no-show.
    if (strikeId) {
      const { error } = await admin.from("no_show_strikes").delete().eq("id", strikeId);
      if (error) console.error("[setMemberAttendance] strike delete", error);
    }

    if (created) {
      // Verschil 5: subject booking, actor uit de gate, alleen bij een echte rij.
      await deps.emit({
        type: "checkin.recorded",
        actorType: input.actor.actorType,
        actorId: input.actor.userId,
        subjectType: "booking",
        subjectId: booking.id,
        payload: {
          profile_id: booking.profile_id,
          session_id: input.sessionId,
          booking_id: booking.id,
          access_type: accessType,
          method,
          source,
        },
      });
    }

    return {
      ...base,
      changed: created || bookingDirty || strikeId !== null,
      checkInId,
    };
  }

  // present: false, terug naar neutraal.
  let removed = false;
  if (ci) {
    const { error } = await admin.from("check_ins").delete().eq("id", ci.id);
    if (error) {
      console.error("[setMemberAttendance] check_in delete", error);
      return fail("db_error");
    }
    removed = true;
  }

  const bookingDirty = booking.attended_at !== null || booking.no_show_at !== null;
  if (bookingDirty) {
    const { error } = await admin
      .from("bookings")
      .update({ no_show_at: null, attended_at: null })
      .eq("id", booking.id);
    if (error) {
      console.error("[setMemberAttendance] bookings update", error);
      return fail("db_error");
    }
  }

  const dropStrike = strikeId !== null && !input.keepStrike;
  if (dropStrike) {
    const { error } = await admin.from("no_show_strikes").delete().eq("id", strikeId);
    if (error) console.error("[setMemberAttendance] strike delete", error);
  }

  if (removed) {
    await deps.emit({
      type: "checkin.reverted",
      actorType: input.actor.actorType,
      actorId: input.actor.userId,
      subjectType: "booking",
      subjectId: booking.id,
      payload: {
        profile_id: booking.profile_id,
        session_id: input.sessionId,
        booking_id: booking.id,
        access_type: accessType,
        source,
      },
    });
  }

  return {
    ...base,
    changed: removed || bookingDirty || dropStrike,
    checkInId: null,
  };
}
