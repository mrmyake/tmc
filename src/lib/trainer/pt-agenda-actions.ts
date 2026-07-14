"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import { emitEvent } from "@/lib/events/emit";
import {
  cancelPtBooking,
  reschedulePtBooking,
  type PtManageResult,
} from "@/lib/member/pt-manage-actions";
import type {
  AgendaBookingStatus,
  AgendaSessionData,
} from "@/app/app/trainer/agenda/_components/types";

/**
 * PT-agenda PR D: leest sessies + boekingen + klantnaam voor de
 * trainer-agenda, en biedt staff-facing wrappers om aanwezigheid te
 * markeren, te annuleren en te verzetten.
 *
 * Leesactie via service-role: dezelfde vertrouwenslaag als trainer/page.tsx
 * en het C2/C3 boek-scherm. Nodig omdat `profiles_trainer_read_relevant`
 * (bestaande RLS-policy) alleen groepsles-boekingen dekt, geen
 * pt_bookings — een trainer kan een PT-klant-profiel dus niet via de
 * gewone RLS-client lezen. De toegangscontrole is hier de
 * requireTrainerOrAdmin-gate, niet RLS.
 *
 * C4 (20260802-migratie): de drie beheer-RPC's zijn verruimd naar de
 * eigen-sessie-trainer — mark_pt_attendance accepteert staff met een
 * eigen-sessie-grens, en cancel_pt/reschedule_pt zien een boeking ook
 * als die op een sessie van de eigen actieve trainers-rij staat. De
 * wrappers gate'en dus alleen nog op requireTrainerOrAdmin; de RPC zelf
 * bewaakt de eigen-sessie-grens (andermans sessie blijft `not_found`).
 * Nieuw in C4: createPtBlock/deletePtBlock (ad-hoc tijd blokkeren,
 * kind='block', geen klant en geen credit).
 *
 * PR G (20260803-migratie): completePtIntake/cancelPtIntake voor
 * kind='intake' (account-loos en gratis, dus buiten de boeking-RPC's om);
 * zelfde staff-gate en eigen-sessie-grens, geen credit en geen geld.
 *
 * PR J (20260804-migratie): cancel_pt kent nu een expliciete,
 * staff-only restitutie-keuze (p_with_restitution). getAgendaSessions
 * geeft credits_used_from door zodat de UI weet of er uberhaupt een
 * credit gedebiteerd is (en dus een keuze moet tonen); de wrapper
 * cancelPtBookingAsStaff geeft die keuze door aan cancelPtBooking.
 */

interface SessionRow {
  id: string;
  trainer_id: string;
  kind: "bookable" | "intake" | "block";
  format: "one_on_one" | "duo" | "small_group_4" | null;
  mode: "studio" | "online" | null;
  status: "scheduled" | "cancelled" | "completed";
  start_at: string;
  end_at: string;
  duration_min: number;
  prospect_name: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  program_id: string | null;
  pt_bookings: Array<{
    id: string;
    status: AgendaBookingStatus;
    profile_id: string;
    introducee_name: string | null;
    credits_used_from: string | null;
    profile: { first_name: string; last_name: string } | null;
  }> | null;
  pt_programs: { type: "studio" | "online"; total_sessions: number } | null;
}

export async function getAgendaSessions(
  trainerId: string,
  fromIso: string,
  toIso: string,
): Promise<AgendaSessionData[]> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pt_sessions")
    .select(
      `
        id, trainer_id, kind, format, mode, status, start_at, end_at, duration_min,
        prospect_name, prospect_email, prospect_phone, program_id,
        pt_bookings(id, status, profile_id, introducee_name, credits_used_from, profile:profiles(first_name, last_name)),
        pt_programs(type, total_sessions)
      `,
    )
    .eq("trainer_id", trainerId)
    .gte("start_at", fromIso)
    .lt("start_at", toIso)
    .order("start_at", { ascending: true })
    .returns<SessionRow[]>();

  if (error) {
    console.error("[getAgendaSessions]", error);
    return [];
  }

  return (data ?? []).map((s) => {
    const bookingRow = s.pt_bookings?.[0] ?? null;
    return {
      id: s.id,
      trainerId: s.trainer_id,
      kind: s.kind,
      format: s.format,
      mode: s.mode,
      status: s.status,
      startAt: s.start_at,
      endAt: s.end_at,
      durationMin: s.duration_min,
      booking: bookingRow
        ? {
            id: bookingRow.id,
            status: bookingRow.status,
            profileId: bookingRow.profile_id,
            firstName: bookingRow.profile?.first_name ?? "",
            lastName: bookingRow.profile?.last_name ?? "",
            introduceeName: bookingRow.introducee_name,
            usedCredit: bookingRow.credits_used_from !== null,
          }
        : null,
      prospect: s.prospect_name
        ? {
            name: s.prospect_name,
            email: s.prospect_email ?? "",
            phone: s.prospect_phone,
          }
        : null,
      program: s.pt_programs
        ? {
            type: s.pt_programs.type,
            totalSessions: s.pt_programs.total_sessions,
          }
        : null,
    };
  });
}

