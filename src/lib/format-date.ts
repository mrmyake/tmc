/**
 * Amsterdam-locked date/time formatters for the member app.
 *
 * `toLocaleXxx("nl-NL", ...)` without an explicit timeZone uses the runtime
 * timezone. Locally that's fine for NL developers, but on Vercel (UTC) every
 * time would shift. All member-facing formatters route through this module
 * so display is consistent regardless of server location.
 */

const TIME_ZONE = "Europe/Amsterdam";

export const DAY_SHORT_NL = [
  "zo",
  "ma",
  "di",
  "wo",
  "do",
  "vr",
  "za",
];

export const DAY_LONG_NL = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

export const MONTH_SHORT_NL = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

interface AmsterdamParts {
  year: number;
  month: number; // 1..12
  day: number;
  weekday: number; // 0=Sun..6=Sat
  hour: number; // 0..23
  minute: number;
}

const PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function amsterdamParts(date: Date): AmsterdamParts {
  const parts = PARTS_FORMATTER.formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    weekday: WEEKDAY_INDEX[pick("weekday")] ?? 0,
    hour: Number(pick("hour")),
    minute: Number(pick("minute")),
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "06:30" */
export function formatTime(date: Date): string {
  const p = amsterdamParts(date);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "06:30 – 07:30" */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "22 april 2026" */
export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "woensdag 22 april" */
export function formatWeekdayDate(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** "wo 22 apr" */
export function formatShortDate(date: Date): string {
  const p = amsterdamParts(date);
  return `${DAY_SHORT_NL[p.weekday]} ${p.day} ${MONTH_SHORT_NL[p.month - 1]}`;
}

/** "wo 22 apr 2026" */
export function formatShortDateWithYear(date: Date): string {
  const p = amsterdamParts(date);
  return `${DAY_SHORT_NL[p.weekday]} ${p.day} ${MONTH_SHORT_NL[p.month - 1]} ${p.year}`;
}

/** "Vandaag · 06:30" / "Morgen · 07:00" / "woensdag · 16:00" / "woensdag 22 april · 16:00" */
export function formatRelativeWhen(date: Date, now: Date = new Date()): string {
  const target = amsterdamParts(date);
  const today = amsterdamParts(now);
  const time = `${pad2(target.hour)}:${pad2(target.minute)}`;

  const targetUtc = Date.UTC(target.year, target.month - 1, target.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const dayDiff = Math.round((targetUtc - todayUtc) / 86400000);

  if (dayDiff === 0) return `Vandaag · ${time}`;
  if (dayDiff === 1) return `Morgen · ${time}`;
  if (dayDiff >= 2 && dayDiff < 7) {
    return `${DAY_LONG_NL[target.weekday]} · ${time}`;
  }
  const prefix = new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return `${prefix} · ${time}`;
}

export function durationMinutes(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

/** "2026-04-23" — yyyy-mm-dd volgens Amsterdam wall-clock. */
export function isoDateAmsterdam(date: Date): string {
  const p = amsterdamParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * Geeft yyyy-mm-dd voor "vandaag" in Amsterdam-tijdzone. Server wijst
 * anders een andere datum toe wanneer er lokaal al wel middernacht is
 * maar op Vercel (UTC) nog niet, of andersom rond DST-overgang.
 */
export function todayIsoAmsterdam(now: Date = new Date()): string {
  return isoDateAmsterdam(now);
}

/**
 * Parse een yyyy-mm-dd string (zoals van query-params) als
 * Amsterdam-wall-clock midnight, teruggegeven als UTC-Date. Invalide
 * input → null, zodat callers fall-back op "vandaag".
 */
export function parseIsoDateToAmsterdamMidnight(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
  // Start met een UTC-midnight en verschuif naar Amsterdam-wall-clock
  // midnight door het tijdzone-offset verschil te corrigeren. Dezelfde
  // truc als in scripts/seed-test-data zodat DST niet fout gaat.
  const utcGuess = Date.UTC(y, mo - 1, d, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const diffMinutes = 0 * 60 + 0 - (h * 60 + m);
  return new Date(utcGuess + diffMinutes * 60_000);
}

/** Voegt N dagen toe aan een yyyy-mm-dd string, Amsterdam-veilig. */
export function addDaysIsoAmsterdam(iso: string, days: number): string {
  const base = parseIsoDateToAmsterdamMidnight(iso);
  if (!base) return iso;
  const shifted = new Date(base.getTime() + days * 86_400_000);
  return isoDateAmsterdam(shifted);
}

/** True als de sessie al voorbij is (einde < nu). */
export function isPast(endAt: Date, now: Date = new Date()): boolean {
  return endAt.getTime() < now.getTime();
}

/** True als de sessie nu loopt (start <= nu < einde). */
export function isOngoing(
  startAt: Date,
  endAt: Date,
  now: Date = new Date(),
): boolean {
  const t = now.getTime();
  return startAt.getTime() <= t && t < endAt.getTime();
}

/**
 * True als annuleren binnen het venster kan. Window uit booking_settings
 * (uren) — vrij trainen heeft een eigen, veel kortere minuten-regel die
 * elders in booking-actions wordt afgehandeld.
 */
export function isCancellable(
  startAt: Date,
  windowHours: number,
  now: Date = new Date(),
): boolean {
  const msUntil = startAt.getTime() - now.getTime();
  return msUntil >= windowHours * 3_600_000;
}
