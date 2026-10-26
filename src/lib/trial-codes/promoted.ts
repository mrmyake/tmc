/**
 * De proefcode die de marketingsite zelf noemt (Google Ads-campagnes,
 * fix/ads-landingspaginas-movenow). Alleen de naam staat hier; of de code
 * bestaat, nog geldig is en tot wanneer, zoekt de server bij elke render op
 * in tmc.trial_codes (lookupPromotedTrialCode). Is de code op, ingetrokken
 * of verlopen, dan verdwijnt de vermelding op /proefles vanzelf.
 */
export const PROMOTED_TRIAL_CODE = "MOVENOW";

/** Wat /proefles van de aangeprezen code toont; null = niets tonen. */
export interface PromotedTrialCode {
  code: string;
  /** Laatste geldige kalenderdag (YYYY-MM-DD, Europe/Amsterdam) of null zonder einddatum. */
  validThrough: string | null;
}

/** "26 november 2026" uit een YYYY-MM-DD-datum, zonder tijdzoneverschuiving. */
export function formatValidThrough(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** De tekst op de kaart "Ik heb een code" op /proefles. */
export function promotedCodeText(promoted: PromotedTrialCode): string {
  // COPY: confirm met Marlon
  const base = `Gratis proefles met code ${promoted.code}. Voor nieuwe leden, voor een groepsles of vrij trainen.`;
  if (!promoted.validThrough) return base;
  // COPY: confirm met Marlon
  return `${base} Geldig t/m ${formatValidThrough(promoted.validThrough)}.`;
}
