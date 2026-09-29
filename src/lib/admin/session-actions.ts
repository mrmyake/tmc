"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import { createClient } from "@/lib/supabase/server";
import { finalizeTrialBookingCancellation, type CancelCoreResult } from "@/lib/trial-booking-cancel";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { amsterdamYmd, zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import {
  notifySessionCancelled,
  notifySessionRescheduled,
  type CancelledSessionResult,
  type RescheduledSessionResult,
} from "./session-override-notify";

export type AdminActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

function revalidateAll() {
  revalidatePath("/app/admin");
  revalidatePath("/app/admin/rooster");
  revalidatePath("/app/rooster");
  revalidatePath("/app/boekingen");
  revalidatePath("/app/trainer");
  revalidatePath("/app/trainer/sessies");
  revalidatePath("/app");
  revalidatePath("/rooster");
  revalidatePath("/kiosk");
}

/**
 * Weigeringen van de session-override-RPC's (spec-session-overrides.md) naar
 * Nederlandse meldingen voor Marlon.
 */
function overrideRefusal(reason: string | undefined): string {
  switch (reason) {
    case "session_not_found":
      // COPY: confirm met Marlon
      return "Sessie niet gevonden.";
    case "already_cancelled":
      // COPY: confirm met Marlon
      return "Deze sessie is al geannuleerd.";
    case "not_scheduled":
      // COPY: confirm met Marlon
      return "Deze sessie staat niet meer op gepland.";
    case "session_started":
      // COPY: confirm met Marlon
      return "Deze les is al begonnen of voorbij. Wijzigen kan alleen voor lessen die nog moeten beginnen.";
    case "missing_reason":
      // COPY: confirm met Marlon
      return "Geef een reden op.";
    case "has_check_ins":
      // COPY: confirm met Marlon
      return "Er zijn al leden ingecheckt voor deze les. De tijd kan niet meer verschuiven.";
    case "new_start_in_past":
      // COPY: confirm met Marlon
      return "De nieuwe starttijd ligt in het verleden.";
    case "different_day":
      // COPY: confirm met Marlon
      return "Verschuiven kan alleen binnen dezelfde dag.";
    case "invalid_duration":
      // COPY: confirm met Marlon
      return "Duur moet tussen 5 en 600 minuten liggen.";
    case "no_change":
      // COPY: confirm met Marlon
      return "Er is niets veranderd.";
    case "trainer_not_found":
      // COPY: confirm met Marlon
      return "Trainer niet gevonden.";
    case "trainer_inactive":
      // COPY: confirm met Marlon
      return "Trainer is niet actief.";
    case "missing_date":
      // COPY: confirm met Marlon
      return "Kies een datum.";
    default:
      // COPY: confirm met Marlon
      return "Dat lukte niet. Probeer het opnieuw.";
  }
}

// ----------------------------------------------------------------------------
// Update a session: trainer / capacity / notes
// ----------------------------------------------------------------------------

interface UpdateSessionInput {
  id: string;
  trainerId?: string;
  /**
   * Alleen bij een trainerwissel: Marlon heeft de waarschuwing "pijler niet
   * in de specialisaties" gezien en bevestigd. Gaat mee in het event.
   */
  pillarWarningOverridden?: boolean;
  /** NULL betekent onbeperkt (alleen kettlebell); undefined betekent niet wijzigen. */
  capacity?: number | null;
  notes?: string | null;
  blocksFreeTraining?: boolean;
}

export async function adminUpdateSession(
  input: UpdateSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();

  const { data: existing, error: fetchErr } = await admin
    .from("class_sessions")
    .select("id, status, capacity, trainer_id")
    .eq("id", input.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { ok: false, message: "Sessie niet gevonden." };
  }
  if (existing.status === "cancelled") {
    return { ok: false, message: "Deze sessie is al geannuleerd." };
  }

  // Trainerwissel: eenmalige override via de admin-RPC (is_admin, rijlock,
  // alleen lessen die nog moeten beginnen, event in dezelfde transactie).
  // Eerst, zodat een weigering de rest van het formulier niet half opslaat.
  let trainerReplaced = false;
  if (input.trainerId !== undefined && input.trainerId !== existing.trainer_id) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_replace_session_trainer", {
      p_session_id: input.id,
      p_trainer_id: input.trainerId,
      p_pillar_warning_overridden: input.pillarWarningOverridden ?? false,
    });
    if (error) {
      console.error("[adminUpdateSession] trainer rpc failed", error);
      return { ok: false, message: "Trainer vervangen lukte niet. Probeer het opnieuw." };
    }
    const res = data as { ok: boolean; reason?: string };
    if (!res.ok) return { ok: false, message: overrideRefusal(res.reason) };
    trainerReplaced = true;
  }

  const patch: Record<string, unknown> = {};

  if (input.capacity !== undefined) {
    if (input.capacity !== null) {
      if (!Number.isInteger(input.capacity) || input.capacity < 1) {
        // COPY: confirm met Marlon
        return {
          ok: false,
          message: "Capaciteit moet minstens 1 zijn, of leeg voor onbeperkt.",
        };
      }
      // Bewust geen minimum op de huidige bezetting: bij bv. kapot materiaal
      // moet de capaciteit onder de bezetting kunnen zakken en handelt Marlon
      // de overboeking zelf af. SessionEditPanel waarschuwt inline; de
      // boek-gates weigeren nieuwe boekingen zodra bezetting >= capaciteit.
    }
    patch.capacity = input.capacity;
  }

  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() || null;
  }

  if (input.blocksFreeTraining !== undefined) {
    patch.blocks_free_training = input.blocksFreeTraining;
  }

  if (Object.keys(patch).length === 0) {
    revalidateAll();
    return trainerReplaced
      ? // COPY: confirm met Marlon
        { ok: true, message: "Trainer vervangen voor deze les." }
      : { ok: true, message: "Geen wijzigingen." };
  }

  const { error } = await admin
    .from("class_sessions")
    .update(patch)
    .eq("id", input.id);

  if (error) {
    console.error("[adminUpdateSession] update failed", error);
    return { ok: false, message: "Bijwerken lukte niet. Probeer het opnieuw." };
  }

  await emitEvent({
    type: "session.updated",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "session",
    subjectId: input.id,
    payload: {
      session_id: input.id,
      changed: Object.keys(patch),
      capacity: patch.capacity ?? null,
      blocks_free_training: patch.blocks_free_training ?? null,
    },
  });

  revalidateAll();
  return { ok: true, message: "Sessie bijgewerkt." };
}

