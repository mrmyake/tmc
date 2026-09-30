import "server-only";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import {
  addDaysIsoAmsterdam,
  isoDateAmsterdam,
  parseIsoDateToAmsterdamMidnight,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import type { QuarterAvailability } from "@/lib/member/vrij-trainen-slots";
import type { StripDay } from "@/lib/member/vrij-trainen-query";
import { getTrainerPresenceWindows } from "@/lib/trainer-presence";
import type { PresenceWindow } from "@/lib/presence";

/**
 * Data voor de slotkiezer van een proefbezoeker met een vrij-trainen-code
 * (spec-vrij-trainen-slots.md). Dezelfde vormen als de ledenkiezer
 * (src/lib/member/vrij-trainen-query.ts), maar zonder ingelogde gebruiker:
 * service_role en tmc.vrij_trainen_visitor_availability, dat dezelfde telling
 * gebruikt als de ledenbeschikbaarheid en alleen de kwartieren binnen de
 * aanwezigheid van Marlon teruggeeft. Geen persoonsgegevens. Dit is weergave;
 * tmc.redeem_trial_code beslist bij het boeken opnieuw.
 */

export const VISITOR_HORIZON_DAYS = 14;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface VisitorSlotData {
  days: StripDay[];
  selectedDate: string;
  session: { id: string; startAt: string; endAt: string } | null;
  quarters: QuarterAvailability[];
  presence: PresenceWindow[];
}

export async function loadVisitorSlotPicker(
  requestedDate: string | undefined,
  now: Date = new Date(),
): Promise<VisitorSlotData> {
  const todayIso = todayIsoAmsterdam(now);
  const empty: VisitorSlotData = {
    days: Array.from({ length: VISITOR_HORIZON_DAYS }, (_, i) => ({
      isoDate: addDaysIsoAmsterdam(todayIso, i),
      hasSession: false,
      booked: false,
    })),
    selectedDate: todayIso,
    session: null,
    quarters: [],
    presence: [],
  };
  if (!isAdminConfigured()) return empty;

  const admin = createAdminClient();
  const windowStart = parseIsoDateToAmsterdamMidnight(todayIso)!;
  const windowEnd = parseIsoDateToAmsterdamMidnight(
    addDaysIsoAmsterdam(todayIso, VISITOR_HORIZON_DAYS),
  )!;
  const toIso = addDaysIsoAmsterdam(todayIso, VISITOR_HORIZON_DAYS - 1);

  const [presence, sessionsRes, availRes] = await Promise.all([
    getTrainerPresenceWindows(),
    admin
      .from("class_sessions")
      .select("id, start_at, end_at")
      .eq("pillar", "vrij_trainen")
      .eq("status", "scheduled")
      .gte("start_at", windowStart.toISOString())
      .lt("start_at", windowEnd.toISOString())
      .order("start_at", { ascending: true }),
    admin.rpc("vrij_trainen_visitor_availability", { p_from: todayIso, p_to: toIso }),
  ]);
  if (sessionsRes.error) console.error("[visitor-slots] sessions", sessionsRes.error);
  if (availRes.error) console.error("[visitor-slots] availability", availRes.error);

  const sessionByDate = new Map<string, { id: string; startAt: string; endAt: string }>();
  for (const s of sessionsRes.data ?? []) {
    sessionByDate.set(isoDateAmsterdam(new Date(s.start_at)), {
      id: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
    });
  }

  type Row = {
    session_id: string;
    quarter_start: string;
    booked: number;
    available: number;
    blocked: boolean;
  };
  const rowsBySession = new Map<string, QuarterAvailability[]>();
  for (const r of (availRes.data ?? []) as Row[]) {
    const list = rowsBySession.get(r.session_id) ?? [];
    list.push({
      quarterStart: r.quarter_start,
      booked: r.booked,
      available: r.available,
      blocked: r.blocked,
    });
    rowsBySession.set(r.session_id, list);
  }

  // Een dag is kiesbaar als er een sessie is met kwartieren binnen de
  // aanwezigheid (weekend en dagen zonder venster vallen dus af).
  const days: StripDay[] = empty.days.map((d) => {
    const session = sessionByDate.get(d.isoDate);
    return {
      isoDate: d.isoDate,
      hasSession: Boolean(session && (rowsBySession.get(session.id)?.length ?? 0) > 0),
      booked: false,
    };
  });

  const requested =
    requestedDate && ISO_DATE.test(requestedDate)
      ? days.find((d) => d.isoDate === requestedDate && d.hasSession)
      : undefined;
  const selectedDate = requested?.isoDate ?? days.find((d) => d.hasSession)?.isoDate ?? todayIso;
  const session = sessionByDate.get(selectedDate) ?? null;

  return {
    days,
    selectedDate,
    session: session && days.find((d) => d.isoDate === selectedDate)?.hasSession ? session : null,
    quarters: session ? (rowsBySession.get(session.id) ?? []) : [],
    presence,
  };
}
