/**
 * Rekenlaag van de quiz (spec-yoga-test.md): puntentelling, rangschikking en
 * tijdsbuckets. Pure module, zonder server- of browserimports. Dezelfde code
 * draait in de browser (uitslag tonen) en op de server (API-route: de
 * uitslag wordt daar altijd opnieuw berekend, een client-uitslag wordt nooit
 * vertrouwd).
 *
 * Het rooster komt als argument binnen. Er staan geen roosterpunten in deze
 * module: de bucketbonus van vraag 7 hangt volledig af van het live rooster.
 */

import {
  BUCKET_BONUS,
  CARE_QUESTION_INDEX,
  OUTCOME_KEYS,
  TIE_BREAK_ORDER,
  TIME_QUESTION_INDEX,
  questions,
  type OutcomeKey,
  type TimeBucket,
} from "./config";

/** Eén wekelijkse lestijd. day: 0 = zondag (JS getDay, zoals schedule_templates.day_of_week). */
export interface ScheduleSlot {
  day: number;
  /** HH:MM, lokale tijd in Amsterdam. */
  time: string;
  trainerFirstName: string;
}

export type ScheduleByOutcome = Record<OutcomeKey, ScheduleSlot[]>;

export function emptySchedule(): ScheduleByOutcome {
  return { v: [], p: [], ym: [], y: [], r: [], n: [] };
}

/** Hoeveel antwoorden de server nodig heeft: alles voor de zorgvraag. */
export const SCORING_ANSWER_COUNT = CARE_QUESTION_INDEX;

/**
 * Valideert ruwe invoer (bv. uit een JSON-body): een array met per vraag de
 * index van de gekozen optie. De zorgvraag (laatste) hoeft niet mee: die
 * blijft in de browser. Geeft de antwoorden terug of null.
 */
export function parseAnswers(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length !== SCORING_ANSWER_COUNT && raw.length !== questions.length) return null;
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    if (v < 0 || v >= questions[i].options.length) return null;
    out.push(v);
  }
  return out;
}

/** Tijdsbucket van een lestijd: ma t/m vr voor 17:00 is dag, vanaf 17:00 avond, za en zo weekend. */
export function bucketFor(day: number, time: string): TimeBucket {
  if (day === 0 || day === 6) return "weekend";
  return time < "17:00" ? "weekdag-dag" : "weekdag-avond";
}

export function slotBucket(slot: ScheduleSlot): TimeBucket {
  return bucketFor(slot.day, slot.time);
}

/** De gekozen bucket uit vraag 7, of null als de bezoeker "maakt niet uit" koos. */
export function chosenBucket(answers: readonly number[]): TimeBucket | null {
  const idx = answers[TIME_QUESTION_INDEX];
  if (idx === undefined) return null;
  return questions[TIME_QUESTION_INDEX].options[idx]?.bucket ?? null;
}

/** Heeft de bezoeker bij de laatste vraag "Ja" gekozen? */
export function wantsCareNote(answers: readonly number[]): boolean {
  const idx = answers[CARE_QUESTION_INDEX];
  if (idx === undefined) return false;
  return questions[CARE_QUESTION_INDEX].options[idx]?.careNote === true;
}

export interface RankedOutcome {
  key: OutcomeKey;
  score: number;
}

/** Puntentelling per uitkomst, inclusief de bucketbonus uit het rooster. */
export function scoreAnswers(
  answers: readonly number[],
  schedule: ScheduleByOutcome,
): Record<OutcomeKey, number> {
  const score: Record<OutcomeKey, number> = { v: 0, p: 0, ym: 0, y: 0, r: 0, n: 0 };
  for (let q = 0; q < questions.length; q++) {
    const option = questions[q].options[answers[q]];
    if (!option) continue;
    for (const key of OUTCOME_KEYS) {
      score[key] += option.points[key] ?? 0;
    }
  }
  const bucket = chosenBucket(answers);
  if (bucket) {
    for (const key of OUTCOME_KEYS) {
      if (schedule[key].some((s) => slotBucket(s) === bucket)) score[key] += BUCKET_BONUS;
    }
  }
  return score;
}

/**
 * De rangschikking: hoogste score eerst, bij gelijke score de volgorde
 * v, y, p, ym, r, n. Een uitkomst zonder actieve roostertijden valt af, dus
 * de eerste in deze lijst is altijd een les die je nu kunt volgen. Leeg als
 * het rooster voor geen enkele uitkomst tijden heeft.
 */
export function rankOutcomes(
  answers: readonly number[],
  schedule: ScheduleByOutcome,
): RankedOutcome[] {
  const score = scoreAnswers(answers, schedule);
  return TIE_BREAK_ORDER.filter((key) => schedule[key].length > 0)
    .map((key) => ({ key, score: score[key] }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return TIE_BREAK_ORDER.indexOf(a.key) - TIE_BREAK_ORDER.indexOf(b.key);
    });
}

const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;

export function dayShort(day: number): string {
  return DAY_SHORT[day] ?? "";
}

/** Maandag eerst, zondag laatst. */
function dayOrder(day: number): number {
  return day === 0 ? 7 : day;
}

export function sortSlots(slots: readonly ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => {
    const d = dayOrder(a.day) - dayOrder(b.day);
    return d !== 0 ? d : a.time.localeCompare(b.time);
  });
}

/** "ma 10:30, met Kim" */
export function formatSlot(slot: ScheduleSlot): string {
  const who = slot.trainerFirstName ? `, met ${slot.trainerFirstName}` : "";
  return `${dayShort(slot.day)} ${slot.time}${who}`;
}

/** "ma 10:30" zonder trainer, voor de compacte regel bij "Ook iets voor jou". */
export function formatSlotShort(slot: ScheduleSlot): string {
  return `${dayShort(slot.day)} ${slot.time}`;
}

/** Voornaam van een trainer: het eerste woord van de weergavenaam. */
export function firstName(displayName: string | null | undefined): string {
  return (displayName ?? "").trim().split(/\s+/)[0] ?? "";
}
