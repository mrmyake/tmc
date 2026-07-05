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

// COPY: confirm met Marlon
function secondsPhrase(value: number, zeroWord: string, unit: string): string {
  return value === 0 ? zeroWord : `${value} sec ${unit}`;
}

/**
 * Tempo uitgeschreven in begrijpelijke taal naast de "41X0"-notatie,
 * voor de klant-view (spec-trainingsprotocol.md PR 3).
 */
// COPY: confirm met Marlon
export function tempoPlainLanguage(
  eccentric: number,
  pauseBottom: number,
  concentric: number,
  pauseTop: number,
): string {
  return [
    secondsPhrase(eccentric, "explosief zakken", "zakken"),
    secondsPhrase(pauseBottom, "geen pauze onder", "pauze onder"),
    secondsPhrase(concentric, "explosief omhoog", "omhoog"),
    secondsPhrase(pauseTop, "geen pauze boven", "pauze boven"),
  ].join(", ");
}
