import { presenceForWeekday, type PresenceWindow } from "@/lib/presence";

export interface OpeningDagInvoer {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

export interface DagbalkRij {
  label: string;
  /** Percentages (0 tot 100) van de tijdas. */
  open: { left: number; width: number } | null;
  marlon: Array<{ left: number; width: number }>;
}

export interface Dagbalk {
  rijen: DagbalkRij[];
  /** Uren op de as, met hun positie in procenten. */
  ticks: Array<{ uur: number; left: number }>;
}

const WEEKDAG_NUMMER: Record<string, number> = {
  Zondag: 0,
  Maandag: 1,
  Dinsdag: 2,
  Woensdag: 3,
  Donderdag: 4,
  Vrijdag: 5,
  Zaterdag: 6,
};

function minuten(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function dagLabel(dagen: string[]): string {
  const kort = (d: string) => d.slice(0, 2).toLowerCase();
  if (dagen.length === 1) return kort(dagen[0]);
  if (dagen.length === 2) return `${kort(dagen[0])} en ${kort(dagen[1])}`;
  return `${kort(dagen[0])} t/m ${kort(dagen[dagen.length - 1])}`;
}

/**
 * Bouwt de dagbalk uit de bestaande bronnen: de openingstijden (getOpeningHours)
 * en de aanwezigheidsvensters van Marlon (tmc.trainer_presence_windows). Er
 * staan geen tijden in de content. Aaneengesloten dagen met dezelfde tijden
 * worden een rij; de Marlon-vensters zijn die van de eerste dag van de rij.
 * Zonder geopende dagen een lege balk.
 */
export function bouwDagbalk(
  schedule: ReadonlyArray<OpeningDagInvoer>,
  presence: readonly PresenceWindow[],
): Dagbalk {
  const open = schedule.filter((d) => !d.closed && d.open && d.close);
  if (open.length === 0) return { rijen: [], ticks: [] };

  const start = Math.floor(Math.min(...open.map((d) => minuten(d.open))) / 60) * 60;
  const eind = Math.ceil(Math.max(...open.map((d) => minuten(d.close))) / 60) * 60;
  const span = eind - start;
  const pct = (m: number) => ((m - start) / span) * 100;

  const groepen: Array<{ dagen: string[]; rij: OpeningDagInvoer }> = [];
  for (const dag of schedule) {
    if (dag.closed) continue;
    const laatste = groepen[groepen.length - 1];
    if (laatste && laatste.rij.open === dag.open && laatste.rij.close === dag.close) {
      laatste.dagen.push(dag.day);
    } else {
      groepen.push({ dagen: [dag.day], rij: dag });
    }
  }

  const rijen: DagbalkRij[] = groepen.map(({ dagen, rij }) => {
    const nummer = WEEKDAG_NUMMER[dagen[0]];
    const vensters =
      nummer === undefined ? [] : presenceForWeekday(presence, nummer).windows;
    return {
      label: dagLabel(dagen),
      open: {
        left: pct(minuten(rij.open)),
        width: pct(minuten(rij.close)) - pct(minuten(rij.open)),
      },
      marlon: vensters.map((w) => ({
        left: pct(minuten(w.from)),
        width: pct(minuten(w.to)) - pct(minuten(w.from)),
      })),
    };
  });

  const ticks: Dagbalk["ticks"] = [];
  const startUur = start / 60;
  const eindUur = eind / 60;
  const stap = eindUur - startUur > 12 ? 5 : 3;
  for (let u = startUur; u <= eindUur; u += stap) ticks.push({ uur: u, left: pct(u * 60) });
  if (ticks[ticks.length - 1]?.uur !== eindUur) ticks.push({ uur: eindUur, left: 100 });

  return { rijen, ticks };
}
