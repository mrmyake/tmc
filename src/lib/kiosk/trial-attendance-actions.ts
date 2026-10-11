"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { asStaffGate, requireKioskActor } from "@/lib/kiosk/gate";
import {
  authorizeActorForSession,
  markTrialAttendanceCore,
  type TrialAttendanceTarget,
} from "@/lib/attendance/trial-core";
import { amsterdamYmd, zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import { bookingTimes } from "@/lib/member/booking-times";
import { isTrialBookingSource, type TrialBookingSource } from "@/lib/opening-trial/rules";
import { isMissingColumnError } from "@/lib/supabase/missing-column";

/**
 * Proefgasten op het kioskpaneel (/kiosk/paneel), naast de ledencheck-in
 * (spec-community-growth.md par. 1 "Gratis openingsperiode"). Gate-eerst,
 * dezelfde kiosk-gate als de check-in-acties: een ingelogde admin of actieve
 * trainer, of een gekoppeld apparaat met een geldige kiosk-sessie (naam plus
 * PIN). Een trainer ziet en beheert alleen proefgasten van eigen sessies
 * (zelfde regel als loadParticipants en markTrialAttendance). Een proefgast
 * heeft geen profiel en dus geen check_ins-rij: afvinken zet
 * trial_bookings.status via de gedeelde kern in src/lib/attendance/trial-core.ts.
 */

export interface KioskTrialGuestRow {
  trialBookingId: string;
  sessionId: string;
  name: string;
  status: "paid" | "attended" | "no_show";
  source: TrialBookingSource;
  isTest: boolean;
  className: string;
  /** Slot (vrij trainen) of sessietijden, ISO. */
  startAt: string;
  endAt: string;
  isSlot: boolean;
}

type RawRow = {
  id: string;
  session_id: string;
  name: string;
  status: string;
  /** Ontbreekt tot de migratie van de gratis openingsperiode is gepusht. */
  source?: string | null;
  trial_code_id?: string | null;
  is_test: boolean;
  slot_start_at: string | null;
  slot_end_at: string | null;
  session:
    | {
        start_at: string;
        end_at: string;
        status: string;
        class_type: { name: string | null } | { name: string | null }[] | null;
        trainer: { profile_id: string | null } | { profile_id: string | null }[] | null;
      }
    | null;
};

function first<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Proefgasten van vandaag (Amsterdamse dag), oplopend op tijd. */
export async function kioskListTodayTrialGuests(): Promise<KioskTrialGuestRow[]> {
  const gate = asStaffGate(await requireKioskActor());
  if (!gate.ok) return [];

  const admin = createAdminClient();
  const now = new Date();
  const { year, month, day } = amsterdamYmd(now);
  const dayStart = zonedWallClockToUtc(year, month, day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  // Ruim op de sessie filteren (een vrij-trainen-dagsessie loopt de hele
  // dag), precies op slot of sessiestart in TS. Zonder de kolom source (tot
  // de migratie is gepusht) dezelfde query met trial_code_id als afleiding.
  const select = (withSource: boolean) => `
        id, session_id, name, status, ${withSource ? "source," : "trial_code_id,"} is_test, slot_start_at, slot_end_at,
        session:class_sessions!inner(
          start_at, end_at, status,
          class_type:class_types(name),
          trainer:trainers(profile_id)
        )
      `;
  const run = (withSource: boolean) =>
    admin
      .from("trial_bookings")
      .select(select(withSource))
      .in("status", ["paid", "attended", "no_show"])
      .lt("session.start_at", dayEnd.toISOString())
      .gte("session.end_at", dayStart.toISOString())
      .returns<RawRow[]>();
  let { data, error } = await run(true);
  if (error && isMissingColumnError(error)) ({ data, error } = await run(false));
  if (error) {
    console.error("[kiosk/trial-guests] query failed", error);
    return [];
  }

  const rows: KioskTrialGuestRow[] = [];
  for (const r of data ?? []) {
    const s = first(r.session);
    if (!s || s.status === "cancelled") continue;
    const trainer = first(s.trainer);
    if (gate.actorType !== "admin" && trainer?.profile_id !== gate.userId) continue;
    const times = bookingTimes(r, s);
    const startMs = new Date(times.startAt).getTime();
    if (startMs < dayStart.getTime() || startMs >= dayEnd.getTime()) continue;
    if (r.status !== "paid" && r.status !== "attended" && r.status !== "no_show") continue;
    const isSlot = Boolean(r.slot_start_at);
    rows.push({
      trialBookingId: r.id,
      sessionId: r.session_id,
      name: r.name,
      status: r.status,
      source: isTrialBookingSource(r.source) ? r.source : r.trial_code_id ? "code" : "paid",
      isTest: r.is_test,
      // COPY: confirm met Marlon
      className: isSlot ? "Vrij trainen" : (first(s.class_type)?.name ?? "Les"),
      startAt: times.startAt,
      endAt: times.endAt,
      isSlot,
    });
  }
  rows.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return rows;
}

/** Afvinken, terugdraaien of no-show markeren vanaf de kiosk. */
export async function kioskMarkTrialAttendance(input: {
  sessionId: string;
  trialBookingId: string;
  status: TrialAttendanceTarget;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const gate = asStaffGate(await requireKioskActor());
  if (!gate.ok) return { ok: false, message: gate.message };
  if (!input.sessionId || !input.trialBookingId) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geen proefles gekozen." };
  }

  const admin = createAdminClient();
  const actor = { userId: gate.userId, role: gate.actorType };
  const allowed = await authorizeActorForSession(admin, actor, input.sessionId);
  if (!allowed.ok) return allowed;

  const res = await markTrialAttendanceCore(
    { admin, emit: emitEvent },
    actor,
    input.sessionId,
    [{ trialBookingId: input.trialBookingId, status: input.status }],
    "kiosk",
  );
  if (!res.ok) return res;

  revalidatePath("/kiosk");
  revalidatePath("/kiosk/paneel");
  revalidatePath(`/app/admin/sessies/${input.sessionId}`);
  revalidatePath(`/app/trainer/sessies/${input.sessionId}`);
  return { ok: true, message: res.message };
}
