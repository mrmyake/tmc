/**
 * Pure helpers voor een bedragveld waarin je typt zoals je het uitspreekt
 * ("90,50"). Geen server-only en geen React: bruikbaar in client-componenten
 * en in node:test. Alles is integer centen; er wordt nergens met floats
 * gerekend, zodat 0,07 nooit 7.000000000000001 cent wordt.
 *
 * Los van `formatEuro` en `formatEuroCents` in `format.ts`: die tonen een
 * bedrag met euroteken ("€90,-", "€79,00"). Dit zijn de invoervarianten,
 * zonder euroteken.
 */

/** Groepeer een niet-negatief geheel getal (als string) met punten. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Centen naar invoertekst: 9050 -> "90,50", 123450 -> "1.234,50",
 * -1250 -> "-12,50". Geen safe integer geeft "" (er is dan niets eerlijks
 * te tonen).
 */
export function formatEuroInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const sign = cents < 0 ? "-" : "";
  return `${sign}${groupThousands(String(euros))},${rest}`;
}

/**
 * Invoertekst naar centen, of null bij alles wat niet ondubbelzinnig is.
 *
 * - Whitespace en spaties overal genegeerd; optioneel één voorloop-min.
 * - Het laatste scheidingsteken (komma of punt) met precies 1 of 2 cijfers
 *   erachter is de decimaal, mits dat teken maar één keer voorkomt. Alle
 *   andere scheidingstekens zijn duizendtallen en moeten in groepen van drie
 *   staan ("1.2.3" en "12.34.56" zijn null).
 * - Precies 3 cijfers na het laatste teken: bij een punt of bij een teken dat
 *   vaker voorkomt is het een duizendtal ("1.234" is 1234 euro, "1,234,567"
 *   ook). Een enkele komma met 3 cijfers erachter ("90,505") is een decimaal
 *   met te veel cijfers en dus null: nooit stil afronden.
 * - Geen scheidingsteken, of een afsluitend teken zonder cijfers ("90,"):
 *   hele euro's.
 * - Meer dan 3 cijfers na het laatste teken, lege invoer, een teken zonder
 *   cijfers ervoor of andere tekens: null.
 */
export function parseEuroInput(raw: string): number | null {
  const compact = raw.replace(/\s+/g, "");
  const negative = compact.startsWith("-");
  const body = negative ? compact.slice(1) : compact;
  if (!/^[0-9.,]+$/.test(body) || !/[0-9]/.test(body)) return null;

  const lastSep = Math.max(body.lastIndexOf(","), body.lastIndexOf("."));

  let intPart: string;
  let decimals = "";
  if (lastSep === -1) {
    intPart = body;
  } else {
    const sepChar = body[lastSep];
    const after = body.slice(lastSep + 1);
    const before = body.slice(0, lastSep);
    const sepCount = body.split(sepChar).length - 1;

    if (after.length === 0) {
      intPart = before;
    } else if (after.length <= 2) {
      if (sepCount > 1) return null;
      intPart = before;
      decimals = after;
    } else if (after.length === 3) {
      if (sepChar === "," && sepCount === 1) return null;
      intPart = body;
    } else {
      return null;
    }
  }

  // Het gehele deel: cijfers, of groepen van drie met één soort teken.
  let digits: string;
  if (/^\d+$/.test(intPart)) {
    digits = intPart;
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(intPart)) {
    const seps = new Set(intPart.match(/[.,]/g));
    if (seps.size !== 1) return null;
    // Het decimaalteken mag niet ook duizendtalteken zijn ("1,234,50").
    if (decimals && seps.has(body[lastSep])) return null;
    digits = intPart.replace(/[.,]/g, "");
  } else {
    return null;
  }

  const cents = Number(digits) * 100 + Number(decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  // `|| 0` voorkomt -0 bij "-0".
  return (negative ? -cents : cents) || 0;
}