export type PtAgendaActionResult = PtManageResult;

/**
 * Aanwezigheid markeren. Geen bestaande wrapper elders (dit is de eerste
 * UI die mark_pt_attendance aanroept); staff, met de eigen-sessie-grens
 * in de RPC (zie fileheader).
 */
export async function markPtAttendance(
  ptBookingId: string,
  status: "attended" | "no_show",
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("mark_pt_attendance", {
    p_pt_booking_id: ptBookingId,
    p_status: status,
  });
  if (error) {
    console.error("[markPtAttendance] rpc", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanwezigheid markeren lukte niet." };
  }
  if (!result?.ok) {
    const reason = result?.reason as string | undefined;
    const copy: Record<string, string> = {
      // COPY: confirm met Marlon
      not_found: "Deze boeking bestaat niet (meer) of hoort niet bij jouw agenda.",
      not_markable: "Deze boeking heeft geen aanwezigheid om te markeren.",
      session_not_started: "Deze sessie is nog niet begonnen.",
      invalid_status: "Ongeldige status.",
    };
    return {
      ok: false,
      message: copy[reason ?? ""] ?? "Aanwezigheid markeren lukte niet.",
    };
  }

  await emitEvent({
    type: "pt_booking.attendance_marked",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_booking",
    subjectId: ptBookingId,
    payload: { status, previous_status: result.previous_status },
  });

  return { ok: true };
}

/**
 * Staff-wrapper om cancelPtBooking (src/lib/member/pt-manage-actions.ts,
 * gedeeld met PR E): dezelfde event-emissie en trainer-notificatie
 * hergebruiken; de RPC bewaakt de eigen-sessie-grens.
 */
export async function cancelPtBookingAsStaff(
  ptBookingId: string,
  withRestitution: boolean | undefined,
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  return cancelPtBooking(ptBookingId, withRestitution);
}

/**
 * Staff-wrapper om reschedulePtBooking, zelfde reden als hierboven.
 */
export async function reschedulePtBookingAsStaff(
  ptBookingId: string,
  newStartAt: string,
  opts?: { allowOverlap?: boolean; allowNoTurnaround?: boolean },
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  return reschedulePtBooking(ptBookingId, newStartAt, opts);
}

// COPY: confirm met Marlon
const PT_BLOCK_REASON_COPY: Record<string, string> = {
  trainer_required: "Kies eerst een trainer voor dit blok.",
  not_own_agenda: "Je kunt alleen tijd in je eigen agenda blokkeren.",
  trainer_unavailable: "Deze trainer is niet (meer) actief.",
  invalid_range: "De eindtijd moet na de starttijd liggen (hele minuten).",
  block_in_past: "Dit blok ligt volledig in het verleden.",
  invalid_duration: "Een blok duurt minimaal 1 minuut en maximaal 24 uur.",
  not_found: "Dit blok bestaat niet (meer) of hoort niet bij jouw agenda.",
  pt_overlap: "Dit blok overlapt met een bestaande afspraak.",
  pt_no_turnaround: "Te weinig omkleedtijd rond dit blok.",
};

/**
 * Ad-hoc tijd blokkeren in de agenda (kind='block', geen klant, geen
 * credit). trainerId komt uit de agenda-selectie; de RPC dwingt af dat
 * een niet-admin alleen de eigen agenda blokkeert, dus dit is geen
 * vertrouwde parameter.
 */
export async function createPtBlock(args: {
  trainerId: string;
  startAt: string;
  endAt: string;
  note?: string;
  allowOverlap?: boolean;
  allowNoTurnaround?: boolean;
}): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("create_pt_block", {
    p_start_at: args.startAt,
    p_end_at: args.endAt,
    p_trainer_id: args.trainerId,
    p_note: args.note ?? null,
    p_allow_overlap: args.allowOverlap ?? false,
    p_allow_no_turnaround: args.allowNoTurnaround ?? false,
  });
  if (error) {
    console.error("[createPtBlock] rpc", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Blok toevoegen lukte niet." };
  }
  if (!result?.ok) {
    const reason = result?.reason as string | undefined;
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: PT_BLOCK_REASON_COPY[reason ?? ""] ?? "Blok toevoegen lukte niet.",
      reason,
      conflictAt: result?.conflict_at ?? undefined,
    };
  }

  await emitEvent({
    type: "pt_session.block_created",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_session",
    subjectId: result.pt_session_id,
    payload: {
      trainer_id: result.trainer_id,
      start_at: result.start_at,
      end_at: result.end_at,
    },
  });

  return { ok: true };
}