// ----------------------------------------------------------------------------
// Cancel a session: een les, of alle lessen op een datum
// ----------------------------------------------------------------------------

interface CancelSessionInput {
  id: string;
  reason: string;
}

interface TrialOutcome {
  cancelled: number;
  refundsRequested: number;
  refundsFailed: number;
}

/**
 * Na de atomaire annulering in de RPC: proeflessen (Mollie-refund kan niet in
 * de transactie), meldingen, ntfy. Gedeeld door de losse en de dag-annulering.
 */
async function afterSessionsCancelled(
  results: CancelledSessionResult[],
  reason: string,
): Promise<TrialOutcome> {
  const trials: TrialOutcome = { cancelled: 0, refundsRequested: 0, refundsFailed: 0 };
  for (const r of results) {
    const t = await cancelTrialBookingsForSession({
      sessionId: r.session_id,
      reason: `Sessie geannuleerd: ${reason}`,
    });
    trials.cancelled += t.cancelled;
    trials.refundsRequested += t.refundsRequested;
    trials.refundsFailed += t.refundsFailed;
  }

  const bookings = results.reduce((n, r) => n + r.bookings.length, 0);
  const waitlist = results.reduce((n, r) => n + r.waitlist.length, 0);
  const guests = results.reduce((n, r) => n + r.guests.length, 0);
  await sendNotification(
    results.length === 1 ? "Sessie geannuleerd" : `${results.length} sessies geannuleerd`,
    `${bookings} boeking(en), ${waitlist} wachtlijstplek(ken), ${guests} gast(en) en ${trials.cancelled} proefles(sen) geannuleerd, reden: ${reason}`,
    "warning",
  );

  // Meldingen na het antwoord aan Marlon; fouten worden alleen gelogd.
  for (const r of results) {
    void notifySessionCancelled(r, reason);
  }

  return trials;
}

