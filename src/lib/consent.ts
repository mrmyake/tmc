const CONSENT_KEY = "tmc_cookie_consent";

export type ConsentState = "granted" | "denied" | null;

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as ConsentState;
}

/**
 * Update consent-state + roep gtag("consent", "update", ...) aan.
 * gtag.js is altijd geladen vanaf eerste paint (zie layout.tsx
 * inline consent-defaults script + GoogleAnalytics component), dus
 * gtag bestaat op het moment dat dit wordt aangeroepen.
 *
 * Geen `window.location.reload()` meer — gtag honoreert de nieuwe
 * consent-state direct voor volgende pageviews en events.
 */
export function setConsent(state: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, state);

  if (window.gtag) {
    window.gtag("consent", "update", {
      analytics_storage: state,
    });
    // Als accepted: stuur alsnog een pageview voor de huidige pagina
    // (Consent Mode retained de pending hit niet). Voor denied hoeft
    // niets — cookieless pings blijven functioneren vanaf dit punt.
    if (state === "granted") {
      window.gtag("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }
}

export function hasConsent(): boolean {
  return getConsent() === "granted";
}
