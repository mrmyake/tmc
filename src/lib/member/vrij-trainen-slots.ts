/**
 * Pure logica voor de slotkiezer van vrij trainen (spec-vrij-trainen-slots.md).
 * Geen imports van server- of browsercode, zodat node:test hem direct kan
 * laden (scripts/vrij-trainen/slots.test.mts).
 *
 * De database is leidend (book_class_session, vrij_trainen_availability);
 * deze module bepaalt alleen wat de knoppen tonen en welke aanklikbaar zijn.
 * Alle vergelijkingen gaan op tijdstippen (epoch-ms), dus zomer- en wintertijd
 * spelen geen rol; alleen de labels worden in Europe/Amsterdam geformatteerd.
 */

export const QUARTER_MS = 15 * 60_000;

/** Toegestane duren in minuten, zelfde lijst als de check-constraint. */
export const SLOT_DURATIONS = [30, 45, 60, 75, 90] as const;
export type SlotDuration = (typeof SLOT_DURATIONS)[number];
export const DEFAULT_SLOT_DURATION: SlotDuration = 60;

/** Vanaf dit aantal vrije plekken of minder kleurt het label champagne. */
export const FEW_SPOTS_THRESHOLD = 2;

/** Herinneringsmail gaat 21 tot 25 uur voor de start; daarbinnen komt er geen. */
export const REMINDER_LEAD_MS = 25 * 60 * 60_000;

/** Een rij uit tmc.vrij_trainen_availability. */
export interface QuarterAvailability {
  quarterStart: string;
  booked: number;
  available: number;
  blocked: boolean;
}

export type QuarterState =
  | "open" // boekbaar, meer dan FEW_SPOTS_THRESHOLD vrij
  | "few" // boekbaar, FEW_SPOTS_THRESHOLD of minder vrij
  | "full" // dit kwartier zit vol
  | "blocked" // blokkerende les in dit kwartier
  | "past" // start ligt op of voor nu
  | "no_fit"; // start kan, maar een later kwartier van het slot niet

export interface QuarterCell {
  quarterStart: string;
  startMs: number;
  state: QuarterState;
  available: number;
  bookable: boolean;
}

function ownState(q: QuarterAvailability, startMs: number, nowMs: number): QuarterState | null {
  if (startMs <= nowMs) return "past";
  if (q.blocked) return "blocked";
  if (q.available <= 0) return "full";
  return null;
}

/**
 * Toestand per kwartier voor een gekozen duur. Een start is boekbaar als alle
 * kwartieren van het slot bestaan (binnen de sessie, aaneengesloten), niet
 * voorbij zijn, geen les hebben en nog een plek hebben.
 */
export function quarterCells(
  quarters: readonly QuarterAvailability[],
  durationMin: number,
  nowMs: number,
): QuarterCell[] {
  const sorted = [...quarters].sort(
    (a, b) => Date.parse(a.quarterStart) - Date.parse(b.quarterStart),
  );
  const byStart = new Map(sorted.map((q) => [Date.parse(q.quarterStart), q]));
  const needed = Math.round(durationMin / 15);

  return sorted.map((q) => {
    const startMs = Date.parse(q.quarterStart);
    const own = ownState(q, startMs, nowMs);
    if (own) {
      return { quarterStart: q.quarterStart, startMs, state: own, available: q.available, bookable: false };
    }
    for (let i = 1; i < needed; i++) {
      const next = byStart.get(startMs + i * QUARTER_MS);
      if (!next || ownState(next, startMs + i * QUARTER_MS, nowMs)) {
        return { quarterStart: q.quarterStart, startMs, state: "no_fit", available: q.available, bookable: false };
      }
    }
    return {
      quarterStart: q.quarterStart,
      startMs,
      state: q.available <= FEW_SPOTS_THRESHOLD ? "few" : "open",
      available: q.available,
      bookable: true,
    };
  });
}