function cancelSummary(results: CancelledSessionResult[], trials: TrialOutcome): string {
  const bookings = results.reduce((n, r) => n + r.bookings.length, 0);
  const waitlist = results.reduce((n, r) => n + r.waitlist.length, 0);
  const guests = results.reduce((n, r) => n + r.guests.length, 0);
  const parts: string[] = [];
  if (bookings > 0) {
    // COPY: confirm met Marlon
    parts.push(`${bookings} boeking(en) geannuleerd en tegoed teruggezet`);
  }
  if (waitlist > 0) {
    // COPY: confirm met Marlon
    parts.push(`${waitlist} wachtlijstplek(ken) vervallen`);
  }
  if (guests > 0) {
    // COPY: confirm met Marlon
    parts.push(`${guests} gast(en) afgemeld en gastpas teruggezet`);
  }
  if (trials.cancelled > 0) {
    // COPY: confirm met Marlon
    parts.push(
      `${trials.cancelled} proefles(sen) geannuleerd` +
        (trials.refundsRequested > 0
          ? `, ${trials.refundsRequested} terugbetaling(en) ingediend`
          : ""),
    );
  }
  if (trials.refundsFailed > 0) {
    // COPY: confirm met Marlon
    parts.push(
      `${trials.refundsFailed} terugbetaling(en) niet bij Mollie aangekomen, opnieuw proberen via de sessiepagina`,
    );
  }
  return parts.length === 0 ? "" : ` ${parts.join(". ")}.`;
}

export async function adminCancelSession(
  input: CancelSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const reason = input.reason?.trim();
  if (!reason) return { ok: false, message: "Geef een reden op." };

  // Boekingen, tegoed, wachtlijst, gastboekingen, gastpassen, sessiestatus en
  // events in een transactie (tmc.admin_cancel_class_session). Sessie-client:
  // is_admin() binnenin.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_class_session", {
    p_session_id: input.id,
    p_reason: reason,
  });
  if (error) {
    console.error("[adminCancelSession] rpc failed", error);
    return { ok: false, message: "Annuleren lukte niet. Probeer het opnieuw." };
  }
  const result = data as ({ ok: true } & CancelledSessionResult) | { ok: false; reason?: string };
  if (!result.ok) return { ok: false, message: overrideRefusal(result.reason) };

  const trials = await afterSessionsCancelled([result], reason);

  revalidateAll();
  // COPY: confirm met Marlon
  return { ok: true, message: `Sessie geannuleerd.${cancelSummary([result], trials)}` };
}

export interface DayCancellationPreview {
  date: string;
  sessionCount: number;
  bookingCount: number;
  waitlistCount: number;
  guestCount: number;
  trialCount: number;
  startedOrPastCount: number;
  sessions: Array<{ id: string; startAt: string; className: string | null }>;
}

export async function adminPreviewDayCancellation(
  isoDate: string,
): Promise<{ ok: true; preview: DayCancellationPreview } | { ok: false; message: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Ongeldige datum." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_preview_day_cancellation", {
    p_date: isoDate,
  });
  if (error || !data) {
    console.error("[adminPreviewDayCancellation] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Het overzicht laden lukte niet." };
  }
  const d = data as {
    date: string;
    session_count: number;
    booking_count: number;
    waitlist_count: number;
    guest_count: number;
    trial_count: number;
    started_or_past_count: number;
    sessions: Array<{ id: string; start_at: string; class_name: string | null }>;
  };
  return {
    ok: true,
    preview: {
      date: d.date,
      sessionCount: d.session_count,
      bookingCount: d.booking_count,
      waitlistCount: d.waitlist_count,
      guestCount: d.guest_count,
      trialCount: d.trial_count,
      startedOrPastCount: d.started_or_past_count,
      sessions: d.sessions.map((s) => ({
        id: s.id,
        startAt: s.start_at,
        className: s.class_name,
      })),
    },
  };
}

