/**
 * Pure kern van de cookiekeuze (spec-conversiemeting.md, Consentmapping).
 * Geen window, geen localStorage: zo is het formaat testbaar en bruikbaar in
 * analytics-gate-core.ts.
 *
 * Formaat v2 in localStorage (sleutel tmc_cookie_consent):
 *   {"v":2,"analytics":"granted|denied","ads":"granted|denied"}
 *
 * Het oude formaat was de kale string "granted" of "denied" en ging alleen
 * over analytische cookies. Zo'n waarde betekent dus nooit
 * advertentietoestemming: analytisch volgt de oude keuze, advertentie blijft
 * denied, en de banner verschijnt eenmalig opnieuw (needsConsentPrompt).
 */

export const CONSENT_KEY = "tmc_cookie_consent";
export const CONSENT_VERSION = 2;

export type ConsentValue = "granted" | "denied";

export interface ConsentChoice {
  /** Analytische cookies: analytics_storage. */
  analytics: ConsentValue;
  /** Advertentiemeting: ad_storage en ad_user_data. */
  ads: ConsentValue;
}

export interface ParsedConsent {
  choice: ConsentChoice;
  /** True bij het oude formaat: er is nooit om advertentiemeting gevraagd. */
  legacy: boolean;
}

/** Wat we bij een boeking of order opslaan (kolom ad_consent). */
export type AdConsent = "granted" | "denied" | "unknown";

function isConsentValue(value: unknown): value is ConsentValue {
  return value === "granted" || value === "denied";
}

export function parseStoredConsent(raw: string | null | undefined): ParsedConsent | null {
  if (!raw) return null;
  if (isConsentValue(raw)) {
    return { choice: { analytics: raw, ads: "denied" }, legacy: true };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (value.v !== CONSENT_VERSION) return null;
    if (!isConsentValue(value.analytics) || !isConsentValue(value.ads)) return null;
    return { choice: { analytics: value.analytics, ads: value.ads }, legacy: false };
  } catch {
    return null;
  }
}

export function serializeConsent(choice: ConsentChoice): string {
  return JSON.stringify({ v: CONSENT_VERSION, analytics: choice.analytics, ads: choice.ads });
}

/** Geen keuze, een onleesbare waarde of het oude formaat: banner tonen. */
export function needsConsentPrompt(parsed: ParsedConsent | null): boolean {
  return parsed === null || parsed.legacy;
}

/**
 * Consent Mode v2 voor gtag('consent', 'default' | 'update', ...).
 * ad_personalization blijft altijd denied: geen remarketing.
 */
export function consentModeState(parsed: ParsedConsent | null): {
  analytics_storage: ConsentValue;
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: "denied";
} {
  const analytics = parsed?.choice.analytics ?? "denied";
  // Het oude formaat is nooit advertentietoestemming.
  const ads = parsed && !parsed.legacy ? parsed.choice.ads : "denied";
  return {
    analytics_storage: analytics,
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: "denied",
  };
}

/** Advertentiekeuze voor opslag: zonder v2-keuze is hij onbekend. */
export function adConsentFromParsed(parsed: ParsedConsent | null): AdConsent {
  if (!parsed || parsed.legacy) return "unknown";
  return parsed.choice.ads;
}

/** Analytische keuze voor opslag (lead_attributions.analytics_consent). */
export function analyticsConsentFromParsed(parsed: ParsedConsent | null): AdConsent {
  if (!parsed) return "unknown";
  return parsed.choice.analytics;
}

export function normalizeAdConsent(value: unknown): AdConsent {
  return value === "granted" || value === "denied" ? value : "unknown";
}
