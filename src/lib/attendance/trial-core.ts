import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmitEventInput } from "@/lib/events/emit";

/**
 * Kern van de aanwezigheid van proefgasten (tmc.trial_bookings.status), los
 * van de autorisatie. Twee ingangen delen hem: markTrialAttendance
 * (src/lib/admin/attendance-actions.ts, ingelogde admin of trainer op de
 * sessie-detailpagina's) en kioskMarkTrialAttendance
 * (src/lib/kiosk/trial-attendance-actions.ts, de kiosk-gate: ingelogde staf
 * of gekoppeld apparaat met PIN). Een proefgast heeft geen profiel, dus geen
 * check_ins-rij (profile_id is NOT NULL); de status op de rij is de enige
 * aanwezigheidsregistratie.
 *
 * Overgangen: paid, attended en no_show zijn onderling omkeerbaar (afvinken,
 * terugdraaien, no-show markeren en na afsluiting een no-show alsnog op
 * aanwezig zetten). pending (betaling open) en cancelled zijn nooit af te
 * vinken. In de gratis openingsperiode telt attended en no_show als gebruikte
 * gratis proefles (tmc.book_opening_trial), dus een verkeerde no-show moet
 * terug te draaien zijn. Sinds PR 4 zet de cron close-sessions elke proefles
 * die bij het afsluiten nog op paid staat op attended (source auto_close):
 * geboekt is aanwezig, tenzij de trainer no-show heeft aangetikt.
 */

export type TrialAttendanceTarget = "attended" | "paid" | "no_show";

export interface TrialAttendanceInput {
  trialBookingId: string;
  status: TrialAttendanceTarget;
}

export type TrialAttendanceActor =
  | { userId: string; role: "admin" | "trainer" }
  /** De cron close-sessions (PR 4): paid wordt attended bij het afsluiten. */
  | { userId: null; role: "system" };

export interface TrialAttendanceDeps {
  admin: SupabaseClient;
  emit: (input: EmitEventInput) => Promise<boolean>;
}

export type TrialAttendanceResult =
  | { ok: true; message: string; changed: number }
  | { ok: false; message: string };

const SETTABLE = new Set<string>(["paid", "attended", "no_show"]);

function eventTypeFor(status: TrialAttendanceTarget): EmitEventInput["type"] {
  if (status === "attended") return "trial_booking.attended";
  if (status === "no_show") return "trial_booking.no_show_marked";
  return "trial_booking.attendance_reverted";
}

/**
 * Mag deze actor deze sessie beheren: admin altijd, trainer alleen als hij de
 * trainer van de sessie is (zelfde regel als authorizeForSession).
 */
export async function authorizeActorForSession(
  admin: SupabaseClient,
  actor: TrialAttendanceActor,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actor.role === "admin" || actor.role === "system") return { ok: true };
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, trainer:trainers!inner(profile_id)")
    .eq("id", sessionId)
    .maybeSingle();
  type TrainerRef = { profile_id: string };
  const trainer = (
    Array.isArray(session?.trainer) ? session?.trainer[0] : session?.trainer
  ) as TrainerRef | null | undefined;
  if (!session || trainer?.profile_id !== actor.userId) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geen toegang tot deze sessie." };
  }
  return { ok: true };
}

export async function markTrialAttendanceCore(
  deps: TrialAttendanceDeps,
  actor: TrialAttendanceActor,
  sessionId: string,
  updates: TrialAttendanceInput[],
  source: "attendance" | "kiosk" | "auto_close" = "attendance",
): Promise<TrialAttendanceResult> {
  if (updates.length === 0) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Geen wijzigingen.", changed: 0 };
  }

  const ids = updates.map((u) => u.trialBookingId);
  const { data: rows, error: fetchErr } = await deps.admin
    .from("trial_bookings")
    .select("id, session_id, status")
    .in("id", ids);

  if (fetchErr) {
    console.error("[markTrialAttendanceCore] fetch failed", fetchErr);
    // COPY: confirm met Marlon
    return { ok: false, message: "Kon proeflessen niet laden." };
  }

  const byId = new Map(
    (rows ?? []).map((t) => [
      t.id,
      { sessionId: t.session_id as string, status: t.status as string },
    ]),
  );

  let changed = 0;
  for (const u of updates) {
    const cur = byId.get(u.trialBookingId);
    if (!cur) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Proefles niet gevonden." };
    }
    if (cur.sessionId !== sessionId) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Proefles hoort niet bij deze sessie." };
    }
    if (!SETTABLE.has(u.status)) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Onbekende status." };
    }
    if (!SETTABLE.has(cur.status)) {
      // COPY: confirm met Marlon
      return {
        ok: false,
        message: "Deze proefles is niet af te vinken (nog niet betaald of geannuleerd).",
      };
    }
    if (cur.status === u.status) continue;

    // Statusguard in de WHERE: een gelijktijdige annulering (webhook, cron,
    // admin) wint, en dan laten we de rij met rust in plaats van een
    // geannuleerde proefles weer op attended te zetten.
    const { data: updated, error: updateErr } = await deps.admin
      .from("trial_bookings")
      .update({ status: u.status })
      .eq("id", u.trialBookingId)
      .in("status", ["paid", "attended", "no_show"])
      .select("id");

    if (updateErr) {
      console.error("[markTrialAttendanceCore] update failed", updateErr);
      // COPY: confirm met Marlon
      return { ok: false, message: "Bijwerken lukte niet." };
    }
    if ((updated?.length ?? 0) === 0) {
      // COPY: confirm met Marlon
      return { ok: false, message: "Deze proefles is intussen geannuleerd." };
    }
    changed++;

    // Geen bezoekersgegevens in de payload (zelfde afweging als bij gasten).
    await deps.emit({
      type: eventTypeFor(u.status),
      actorType: actor.role,
      actorId: actor.userId,
      subjectType: "trial_booking",
      subjectId: u.trialBookingId,
      payload: {
        session_id: sessionId,
        trial_booking_id: u.trialBookingId,
        status: u.status,
        previous_status: cur.status,
        source,
      },
    });
  }

  // COPY: confirm met Marlon
  return { ok: true, message: "Aanwezigheid opgeslagen.", changed };
}
