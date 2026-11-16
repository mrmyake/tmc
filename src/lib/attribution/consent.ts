import { getConsent } from "@/lib/consent";
import {
  hasAttribution,
  type AnalyticsConsent,
  type AttributionParams,
  type LeadAttributionInput,
} from "./params";

/**
 * Client-side: de bannerkeuze voor analytische cookies (src/lib/consent.ts,
 * localStorage tmc_cookie_consent) naar analytics_consent. Alleen lezen.
 *
 * Sinds spec-conversiemeting.md kent de banner twee categorieen. Deze functie
 * leest uitsluitend de analytische: granted, denied, of unknown zonder keuze.
 * Dat is uitdrukkelijk geen advertentietoestemming. De advertentiekeuze staat
 * los hiervan in ad_consent (adConsentFromBanner) op tmc.trial_bookings en
 * tmc.orders; lead_attributions krijgt bewust geen ad_consent.
 */
export function analyticsConsentFromBanner(): AnalyticsConsent {
  try {
    const consent = getConsent();
    if (consent === "granted") return "granted";
    if (consent === "denied") return "denied";
    return "unknown";
  } catch {
    // localStorage geblokkeerd (privemodus, geweigerde site-data).
    return "unknown";
  }
}

/**
 * Wat de client bij de inzending meestuurt: de parameters uit de URL plus de
 * bannerkeuze van dit moment. Undefined zonder parameters, zodat er niets
 * meegaat en de server geen rij schrijft.
 */
export function leadAttributionForSubmit(
  params: AttributionParams | null | undefined,
): LeadAttributionInput | undefined {
  if (!hasAttribution(params)) return undefined;
  return { ...params, analytics_consent: analyticsConsentFromBanner() };
}