/** Een blok weer weghalen; alleen kind='block', harde delete in de RPC. */
export async function deletePtBlock(
  ptSessionId: string,
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("delete_pt_block", {
    p_pt_session_id: ptSessionId,
  });
  if (error) {
    console.error("[deletePtBlock] rpc", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Blok verwijderen lukte niet." };
  }
  if (!result?.ok) {
    const reason = result?.reason as string | undefined;
    return {
      ok: false,
      // COPY: confirm met Marlon
      message:
        PT_BLOCK_REASON_COPY[reason ?? ""] ?? "Blok verwijderen lukte niet.",
      reason,
    };
  }

  await emitEvent({
    type: "pt_session.block_deleted",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_session",
    subjectId: ptSessionId,
    payload: {
      trainer_id: result.trainer_id,
      start_at: result.start_at,
      end_at: result.end_at,
    },
  });

  return { ok: true };
}

// COPY: confirm met Marlon
const PT_INTAKE_REASON_COPY: Record<string, string> = {
  not_found: "Deze intake bestaat niet (meer) of hoort niet bij jouw agenda.",
  not_completable: "Deze intake is al afgerond of geannuleerd.",
  not_cancellable: "Deze intake is al afgerond of geannuleerd.",
  session_not_started: "Deze intake is nog niet begonnen.",
};

/**
 * Intake afronden: status naar 'completed' in de RPC. Geen credit en geen
 * geld (een intake is gratis en account-loos); de RPC bewaakt de
 * eigen-sessie-grens en weigert alles wat geen kind='intake' is.
 */
export async function completePtIntake(
  ptSessionId: string,
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("complete_pt_intake", {
    p_pt_session_id: ptSessionId,
  });
  if (error) {
    console.error("[completePtIntake] rpc", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Intake afronden lukte niet." };
  }
  if (!result?.ok) {
    const reason = result?.reason as string | undefined;
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: PT_INTAKE_REASON_COPY[reason ?? ""] ?? "Intake afronden lukte niet.",
      reason,
    };
  }

  await emitEvent({
    type: "pt_intake.completed",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_session",
    subjectId: ptSessionId,
    payload: {
      trainer_id: result.trainer_id,
      start_at: result.start_at,
    },
  });

  return { ok: true };
}

/**
 * Intake annuleren: harde delete in de RPC, zoals delete_pt_block — er is
 * geen boeking en geen betaling, en de agenda-query filtert niet op status,
 * dus alleen een delete haalt de intake echt uit beeld en geeft de tijd
 * vrij. Prospect-gegevens gaan bewust mee weg (AVG). Geen PII in de
 * event-payload.
 */
export async function cancelPtIntake(
  ptSessionId: string,
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc("cancel_pt_intake", {
    p_pt_session_id: ptSessionId,
  });
  if (error) {
    console.error("[cancelPtIntake] rpc", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Intake annuleren lukte niet." };
  }
  if (!result?.ok) {
    const reason = result?.reason as string | undefined;
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: PT_INTAKE_REASON_COPY[reason ?? ""] ?? "Intake annuleren lukte niet.",
      reason,
    };
  }

  await emitEvent({
    type: "pt_intake.cancelled",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "pt_session",
    subjectId: ptSessionId,
    payload: {
      trainer_id: result.trainer_id,
      start_at: result.start_at,
      end_at: result.end_at,
    },
  });

  return { ok: true };
}
