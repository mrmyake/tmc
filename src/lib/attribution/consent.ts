import { getConsent } from "@/lib/consent";
import {
  hasAttribution,
  type AdConsent,
  type AttributionParams,
  type LeadAttributionInput,
} from "./params";

/**
 * Client-side: de bestaande bannerkeuze (src/lib/consent.ts, localStorage
 * tmc_cookie_consent) naar ad_consent. Alleen lezen van de bestaande sleutel,
 * geen nieuwe opslag.
 *
 * De banner kent een categorie (analytische cookies, analytics_storage); de
 * advertentiecategorieen van Consent Mode (ad_storage, ad_user_data,
 * ad_personalization) staan in de layout vast op denied. Accepteren wordt
 * hier dus granted, weigeren denied, geen keuze unknown. Wat dat betekent
 * voor een latere upload met ad_user_data staat in
 * spec-marketing-attribution.md.
 */
export function adConsentFromBanner(): AdConsent {
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
  return { ...params, ad_consent: adConsentFromBanner() };
}
