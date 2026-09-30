/**
 * Aanwezigheid van Marlon (tmc.trainer_presence_windows, enige bron). Pure
 * logica zonder server- of browserimports, zodat node:test hem direct kan
 * laden (scripts/vrij-trainen/presence.test.mts). weekday in de conventie van
 * extract(dow) in Amsterdamse tijd: 0 = zondag.
 *
 * De regel spiegelt tmc.vrij_trainen_trainer_present: elk kwartier van het slot
 * valt volledig in een venster van die weekdag. De database is leidend; dit is
 * voor weergave en tests.
 */

export interface PresenceWindow {
  /** 0 = zondag, 1 = maandag, ... 6 = zaterdag. */
  weekday: number;
  /** "HH:MM". */
  from: string;
  /** "HH:MM". */
  to: string;
}

/** De vorm die trainerPresentInHour en SlotGrid verwachten, voor een weekdag. */
export interface WeekdayPresence {
  weekdays: readonly number[];
  windows: ReadonlyArray<{ from: string; to: string }>;
}

const QUARTER_MS = 15 * 60_000;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** De vensters van een weekdag, als invoer voor trainerPresentInHour. */
export function presenceForWeekday(
  rows: readonly PresenceWindow[],
  weekday: number,
): WeekdayPresence {
  const windows = rows
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ from: r.from, to: r.to }))
    .sort((a, b) => toMinutes(a.from) - toMinutes(b.from));
  return { weekdays: windows.length > 0 ? [weekday] : [], windows };
}

const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;
const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

function windowText(w: { from: string; to: string }): string {
  // COPY: confirm met Marlon
  return `${w.from} tot ${w.to}`;
}

/**
 * "ma t/m vr 07:00 tot 12:00 en 17:00 tot 21:00": weekdagen met dezelfde
 * vensters worden samengenomen, aaneengesloten dagen als "ma t/m vr". Leeg als
 * er geen vensters zijn.
 */
export function formatPresenceWindows(rows: readonly PresenceWindow[]): string {
  const groups = new Map<string, { days: number[]; windows: ReadonlyArray<{ from: string; to: string }> }>();
  for (const d of WEEK_ORDER) {
    const { windows } = presenceForWeekday(rows, d);
    if (windows.length === 0) continue;
    const key = windows.map(windowText).join("|");
    const g = groups.get(key) ?? { days: [], windows };
    g.days.push(d);
    groups.set(key, g);
  }
  const parts: string[] = [];
  for (const g of groups.values()) {
    const ranges: string[] = [];
    let i = 0;
    while (i < g.days.length) {
      let j = i;
      while (j + 1 < g.days.length && WEEK_ORDER.indexOf(g.days[j + 1]) === WEEK_ORDER.indexOf(g.days[j]) + 1) j++;
      const len = j - i + 1;
      const first = DAY_SHORT[g.days[i]];
      const last = DAY_SHORT[g.days[j]];
      // COPY: confirm met Marlon
      ranges.push(len >= 3 ? `${first} t/m ${last}` : len === 2 ? `${first} en ${last}` : first);
      i = j + 1;
    }
    // COPY: confirm met Marlon
    parts.push(`${ranges.join(", ")} ${g.windows.map(windowText).join(" en ")}`);
  }
  return parts.join("; ");
}

const localParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAY_FROM_EN: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Weekdag (0 = zondag) en minuut van de dag in Amsterdamse tijd. */
export function amsterdamWeekdayAndMinutes(ms: number): { weekday: number; minutes: number } {
  const parts = localParts.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: WEEKDAY_FROM_EN[get("weekday")] ?? -1,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/**
 * Valt het slot [startMs, startMs + minutes) kwartier voor kwartier volledig
 * binnen een venster? Rekent op tijdstippen, dus zomer- en wintertijd spelen
 * geen rol; alleen de weekdag en de klok worden in Amsterdamse tijd bepaald.
 */
export function isSlotInPresence(
  rows: readonly PresenceWindow[],
  startMs: number,
  minutes = 60,
): boolean {
  const quarters = Math.round(minutes / 15);
  for (let i = 0; i < quarters; i++) {
    const { weekday, minutes: m } = amsterdamWeekdayAndMinutes(startMs + i * QUARTER_MS);
    if (weekday < 0 || m + 15 > 24 * 60) return false;
    const ok = rows.some(
      (w) => w.weekday === weekday && toMinutes(w.from) <= m && m + 15 <= toMinutes(w.to),
    );
    if (!ok) return false;
  }
  return true;
}
