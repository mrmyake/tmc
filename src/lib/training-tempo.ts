/**
 * Tempo-notatie voor trainingsschema's (spec-trainingsprotocol.md,
 * besluit 3): vier losse velden (excentrisch, pauze onder, concentrisch,
 * pauze boven), opgeslagen als integers. X (explosief) wordt opgeslagen
 * als TEMPO_EXPLOSIVE (-1); 0 is letterlijk 0 seconden (bv. geen pauze).
 * Nieuwe consumenten lezen tempo altijd via deze module, nooit rechtstreeks
 * als seconden.
 */

export const TEMPO_EXPLOSIVE = -1;

export function tempoDigit(value: number): string {
  return value === TEMPO_EXPLOSIVE ? "X" : String(value);
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
 * Invoer in de builder accepteert cijfers 0 t/m 20 en X (hoofdletter-
 * ongevoelig). Geeft null terug bij ongeldige invoer.
 */
export function parseTempoInput(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.toUpperCase() === "X") return TEMPO_EXPLOSIVE;
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n <= 20 ? n : null;
}

// COPY: confirm met Marlon
function secondsPhrase(
  value: number,
  explosiveWord: string,
  zeroWord: string,
  unit: string,
): string {
  if (value === TEMPO_EXPLOSIVE) return explosiveWord;
  if (value === 0) return zeroWord;
  return `${value} sec ${unit}`;
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
    secondsPhrase(eccentric, "explosief zakken", "0 sec zakken", "zakken"),
    secondsPhrase(pauseBottom, "explosief", "geen pauze onder", "pauze onder"),
    secondsPhrase(concentric, "explosief omhoog", "0 sec omhoog", "omhoog"),
    secondsPhrase(pauseTop, "explosief", "geen pauze boven", "pauze boven"),
  ].join(", ");
}
