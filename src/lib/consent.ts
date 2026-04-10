const CONSENT_KEY = "tmc_cookie_consent";

export type ConsentState = "granted" | "denied" | null;

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as ConsentState;
}

export function setConsent(state: "granted" | "denied") {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, state);

  if (window.gtag) {
    window.gtag("consent", "update", {
      analytics_storage: state,
    });
  }

  // Reload to activate/deactivate GA4
  if (state === "granted") {
    window.location.reload();
  }
}

export function hasConsent(): boolean {
  return getConsent() === "granted";
}
