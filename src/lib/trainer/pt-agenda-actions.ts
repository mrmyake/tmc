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
 * BELANGRIJK GAT (zie PR-omschrijving): mark_pt_attendance is uitsluitend
 * tmc.is_admin()-gated (geen staff-tak), en cancel_pt/reschedule_pt
 * gate'en boeking-zichtbaarheid op `profile_id = auth.uid() OR is_admin()`
 * — een trainer die niet de klant zelf is krijgt dus `not_found`,
 * ongeacht de C3-staff-verruiming op de tijd-overrides. Deze drie acties
 * zijn dus in de praktijk nog admin-only. De wrappers hieronder checken
 * `actorType === "admin"` VOORDAT de RPC wordt aangeroepen, zodat een
 * trainer een eerlijke melding krijgt in plaats van een misleidende
 * "bestaat niet"-foutmelding. Kleine Fable-vervolgmigratie nodig om dit
 * naar staff te verruimen (zie PR-omschrijving).
 */

// COPY: confirm met Marlon
const STAFF_ONLY_MESSAGE =
  "Deze actie is voorlopig alleen voor beheer. Trainer-toegang op annuleren, verzetten en aanwezigheid volgt in een kleine vervolgstap.";

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
        pt_bookings(id, status, profile_id, introducee_name, profile:profiles(first_name, last_name)),
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
 * UI die mark_pt_attendance aanroept); admin-only, zie fileheader.
 */
export async function markPtAttendance(
  ptBookingId: string,
  status: "attended" | "no_show",
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  if (gate.actorType !== "admin") {
    return { ok: false, message: STAFF_ONLY_MESSAGE };
  }

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
      not_found: "Deze boeking bestaat niet (meer).",
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
    actorType: "admin",
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
 * hergebruiken, alleen de gate + de eerlijke trainer-melding zijn nieuw.
 */
export async function cancelPtBookingAsStaff(
  ptBookingId: string,
): Promise<PtAgendaActionResult> {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };
  if (gate.actorType !== "admin") {
    return { ok: false, message: STAFF_ONLY_MESSAGE };
  }
  return cancelPtBooking(ptBookingId);
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
  if (gate.actorType !== "admin") {
    return { ok: false, message: STAFF_ONLY_MESSAGE };
  }
  return reschedulePtBooking(ptBookingId, newStartAt, opts);
}
