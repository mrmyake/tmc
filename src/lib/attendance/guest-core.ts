import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmitEventInput } from "@/lib/events/emit";

/**
 * Kern van de aanwezigheid van gasten (tmc.guest_bookings.status), los van de
 * autorisatie. Twee ingangen: markGuestAttendance (deelnemerslijst, admin of
 * trainer van de sessie) en de cron close-sessions (fase-2-checkin-model.md
 * PR 4), die elke gast die bij het afsluiten nog op booked staat op attended
 * zet. Een gast heeft geen profiel en dus geen check_ins-rij; de status op de
 * rij is de enige aanwezigheidsregistratie. Geen strikes voor gasten; de
 * 2x-per-kwartaal-rem in bookGuest telt booked plus attended, dus deze
 * overgang verandert het quotum niet.
 *
 * booked, attended en no_show zijn onderling omkeerbaar; cancelled wordt met
 * rust gelaten.
 */

export type GuestAttendanceTarget = "attended" | "booked" | "no_show";

export interface GuestAttendanceInput {
  guestBookingId: string;
  status: GuestAttendanceTarget;
}

export type GuestAttendanceActor =
  | { userId: string; role: "admin" | "trainer" }
  | { userId: null; role: "system" };

export interface GuestAttendanceDeps {
  admin: SupabaseClient;
  emit: (input: EmitEventInput) => Promise<boolean>;
}

export type GuestAttendanceResult =
  | { ok: true; message: string; changed: number }
  | { ok: false; message: string };

export async function setGuestAttendanceCore(
  deps: GuestAttendanceDeps,
  actor: GuestAttendanceActor,
  sessionId: string,
  updates: GuestAttendanceInput[],
  source: "attendance" | "auto_close" = "attendance",
): Promise<GuestAttendanceResult> {
  if (updates.length === 0) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Geen wijzigingen.", changed: 0 };
  }

  const ids = updates.map((u) => u.guestBookingId);
  const { data: rows, error: fetchErr } = await deps.admin
    .from("guest_bookings")
    .select("id, session_id, status")
    .in("id", ids);

  if (fetchErr) {
    console.error("[setGuestAttendanceCore] fetch failed", fetchErr);
    // COPY: confirm met Marlon
    return { ok: false, message: "Kon gastboekingen niet laden." };
  }

  const byId = new Map(
    (rows ?? []).map((g) => [
      g.id,
      { sessionId: g.session_id as string, status: g.status as string },
    ]),
  );

  let changed = 0;
  for (const u of updates) {
    const cur = byId.get(u.guestBookingId);
    if (!cur) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Gastboeking niet gevonden." };
    }
    if (cur.sessionId !== sessionId) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Gastboeking hoort niet bij deze sessie." };
    }
    if (cur.status === "cancelled") continue;
    if (cur.status === u.status) continue;

    // Statusguard in de WHERE: een gelijktijdige annulering wint.
    const { data: updated, error: updateErr } = await deps.admin
      .from("guest_bookings")
      .update({ status: u.status })
      .eq("id", u.guestBookingId)
      .in("status", ["booked", "attended", "no_show"])
      .select("id");

    if (updateErr) {
      console.error("[setGuestAttendanceCore] update failed", updateErr);
      // COPY: confirm met Marlon
      return { ok: false, message: "Bijwerken lukte niet." };
    }
    if ((updated?.length ?? 0) === 0) continue;
    changed++;

    // Geen gast-PII in de payload (zelfde afweging als guest.booked).
    await deps.emit({
      type: "guest.attendance_marked",
      actorType: actor.role,
      actorId: actor.userId,
      subjectType: "guest_booking",
      subjectId: u.guestBookingId,
      payload: {
        session_id: sessionId,
        guest_booking_id: u.guestBookingId,
        status: u.status,
        previous_status: cur.status,
        source,
      },
    });
  }

  // COPY: confirm met Marlon
  return { ok: true, message: "Aanwezigheid opgeslagen.", changed };
}
