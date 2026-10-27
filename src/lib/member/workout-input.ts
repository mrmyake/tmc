/**
 * Invoerregels voor de workout-logger (spec-trainingsprotocol.md PR 4
 * vervolg, fix/workout-logging). Pure functies, geen React en geen
 * "server-only": draaien in de client en onder de node:test-runner
 * (scripts/workout-logging/parse-input.test.mts).
 *
 * Aanleiding: het gewichtveld was <input type="number">. Een komma
 * ("82,5") maakt de value daar in veel browsers stil leeg, waarna de
 * validatie de save blokkeerde. Beide velden zijn nu tekstvelden en deze
 * module bepaalt wat geldig is.
 *
 * Vier uitkomsten:
 *   empty       veld is leeg (of alleen spaties); niets te doen
 *   incomplete  tussenstand zoals "82," of ","; niet opslaan, geen melding
 *               zolang het veld focus heeft
 *   invalid     wel iets ingevuld, maar geen geldige waarde; altijd een
 *               melding bij de rij, nooit stil leegmaken
 *   valid       een getal
 */

export type ParseResult =
  | { kind: "empty" }
  | { kind: "incomplete" }
  | { kind: "invalid"; message: string }
  | { kind: "valid"; value: number };

// COPY: confirm met Marlon
export const WEIGHT_INVALID_COPY = "Vul een geldig gewicht in.";
// COPY: confirm met Marlon
export const WEIGHT_TOO_PRECISE_COPY = "Maximaal 2 decimalen.";
// COPY: confirm met Marlon
export const WEIGHT_TOO_LARGE_COPY = "Maximaal 999,99 kg.";
// COPY: confirm met Marlon
export const REPS_INVALID_COPY = "Vul een geldig aantal reps in.";
// COPY: confirm met Marlon
export const REPS_MIN_COPY = "Minimaal 1 rep.";

/** Gewicht in kg: 0 (lichaamsgewicht) tot 999,99, komma of punt, maximaal 2 decimalen. */
export function parseWeightInput(raw: string): ParseResult {
  const s = raw.trim();
  if (s === "") return { kind: "empty" };

  // Alleen een scheidingsteken, of een afsluitend scheidingsteken: tussenstand.
  if (/^[.,]$/.test(s) || /^\d+[.,]$/.test(s)) return { kind: "incomplete" };

  // Toegestaan: cijfers, optioneel een scheidingsteken met cijfers erachter,
  // of een scheidingsteken met cijfers erachter zonder cijfers ervoor (",5").
  const m = /^(\d*)(?:[.,](\d+))?$/.exec(s);
  if (!m) return { kind: "invalid", message: WEIGHT_INVALID_COPY };

  const whole = m[1] ?? "";
  const frac = m[2] ?? "";
  if (whole === "" && frac === "") return { kind: "invalid", message: WEIGHT_INVALID_COPY };
  if (frac.length > 2) return { kind: "invalid", message: WEIGHT_TOO_PRECISE_COPY };

  const value = Number(`${whole === "" ? "0" : whole}.${frac === "" ? "0" : frac}`);
  if (!Number.isFinite(value)) return { kind: "invalid", message: WEIGHT_INVALID_COPY };
  if (value > 999.99) return { kind: "invalid", message: WEIGHT_TOO_LARGE_COPY };

  return { kind: "valid", value };
}

/** Reps: een geheel getal van minimaal 1. */
export function parseRepsInput(raw: string): ParseResult {
  const s = raw.trim();
  if (s === "") return { kind: "empty" };
  if (!/^\d+$/.test(s)) return { kind: "invalid", message: REPS_INVALID_COPY };
  const value = Number(s);
  if (!Number.isSafeInteger(value)) return { kind: "invalid", message: REPS_INVALID_COPY };
  if (value < 1) return { kind: "invalid", message: REPS_MIN_COPY };
  return { kind: "valid", value };
}

/** Een opgeslagen waarde terug naar invoertekst, Nederlands (komma). */
export function formatWeightForInput(weightKg: number): string {
  return String(weightKg).replace(".", ",");
}
