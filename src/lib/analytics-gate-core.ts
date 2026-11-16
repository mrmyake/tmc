/**
 * Pure kern van AnalyticsGate: geen React, geen globals buiten de
 * meegegeven window-achtige. Zo is de gate testbaar zonder browser.
 * Zie `spec-analytics-scope.md` en `src/lib/analytics-scope.ts`.
 */
import { isMeasuredPath } from "@/lib/analytics-scope";

export const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";
export const STAFF_COOKIE = "tmc_staff";
const CONSENT_KEY = "tmc_cookie_consent";

export interface GateWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __tmcConsentInit?: boolean;
  __tmcHistoryGuard?: boolean;
  localStorage?: { getItem(key: string): string | null };
  [key: string]: unknown;
}

/** Het deel van Capacitor dat de gate nodig heeft (voor mocks in tests). */
export interface NativeProbe {
  isNativePlatform(): boolean;
}

export function disableKey(id: string = GA_MEASUREMENT_ID): string {
  return `ga-disable-${id}`;
}

/**
 * Zet de officiele GA4-uitschakelaar. Idempotent. Native: altijd true,
 * ook op marketingpaden. Retourneert of gtag.js geladen mag worden.
 */
export function syncGate(
  win: GateWindow,
  pathname: string,
  native: NativeProbe,
): boolean {
  const isNative = safeNative(native);
  const measured = isMeasuredPath(pathname);
  const disabled = isNative || !measured;
  // Alleen schrijven bij een wijziging (idempotent, geen onnodige writes).
  if (win[disableKey()] !== disabled) win[disableKey()] = disabled;
  return !disabled;
}

function safeNative(native: NativeProbe): boolean {
  try {
    return native.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Consent Mode v2 defaults, exact dezelfde inhoud als het vroegere
 * head-script in layout.tsx. Maximaal een keer per page lifecycle.
 */
export function ensureConsentDefaults(win: GateWindow): void {
  if (win.__tmcConsentInit) return;
  win.__tmcConsentInit = true;
  win.dataLayer = win.dataLayer || [];
  const layer = win.dataLayer;
  win.gtag = function gtag() {
    // gtag.js verwacht het arguments-object, geen array.
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  let stored: string | null = null;
  try {
    stored = win.localStorage?.getItem(CONSENT_KEY) ?? null;
  } catch {
    /* localStorage geblokkeerd */
  }
  const state = stored === "granted" ? "granted" : "denied";
  win.gtag("consent", "default", {
    analytics_storage: state,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
}

export function hasStaffCookie(cookieString: string): boolean {
  return new RegExp(`(?:^|;\\s*)${STAFF_COOKIE}=1(?:;|$)`).test(cookieString);
}

/** Config voor gtag('config'): traffic_type staat er vanaf de eerste hit in. */
export function buildGaConfig(
  cookieString: string,
  isProduction: boolean,
): Record<string, unknown> {
  const internal = !isProduction || hasStaffCookie(cookieString);
  return {
    send_page_view: false,
    ...(internal ? { traffic_type: "internal" } : {}),
  };
}

export function staffCookieSet(): string {
  return `${STAFF_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}

export function staffCookieClear(): string {
  return `${STAFF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "trainer";
}

/**
 * gtag.js stuurt via Enhanced Measurement een page_view bij elke
 * history-wijziging, op het moment van pushState en dus voordat React de
 * nieuwe pathname rendert. Zonder ingreep lekt daardoor een hit bij een
 * soft nav naar een productroute. Deze wrapper zet `ga-disable` op basis
 * van de BESTEMMING voordat de history-call doorgaat. Idempotent.
 */
interface HistoryLike {
  pushState: (...a: unknown[]) => unknown;
  replaceState: (...a: unknown[]) => unknown;
}

export function installHistoryGuard(
  win: GateWindow & { history?: HistoryLike; location?: { href: string } },
  native: NativeProbe,
): void {
  if (win.__tmcHistoryGuard || !win.history || !win.location) return;
  win.__tmcHistoryGuard = true;
  const history = win.history;
  const href = () => win.location!.href;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: unknown[]) => {
      try {
        const url = args[2];
        if (url != null) {
          const dest = new URL(String(url), href()).pathname;
          syncGate(win, dest, native);
        }
      } catch {
        /* ongeldige url: laat de history-call zelf falen */
      }
      return original(...args);
    };
  }
}