export async function adminCancelDay(input: {
  isoDate: string;
  reason: string;
}): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const reason = input.reason?.trim();
  if (!reason) return { ok: false, message: "Geef een reden op." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.isoDate)) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Ongeldige datum." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cancel_class_sessions_on_date", {
    p_date: input.isoDate,
    p_reason: reason,
  });
  if (error) {
    console.error("[adminCancelDay] rpc failed", error);
    return { ok: false, message: "Annuleren lukte niet. Probeer het opnieuw." };
  }
  const result = data as
    | { ok: true; sessions: CancelledSessionResult[] }
    | { ok: false; reason?: string };
  if (!result.ok) return { ok: false, message: overrideRefusal(result.reason) };

  if (result.sessions.length === 0) {
    // COPY: confirm met Marlon
    return { ok: true, message: "Er waren geen lessen meer om te annuleren op deze dag." };
  }

  const trials = await afterSessionsCancelled(result.sessions, reason);

  revalidateAll();
  return {
    ok: true,
    // COPY: confirm met Marlon
    message: `${result.sessions.length} les(sen) geannuleerd.${cancelSummary(result.sessions, trials)}`,
  };
}

/**
 * Alle open proeflessen van een sessie annuleren, via dezelfde RPC als de
 * losse admin-annulering (sessie-gebonden client: is_admin binnenin).
 * Een mislukte refund of mail blokkeert de rest niet. Loopt na de
 * sessie-annulering, zodat een betaling die nu nog binnenkomt de
 * webhook-bijvangst treft.
 */
async function cancelTrialBookingsForSession(args: {
  sessionId: string;
  reason: string;
}): Promise<TrialOutcome> {
  const out: TrialOutcome = { cancelled: 0, refundsRequested: 0, refundsFailed: 0 };
  try {
    const admin = createAdminClient();
    const { data: trials } = await admin
      .from("trial_bookings")
      .select("id")
      .eq("session_id", args.sessionId)
      .eq("status", "paid");
    if (!trials || trials.length === 0) return out;

    const supabase = await createClient();
    for (const t of trials) {
      const { data, error } = await supabase.rpc("admin_cancel_trial_booking", {
        p_id: t.id,
        p_reason: args.reason,
      });
      if (error) {
        console.error("[adminCancelSession] trial cancel rpc failed", t.id, error);
        continue;
      }
      const result = data as CancelCoreResult;
      if (!result.ok) {
        console.error("[adminCancelSession] trial cancel refused", t.id, result.reason);
        continue;
      }
      out.cancelled += 1;
      const outcome = await finalizeTrialBookingCancellation(result, args.reason);
      if (result.refund_id) {
        if (outcome.refundOk) out.refundsRequested += 1;
        else out.refundsFailed += 1;
      }
    }
  } catch (err) {
    console.error("[adminCancelSession] trial bookings step failed", err);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Reschedule a session: starttijd verschuiven binnen dezelfde dag
// ----------------------------------------------------------------------------

interface RescheduleSessionInput {
  id: string;
  /** Nieuwe starttijd als Amsterdamse wandkloktijd "HH:mm", op dezelfde dag. */
  startTime: string;
  /** Nieuwe duur in minuten; weglaten houdt de huidige duur. */
  durationMinutes?: number;
}

export async function adminRescheduleSession(
  input: RescheduleSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(input.startTime ?? "");
  if (!m) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Starttijd moet HH:mm zijn." };
  }
  if (
    input.durationMinutes !== undefined &&
    (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5)
  ) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Duur moet een heel aantal minuten zijn, minstens 5." };
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("class_sessions")
    .select("id, start_at")
    .eq("id", input.id)
    .maybeSingle();
  if (!session) return { ok: false, message: "Sessie niet gevonden." };

  // Nieuwe wandkloktijd op de huidige Amsterdamse dag van de les. De RPC
  // controleert zelf ook dat de dag gelijk blijft.
  const ymd = amsterdamYmd(new Date(session.start_at));
  const newStart = zonedWallClockToUtc(ymd.year, ymd.month, ymd.day, Number(m[1]), Number(m[2]));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reschedule_class_session", {
    p_session_id: input.id,
    p_new_start_at: newStart.toISOString(),
    p_duration_min: input.durationMinutes ?? null,
  });
  if (error) {
    console.error("[adminRescheduleSession] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Tijd wijzigen lukte niet. Probeer het opnieuw." };
  }
  const result = data as ({ ok: true } & RescheduledSessionResult) | { ok: false; reason?: string };
  if (!result.ok) return { ok: false, message: overrideRefusal(result.reason) };

  void notifySessionRescheduled(result);

  revalidateAll();
  const n = result.bookings.length;
  return {
    ok: true,
    message:
      n === 0
        ? // COPY: confirm met Marlon
          "Tijd gewijzigd voor deze les."
        : // COPY: confirm met Marlon
          `Tijd gewijzigd voor deze les. ${n} lid/leden krijgen een mail en push met de nieuwe tijd.`,
  };
}

