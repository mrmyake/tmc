/**
 * Normaliseert een Nederlands telefoonnummer naar E.164 (+31...), ongeacht
 * de weergavespatiëring (spaties, streepjes, voorloop-0). Gebruikt op elke
 * plek die een tel:-link of het JSON-LD telephone-veld bouwt, zodat het
 * onderliggende nummer nooit fout is ook als de weergavetekst een andere
 * groepering gebruikt of uit Sanity komt zonder gegarandeerde opmaak.
 */
export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+31${digits.slice(1)}`;
  return `+31${digits}`;
}

export function toTelHref(raw: string): string {
  return `tel:${toE164(raw)}`;
}
