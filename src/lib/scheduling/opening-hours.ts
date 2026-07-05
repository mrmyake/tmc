import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { amsterdamDayOfWeek, toIsoDate, zonedWallClockToUtc } from "./amsterdam-time";

export interface FreeTrainingSlot {
  /** ISO date (yyyy-mm-dd), Amsterdam-local dag. */
  date: string;
  /** True = dicht die dag (opening_hours of exception); slots/blocked zijn dan altijd leeg. */
  isClosed: boolean;
  /** Lege array kan ook betekenen: open, maar volledig geblokkeerd door sessies. */
  slots: Array<{ start: string; end: string }>; // ISO UTC instants
  /** Segmenten binnen de openingstijd die bezet zijn door een blocks_free_training-sessie. */
  blocked: Array<{ start: string; end: string; className: string }>;
}

interface OpeningHoursRow {
  weekday: number;
  is_closed: boolean;
  opens_at: string | null; // "07:00:00"
  closes_at: string | null;
}

interface OpeningHoursExceptionRow {
  date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

interface BlockingSessionRow {
  start_at: string;
  end_at: string;
  class_type: { name: string } | { name: string }[] | null;
}

function blockingClassName(row: BlockingSessionRow): string {
  const ct = Array.isArray(row.class_type) ? row.class_type[0] : row.class_type;
  return ct?.name ?? "Sessie";
}

function parseHms(t: string): { h: number; m: number } {
  const [hStr, mStr] = t.split(":");
  return { h: Number(hStr), m: Number(mStr) };
}

/**
 * Vrij-trainen-beschikbaarheid per dag in [from, to): openingstijd
 * (opening_hours, met exceptions als override) minus sessies die
 * blocks_free_training=true hebben. Geen aparte "vrij trainen"-entiteit —
 * beschikbaarheid is altijd afgeleid (spec §3.3 "Wat NIET doen").
 */
export async function getFreeTrainingAvailability(opts: {
  from: Date;
  to: Date;
}): Promise<FreeTrainingSlot[]> {
  const admin = createAdminClient();
  const fromIso = toIsoDate(opts.from);
  const toIso = toIsoDate(opts.to);

  const [hoursRes, exceptionsRes, blockingRes] = await Promise.all([
    admin
      .from("opening_hours")
      .select("weekday, is_closed, opens_at, closes_at")
      .returns<OpeningHoursRow[]>(),
    admin
      .from("opening_hours_exceptions")
      .select("date, is_closed, opens_at, closes_at")
      .gte("date", fromIso)
      .lte("date", toIso)
      .returns<OpeningHoursExceptionRow[]>(),
    admin
      .from("class_sessions")
      .select("start_at, end_at, class_type:class_types(name)")
      .eq("status", "scheduled")
      .eq("blocks_free_training", true)
      .lt("start_at", opts.to.toISOString())
      .gt("end_at", opts.from.toISOString())
      .returns<BlockingSessionRow[]>(),
  ]);

  const hoursByWeekday = new Map(
    (hoursRes.data ?? []).map((r) => [r.weekday, r]),
  );
  const exceptionByDate = new Map(
    (exceptionsRes.data ?? []).map((r) => [r.date, r]),
  );
  const blocking = (blockingRes.data ?? []).map((r) => ({
    start: new Date(r.start_at),
    end: new Date(r.end_at),
    className: blockingClassName(r),
  }));

  const days: FreeTrainingSlot[] = [];

  for (
    let cursor = new Date(opts.from);
    toIsoDate(cursor) <= toIso;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const dateIso = toIsoDate(cursor);
    const weekday = amsterdamDayOfWeek(cursor);
    const exception = exceptionByDate.get(dateIso);
    const base = hoursByWeekday.get(weekday);

    const isClosed = exception ? exception.is_closed : (base?.is_closed ?? true);
    const opensAt = exception ? exception.opens_at : base?.opens_at;
    const closesAt = exception ? exception.closes_at : base?.closes_at;

    if (isClosed || !opensAt || !closesAt) {
      days.push({ date: dateIso, isClosed: true, slots: [], blocked: [] });
      continue;
    }

    const { year, month, day } = {
      year: Number(dateIso.slice(0, 4)),
      month: Number(dateIso.slice(5, 7)),
      day: Number(dateIso.slice(8, 10)),
    };
    const open = parseHms(opensAt);
    const close = parseHms(closesAt);
    const dayOpenUtc = zonedWallClockToUtc(year, month, day, open.h, open.m);
    const dayCloseUtc = zonedWallClockToUtc(year, month, day, close.h, close.m);

    const dayBlocking = blocking
      .filter((b) => b.start < dayCloseUtc && b.end > dayOpenUtc)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const slots: Array<{ start: string; end: string }> = [];
    const blocked: Array<{ start: string; end: string; className: string }> = [];
    let openCursor = dayOpenUtc;
    for (const b of dayBlocking) {
      const bStart = b.start < dayOpenUtc ? dayOpenUtc : b.start;
      const bEnd = b.end > dayCloseUtc ? dayCloseUtc : b.end;
      if (bStart > openCursor) {
        slots.push({
          start: openCursor.toISOString(),
          end: bStart.toISOString(),
        });
      }
      blocked.push({
        start: bStart.toISOString(),
        end: bEnd.toISOString(),
        className: b.className,
      });
      if (bEnd > openCursor) openCursor = bEnd;
    }
    if (openCursor < dayCloseUtc) {
      slots.push({
        start: openCursor.toISOString(),
        end: dayCloseUtc.toISOString(),
      });
    }

    days.push({ date: dateIso, isClosed: false, slots, blocked });
  }

  return days;
}