// ----------------------------------------------------------------------------
// Create an ad-hoc session
// ----------------------------------------------------------------------------

interface CreateSessionInput {
  classTypeId: string;
  trainerId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  notes?: string;
  blocksFreeTraining?: boolean;
}

export async function adminCreateSession(
  input: CreateSessionInput,
): Promise<AdminActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.classTypeId || !input.trainerId || !input.startAt || !input.endAt) {
    return { ok: false, message: "Vul alle velden in." };
  }
  if (
    input.capacity !== null &&
    (!Number.isInteger(input.capacity) || input.capacity < 1)
  ) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      message: "Capaciteit moet minstens 1 zijn, of leeg voor onbeperkt.",
    };
  }

  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "Ongeldige datum." };
  }
  if (end <= start) {
    return { ok: false, message: "Einde moet na start liggen." };
  }

  const admin = createAdminClient();

  const [classTypeRes, trainerRes] = await Promise.all([
    admin
      .from("class_types")
      .select("id, pillar, age_category, is_active")
      .eq("id", input.classTypeId)
      .maybeSingle(),
    admin
      .from("trainers")
      .select("id, is_active")
      .eq("id", input.trainerId)
      .maybeSingle(),
  ]);

  const classType = classTypeRes.data;
  if (!classType) return { ok: false, message: "Lestype niet gevonden." };
  if (!classType.is_active) {
    return { ok: false, message: "Lestype is niet actief." };
  }
  const trainer = trainerRes.data;
  if (!trainer) return { ok: false, message: "Trainer niet gevonden." };
  if (!trainer.is_active) {
    return { ok: false, message: "Trainer is niet actief." };
  }

  const { data, error } = await admin
    .from("class_sessions")
    .insert({
      class_type_id: input.classTypeId,
      trainer_id: input.trainerId,
      pillar: classType.pillar,
      age_category: classType.age_category,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      capacity: input.capacity,
      status: "scheduled",
      notes: input.notes?.trim() || null,
      template_id: null,
      blocks_free_training: input.blocksFreeTraining ?? false,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[adminCreateSession] insert failed", error);
    return { ok: false, message: "Aanmaken lukte niet." };
  }

  await emitEvent({
    type: "session.created",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "session",
    subjectId: data.id,
    payload: {
      session_id: data.id,
      class_type_id: input.classTypeId,
      trainer_id: input.trainerId,
      pillar: classType.pillar,
      start_at: start.toISOString(),
      capacity: input.capacity,
    },
  });

  revalidateAll();

  return { ok: true, message: "Sessie aangemaakt.", id: data.id };
}
