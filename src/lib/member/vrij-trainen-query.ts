import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  addDaysIsoAmsterdam,
  isoDateAmsterdam,
  parseIsoDateToAmsterdamMidnight,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import type { QuarterAvailability } from "./vrij-trainen-slots";

/**
 * Data voor de slotkiezer op /app/vrij-trainen (spec-vrij-trainen-slots.md):
 * dagstrip van 7 dagen, de beschikbaarheid per kwartier van de gekozen dag
 * (tmc.vrij_trainen_availability, zonder persoonsgegevens) en de eigen
 * boeking. Alles via de client van het lid; RLS laat alleen de eigen
 * boekingen zien, de RPC levert alleen tellingen.
 */

export const STRIP_DAYS = 7;

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface StripDay {
  isoDate: string;
  /** Geplande vrij-trainen-sessie op deze Amsterdamse dag. */
  hasSession: boolean;
  /** Het lid heeft op deze dag een vrij-trainen-boeking. */
  booked: boolean;
}

export interface VrijTrainenSession {
  id: string;
  startAt: string;
  endAt: string;
}

export interface OwnSlotBooking {
  id: string;
  slotStartAt: string;
  slotEndAt: string;
}

export interface VrijTrainenPickerData {
  days: StripDay[];
  selectedDate: string;
  session: VrijTrainenSession | null;
  quarters: QuarterAvailability[];
  ownBooking: OwnSlotBooking | null;
  maxConcurrent: number;
  cancelWindowMinutes: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function loadVrijTrainenPicker(
  supabase: Supabase,
  userId: string,
  requestedDate: string | undefined,
  now: Date = new Date(),
): Promise<VrijTrainenPickerData> {
  const todayIso = todayIsoAmsterdam(now);

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("booking_window_days, vrij_trainen_max_concurrent, vrij_trainen_cancel_window_minutes")
    .limit(1)
    .maybeSingle();
  const bookingWindowDays = settings?.booking_window_days ?? 14;
  const stripLength = Math.min(STRIP_DAYS, bookingWindowDays + 1);

  const windowStart = parseIsoDateToAmsterdamMidnight(todayIso)!;
  const windowEnd = parseIsoDateToAmsterdamMidnight(addDaysIsoAmsterdam(todayIso, stripLength))!;

  const { data: sessionRows } = await supabase
    .from("class_sessions")
    .select("id, start_at, end_at")
    .eq("pillar", "vrij_trainen")
    .eq("status", "scheduled")
    .gte("start_at", windowStart.toISOString())
    .lt("start_at", windowEnd.toISOString())
    .order("start_at", { ascending: true });

  const sessionByDate = new Map<string, VrijTrainenSession>();
  for (const s of sessionRows ?? []) {
    sessionByDate.set(isoDateAmsterdam(new Date(s.start_at)), {
      id: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
    });
  }

  const sessionIds = [...sessionByDate.values()].map((s) => s.id);
  const { data: bookingRows } = sessionIds.length
    ? await supabase
        .from("bookings")
        .select("id, session_id, slot_start_at, slot_end_at")
        .eq("profile_id", userId)
        .eq("pillar", "vrij_trainen")
        .eq("status", "booked")
        .in("session_id", sessionIds)
    : { data: [] as Array<{ id: string; session_id: string; slot_start_at: string | null; slot_end_at: string | null }> };

  const bookingBySession = new Map<string, OwnSlotBooking>();
  for (const b of bookingRows ?? []) {
    if (b.slot_start_at && b.slot_end_at) {
      bookingBySession.set(b.session_id, {
        id: b.id,
        slotStartAt: b.slot_start_at,
        slotEndAt: b.slot_end_at,
      });
    }
  }

  const days: StripDay[] = Array.from({ length: stripLength }, (_, i) => {
    const iso = addDaysIsoAmsterdam(todayIso, i);
    const session = sessionByDate.get(iso);
    return {
      isoDate: iso,
      hasSession: Boolean(session),
      booked: Boolean(session && bookingBySession.has(session.id)),
    };
  });

  const requested =
    requestedDate && ISO_DATE.test(requestedDate)
      ? days.find((d) => d.isoDate === requestedDate && d.hasSession)
      : undefined;
  const selectedDate =
    requested?.isoDate ?? days.find((d) => d.hasSession)?.isoDate ?? todayIso;
  const session = sessionByDate.get(selectedDate) ?? null;

  let quarters: QuarterAvailability[] = [];
  if (session) {
    const { data, error } = await supabase.rpc("vrij_trainen_availability", {
      p_date: selectedDate,
    });
    if (error) console.error("[vrij-trainen] availability rpc failed", error);
    quarters = ((data ?? []) as Array<{
      session_id: string;
      quarter_start: string;
      booked: number;
      available: number;
      blocked: boolean;
    }>)
      .filter((r) => r.session_id === session.id)
      .map((r) => ({
        quarterStart: r.quarter_start,
        booked: r.booked,
        available: r.available,
        blocked: r.blocked,
      }));
  }

  return {
    days,
    selectedDate,
    session,
    quarters,
    ownBooking: session ? (bookingBySession.get(session.id) ?? null) : null,
    maxConcurrent: settings?.vrij_trainen_max_concurrent ?? 5,
    cancelWindowMinutes: settings?.vrij_trainen_cancel_window_minutes ?? 5,
  };
}
