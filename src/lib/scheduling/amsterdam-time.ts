import "server-only";

/**
 * Gedeeld met src/app/api/cron/generate-sessions/route.ts en
 * src/lib/scheduling/*: één plek voor Amsterdam wall-clock <-> UTC conversie
 * zodat cron, serie-acties en vrij-trainen-beschikbaarheid niet uit de pas
 * kunnen lopen.
 */
export const TIME_ZONE = "Europe/Amsterdam";

/**
 * Convert an Amsterdam wall-clock (year/month/day/hour/minute) to a UTC
 * Date. Handles CET/CEST correctly by measuring the offset Intl reports
 * for that wall-clock and correcting it.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const firstTry = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(firstTry));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const diffMinutes = hour * 60 + minute - (get("hour") * 60 + get("minute"));
  return new Date(firstTry + diffMinutes * 60_000);
}

export function amsterdamYmd(d: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** 0-6, 0 = zondag (JS getDay-conventie). Zelfde conventie als schedule_templates.day_of_week / opening_hours.weekday. */
export function amsterdamDayOfWeek(d: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(d);
  const idx: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return idx[weekday] ?? 0;
}

export function toIsoDate(d: Date): string {
  const p = amsterdamYmd(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
