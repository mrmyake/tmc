/**
 * Voorselectie van een sessie op /proefles/code en /proefles/boeken
 * (spec-yoga-test.md): de eerste sessie met plek in de gekozen tijdsbucket,
 * bestaat die niet dan de eerstvolgende sessie met plek van die les. De
 * bezoeker kan altijd een andere sessie kiezen; dit zet alleen de start.
 *
 * Pure module. De aanroeper levert de lijst van getTrialSessionOptions: dat
 * zijn al alleen toekomstige, geplande sessies binnen 14 dagen mét een
 * vrije plek (of onbeperkte capaciteit).
 */

import { bucketFor } from "./scoring";
import { isTimeBucket, type TimeBucket } from "./config";

export interface PreselectOption {
  id: string;
  startAt: string;
  classTypeId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const AMSTERDAM_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Dag (0 = zondag) en HH:MM van een tijdstip in Amsterdam. */
export function amsterdamDayAndTime(iso: string): { day: number; time: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = AMSTERDAM_PARTS.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const day = WEEKDAYS[weekday];
  if (day === undefined || !hour || !minute) return null;
  return { day, time: `${hour}:${minute}` };
}

/**
 * Het id van de sessie die voorgeselecteerd wordt, of null. Zonder geldig
 * lestype-id geen voorselectie. Een onbekende bucket wordt genegeerd.
 */
export function pickPreselectedSessionId(
  options: readonly PreselectOption[],
  classTypeId: string | null | undefined,
  bucket: TimeBucket | string | null | undefined,
): string | null {
  if (!classTypeId || !isUuid(classTypeId)) return null;
  const ofClass = [...options]
    .filter((o) => o.classTypeId === classTypeId)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  if (ofClass.length === 0) return null;
  if (isTimeBucket(bucket)) {
    const inBucket = ofClass.find((o) => {
      const dt = amsterdamDayAndTime(o.startAt);
      return dt !== null && bucketFor(dt.day, dt.time) === bucket;
    });
    if (inBucket) return inBucket.id;
  }
  return ofClass[0].id;
}