/** Epoch-ms van de kwartieren die een slot beslaat (start inbegrepen). */
export function slotQuarterStarts(startIso: string, durationMin: number): number[] {
  const start = Date.parse(startIso);
  return Array.from({ length: Math.round(durationMin / 15) }, (_, i) => start + i * QUARTER_MS);
}

/** Is een eerder gekozen start nog boekbaar met deze duur? */
export function isStartBookable(
  quarters: readonly QuarterAvailability[],
  startIso: string,
  durationMin: number,
  nowMs: number,
): boolean {
  const startMs = Date.parse(startIso);
  return quarterCells(quarters, durationMin, nowMs).some(
    (c) => c.startMs === startMs && c.bookable,
  );
}

/** Toon de herinneringsregel alleen als de cron er nog een verstuurt. */
export function reminderWillBeSent(slotStartIso: string, nowMs: number): boolean {
  return Date.parse(slotStartIso) - nowMs > REMINDER_LEAD_MS;
}

const hourFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "07:15" in Amsterdamse tijd. */
export function amsterdamClock(ms: number): string {
  return hourFormatter.format(new Date(ms));
}

export interface HourRow {
  /** Amsterdams uurlabel, bv. "07:00". */
  hourLabel: string;
  /** Uur 0-23 in Amsterdamse tijd. */
  hour: number;
  /** Vier plekken, :00 tot :45; null waar de sessie dat kwartier niet heeft. */
  cells: Array<QuarterCell | null>;
}

/**
 * Groepeert kwartieren per Amsterdams uur. Op de dag van de wintertijdwissel
 * komt een uur twee keer voor; elke doorloop krijgt dan een eigen rij.
 */
export function groupByHour(cells: readonly QuarterCell[]): HourRow[] {
  const rows: HourRow[] = [];
  let current: HourRow | null = null;
  let currentHourStartMs = Number.NaN;
  for (const c of cells) {
    const [hh, mm] = amsterdamClock(c.startMs).split(":").map(Number);
    const hourStartMs = c.startMs - mm * 60_000;
    if (!current || hourStartMs !== currentHourStartMs) {
      current = { hourLabel: `${String(hh).padStart(2, "0")}:00`, hour: hh, cells: [null, null, null, null] };
      currentHourStartMs = hourStartMs;
      rows.push(current);
    }
    current.cells[Math.floor(mm / 15)] = c;
  }
  return rows;
}

/**
 * Is de trainer dit uur volledig aanwezig? `weekday` in JS-conventie
 * (0 = zondag), `windows` als "HH:MM"-paren.
 */
export function trainerPresentInHour(
  weekday: number,
  hour: number,
  presence: { weekdays: readonly number[]; windows: ReadonlyArray<{ from: string; to: string }> },
): boolean {
  if (!presence.weekdays.includes(weekday)) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return presence.windows.some((w) => hour * 60 >= toMin(w.from) && (hour + 1) * 60 <= toMin(w.to));
}

/** Label onder de tijd in een kwartierknop. */
export function quarterLabel(cell: QuarterCell): string {
  switch (cell.state) {
    case "open":
    case "few":
      // COPY: confirm met Marlon
      return `${cell.available} vrij`;
    case "full":
      // COPY: confirm met Marlon
      return "vol";
    case "blocked":
      // COPY: confirm met Marlon
      return "les";
    case "past":
      // COPY: confirm met Marlon
      return "voorbij";
    case "no_fit":
      // COPY: confirm met Marlon
      return "past niet";
  }
}

/** "30 min", "45 min", "1 uur", "1 uur 15", "1,5 uur". */
export function durationLabel(minutes: number): string {
  switch (minutes) {
    case 30:
      // COPY: confirm met Marlon
      return "30 min";
    case 45:
      // COPY: confirm met Marlon
      return "45 min";
    case 60:
      // COPY: confirm met Marlon
      return "1 uur";
    case 75:
      // COPY: confirm met Marlon
      return "1 uur 15";
    case 90:
      // COPY: confirm met Marlon
      return "1,5 uur";
    default:
      return `${minutes} min`;
  }
}
