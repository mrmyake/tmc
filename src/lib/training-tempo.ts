/**
 * Tempo-notatie voor trainingsschema's (spec-trainingsprotocol.md,
 * besluit 3): vier losse velden (excentrisch, pauze onder, concentrisch,
 * pauze boven), opgeslagen als integers; 0 betekent explosief en wordt
 * overal als "X" getoond, bv. "41X0".
 */

export function tempoDigit(value: number): string {
  return value === 0 ? "X" : String(value);
}

export function tempoNotation(
  eccentric: number,
  pauseBottom: number,
  concentric: number,
  pauseTop: number,
): string {
  return [eccentric, pauseBottom, concentric, pauseTop]
    .map(tempoDigit)
    .join("");
}

/**
 * Invoer in de builder accepteert zowel cijfers als X (hoofdletter-
 * ongevoelig). Geeft null terug bij ongeldige invoer.
 */
export function parseTempoInput(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.toUpperCase() === "X") return 0;
  if (!/^\d{1,2}$/.test(v)) return null;
  return Number(v);
}
