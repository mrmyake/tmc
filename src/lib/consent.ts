import {
  CONSENT_KEY,
  adConsentFromParsed,
  consentModeState,
  parseStoredConsent,
  serializeConsent,
  type AdConsent,
  type ConsentChoice,
  type ParsedConsent,
} from "@/lib/consent-core";

export type { AdConsent, ConsentChoice } from "@/lib/consent-core";

/** Analytische keuze; null zonder (leesbare) keuze. */
export type ConsentState = "granted" | "denied" | null;

/** Custom event waarmee de link "Cookie-instellingen" de banner heropent. */
export const COOKIE_SETTINGS_EVENT = "tmc:open-cookie-settings";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

/**
 * De opgeslagen keuze (formaat v2 of het oude formaat, zie consent-core.ts).
 * Null op de server, zonder keuze of bij geblokkeerde localStorage.
 */
export function getStoredConsent(): ParsedConsent | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredConsent(window.localStorage.getItem(CONSENT_KEY));
  } catch {
    // localStorage geblokkeerd (privemodus, geweigerde site-data).
    return null;
  }
}

/** De keuze voor analytische cookies. */
export function getConsent(): ConsentState {
  return getStoredConsent()?.choice.analytics ?? null;
}

export function hasConsent(): boolean {
  return getConsent() === "granted";
}

/**
 * De advertentiekeuze van dit moment, voor opslag bij een boeking of order
 * (kolom ad_consent). Het oude formaat en "geen keuze" zijn unknown, en
 * unknown telt server-side als denied.
 */
export function adConsentFromBanner(): AdConsent {
  return adConsentFromParsed(getStoredConsent());
}

/**
 * Slaat de keuze op (formaat v2) en meldt hem aan Consent Mode. gtag bestaat
 * op gemeten paden vanaf de eerste render (AnalyticsGate zet de stub en de
 * defaults); elders is dit alleen de opslag.
 *
 * ad_personalization gaat altijd als denied mee: geen remarketing.
 */
export function setConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  const before = getConsent();
  try {
    window.localStorage.setItem(CONSENT_KEY, serializeConsent(choice));
  } catch {
    // Opslaan lukt niet: de keuze geldt dan alleen voor deze paginaweergave.
  }

  if (window.gtag) {
    window.gtag(
      "consent",
      "update",
      consentModeState({ choice, legacy: false }),
    );
    // Analytisch gaat nu pas aan: stuur alsnog een pageview voor de huidige
    // pagina (Consent Mode bewaart de wachtende hit niet). Niet bij een
    // keuze die analytisch al aan had staan, anders telt de pagina dubbel.
    if (choice.analytics === "granted" && before !== "granted") {
      window.gtag("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }
}

/** Heropent de banner met de huidige keuze voorgevuld. */
export function openCookieSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
