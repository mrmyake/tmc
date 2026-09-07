"use client";

/**
 * Leest de GA4 client_id en session_id van de lopende sessie, voor de
 * conversiebrug (spec-analytics.md): de id's reizen via tmc.orders mee naar
 * de Mollie-webhook, die er het server-side purchase-event aan hangt.
 *
 * Best-effort met een harde timeout van 300 ms per veld, want:
 * - gtag('get') resolvet pas wanneer gtag.js daadwerkelijk geladen is, en
 *   DeferredAnalytics laadt die pas na eerste interactie of idle. Op de
 *   configurator is dat vrijwel altijd al gebeurd, maar de checkout mag
 *   nooit op analytics wachten.
 * - Bij consent denied (Consent Mode v2, default op deze site) bestaat er
 *   geen _ga-cookie en geen stabiele id. Dan resolven beide velden naar
 *   undefined en gaat de flow gewoon door — een order zonder client_id is
 *   de normale situatie, geen fout. De webhook slaat het purchase-event
 *   dan over.
 *
 * Fallback voor client_id: de _ga-cookie zelf ("GA1.1.<a>.<b>" → "<a>.<b>"),
 * synchroon en zonder gtag.js. Voor session_id is er bewust geen
 * cookie-fallback; die komt alleen via gtag('get').
 */

const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";
const TIMEOUT_MS = 300;

function gtagGet(field: "client_id" | "session_id"): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") {
      resolve(undefined);
      return;
    }
    try {
      window.gtag("get", GA_MEASUREMENT_ID, field, (value: unknown) => {
        resolve(
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : undefined,
        );
      });
    } catch {
      resolve(undefined);
    }
  });
}

function withTimeout(p: Promise<string | undefined>): Promise<string | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), TIMEOUT_MS),
    ),
  ]);
}

/** _ga-cookie: "GA1.1.<a>.<b>" → client_id "<a>.<b>". */
function clientIdFromCookie(): string | undefined {
  try {
    const match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
    if (!match) return undefined;
    const parts = decodeURIComponent(match[1]).split(".");
    if (parts.length < 4) return undefined;
    return parts.slice(2).join(".");
  } catch {
    return undefined;
  }
}

export interface GaIds {
  clientId?: string;
  sessionId?: string;
}

export async function readGaIds(): Promise<GaIds> {
  if (typeof window === "undefined") return {};
  const [clientId, sessionId] = await Promise.all([
    withTimeout(gtagGet("client_id")),
    withTimeout(gtagGet("session_id")),
  ]);
  return {
    clientId: clientId ?? clientIdFromCookie(),
    sessionId,
  };
}
