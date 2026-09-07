import { EXTENDED_ACCESS_WINDOW } from "./constants";

/**
 * Vertaling van tmc.opening_hours naar Akiles-schedules.
 *
 * Akiles (openapi.yaml, schema `schedule`): `weekdays` is een array van
 * exact zeven objecten, index 0 is maandag en index 6 is zondag. Elke dag
 * heeft `ranges: [{ start, end }]` in seconden vanaf 00:00, 0 t/m 86400,
 * end groter dan start, geen overlap binnen een dag, geevalueerd in de
 * lokale tijdzone van de Akiles-site.
 *
 * tmc.opening_hours.weekday volgt de JS getDay-conventie: 0 is zondag,
 * 6 is zaterdag. Vandaar de (weekday + 6) % 7 hieronder.
 *
 * Schedules zijn puur wekelijks; tmc.opening_hours_exceptions is niet uit
 * te drukken en wordt bewust niet gesynct.
 */

export interface OpeningHoursRow {
  /** 0 = zondag ... 6 = zaterdag (JS getDay). */
  weekday: number;
  is_closed: boolean;
  /** "07:00:00" of "07:00"; null als gesloten. */
  opens_at: string | null;
  closes_at: string | null;
}

export interface ScheduleRange {
  start: number;
  end: number;
}

export interface ScheduleWeekday {
  ranges: ScheduleRange[];
}

export const SECONDS_PER_DAY = 86400;

/** tmc weekday (0 = zondag) naar Akiles index (0 = maandag). */
export function tmcWeekdayToAkilesIndex(tmcWeekday: number): number {
  if (!Number.isInteger(tmcWeekday) || tmcWeekday < 0 || tmcWeekday > 6) {
    throw new Error(`Ongeldige tmc weekday: ${tmcWeekday}`);
  }
  return (tmcWeekday + 6) % 7;
}

/** "HH:mm" of "HH:mm:ss" naar seconden vanaf middernacht (0 t/m 86400). */
export function timeToSeconds(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) throw new Error(`Ongeldige tijd: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? "0");
  if (minutes > 59 || seconds > 59) throw new Error(`Ongeldige tijd: ${time}`);
  const total = hours * 3600 + minutes * 60 + seconds;
  if (total > SECONDS_PER_DAY) throw new Error(`Tijd buiten de dag: ${time}`);
  return total;
}

function emptyWeek(): ScheduleWeekday[] {
  return Array.from({ length: 7 }, () => ({ ranges: [] }));
}

function fullWeek(range: ScheduleRange): ScheduleWeekday[] {
  return Array.from({ length: 7 }, () => ({ ranges: [{ ...range }] }));
}

/**
 * Standaardschedule uit de reguliere openingstijden. Een ontbrekende of
 * gesloten weekdag levert een lege ranges-array op (geen toegang).
 */
export function buildStandardWeekdays(
  rows: readonly OpeningHoursRow[],
): ScheduleWeekday[] {
  const week = emptyWeek();
  for (const row of rows) {
    const index = tmcWeekdayToAkilesIndex(row.weekday);
    if (row.is_closed || !row.opens_at || !row.closes_at) {
      week[index] = { ranges: [] };
      continue;
    }
    const start = timeToSeconds(row.opens_at);
    const end = timeToSeconds(row.closes_at);
    if (end <= start) {
      throw new Error(
        `Sluitingstijd voor weekday ${row.weekday} ligt niet na de openingstijd`,
      );
    }
    week[index] = { ranges: [{ start, end }] };
  }
  return week;
}

/** Verlengde toegang: het venster uit constants.ts, alle zeven dagen. */
export function buildExtendedWeekdays(): ScheduleWeekday[] {
  return fullWeek({
    start: timeToSeconds(EXTENDED_ACCESS_WINDOW.opensAt),
    end: timeToSeconds(EXTENDED_ACCESS_WINDOW.closesAt),
  });
}

/** Noodrem: zeven dagen zonder enige range. */
export function buildClosedWeekdays(): ScheduleWeekday[] {
  return emptyWeek();
}

/** Staf: 24 uur, alle zeven dagen. */
export function buildStaffWeekdays(): ScheduleWeekday[] {
  return fullWeek({ start: 0, end: SECONDS_PER_DAY });
}

/** Structurele gelijkheid, voor idempotentie-checks en tests. */
export function weekdaysEqual(
  a: readonly ScheduleWeekday[],
  b: readonly ScheduleWeekday[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((day, i) => {
    const other = b[i];
    if (day.ranges.length !== other.ranges.length) return false;
    return day.ranges.every(
      (r, j) => r.start === other.ranges[j].start && r.end === other.ranges[j].end,
    );
  });
}
