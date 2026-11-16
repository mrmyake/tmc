/**
 * Pure kern van de server-side GA4-events (Measurement Protocol), zonder
 * netwerk, database of server-only. Alle regels uit spec-conversiemeting.md
 * ("MP-regels") staan hier, zodat ze zonder mocks testbaar zijn.
 *
 * - Geen client_id: geen event (null). Er is dan geen sessie om aan toe te
 *   rekenen (consent denied, member-app, admin-betaallink).
 * - Geen user_id, nooit.
 * - consent staat op requestniveau: ad_user_data volgt de opgeslagen
 *   ad_consent (unknown telt als denied), ad_personalization is altijd
 *   DENIED.
 * - Buiten productie krijgt elk event traffic_type "internal" en
 *   debug_mode true, net als de client-hits.
 */
import { normalizeAdConsent, type AdConsent } from "@/lib/consent-core";

export const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";
export const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";
export const MP_DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect";

export { normalizeAdConsent };
export type { AdConsent };

type MpParamValue = string | number | boolean | MpItem[];

export interface MpItem {
  item_id: string;
  item_name?: string;
  item_category?: string;
  quantity: number;
}

export interface MpPayload {
  client_id: string;
  consent: { ad_user_data: "GRANTED" | "DENIED"; ad_personalization: "DENIED" };
  events: [{ name: string; params: Record<string, MpParamValue> }];
}

export function isProductionEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}

/** Consent-object van het MP-request. unknown telt als denied. */
export function mpConsent(adConsent: unknown): MpPayload["consent"] {
  return {
    ad_user_data: normalizeAdConsent(adConsent) === "granted" ? "GRANTED" : "DENIED",
    ad_personalization: "DENIED",
  };
}

/** Eventparameters die alleen buiten productie meegaan. */
export function mpEnvParams(isProduction: boolean): Record<string, string | boolean> {
  return isProduction ? {} : { traffic_type: "internal", debug_mode: true };
}

/** GA4 client_id: "<getal>.<getal>" uit gtag of de _ga-cookie. */
export function sanitizeGaClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._-]{1,100}$/.test(trimmed) ? trimmed : null;
}

/** GA4 session_id: een positief getal (de documentatie eist ^\d+$). */
export function sanitizeGaSessionId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return /^\d{1,20}$/.test(trimmed) ? trimmed : null;
}

const ACTION_PAGE_RE = /^[a-z0-9-]{1,64}$/;

/** Zelfde vorm als de CHECK op tmc.trial_bookings.action_page. */
export function sanitizeActionPage(value: unknown): string | null {
  return typeof value === "string" && ACTION_PAGE_RE.test(value) ? value : null;
}

// ---- purchase ----

export type ItemCategory = "abonnement" | "rittenkaart" | "pt" | "programma" | "overig";

/**
 * tmc.catalogue naar item_category. Leidend is revenue_category; de
 * rittenkaart deelt 'les_tegoed' met de losse les en wordt daarom op slug
 * herkend. pt_10 en duo_10 heten ook rittenkaart maar zijn personal
 * training. Een onbekende of ontbrekende rij is "overig".
 */
export function itemCategoryFor(
  row: { slug: string; revenue_category: string | null } | null | undefined,
): ItemCategory {
  if (!row) return "overig";
  if (row.revenue_category === "abonnement") return "abonnement";
  if (row.revenue_category === "personal_training") return "pt";
  if (row.revenue_category === "programma") return "programma";
  if (row.slug === "ten_ride_card" || row.slug.startsWith("ten_ride_card_")) {
    return "rittenkaart";
  }
  return "overig";
}

export interface PurchasePayloadInput {
  orderId: string;
  /** Het bedrag dat Mollie verwerkte, in centen. Nooit herberekend. */
  amountCents: number;
  clientId: string | null | undefined;
  sessionId: string | null | undefined;
  adConsent: unknown;
  catalogueSlug: string;
  /** De catalogusrij, of null als die niet te lezen was (dan alleen item_id). */
  catalogue: { display_name: string | null; revenue_category: string | null } | null;
  isProduction: boolean;
}

export function buildPurchasePayload(input: PurchasePayloadInput): MpPayload | null {
  const clientId = sanitizeGaClientId(input.clientId);
  if (!clientId) return null;
  const sessionId = sanitizeGaSessionId(input.sessionId);

  const item: MpItem = { item_id: input.catalogueSlug, quantity: 1 };
  if (input.catalogue) {
    if (input.catalogue.display_name) item.item_name = input.catalogue.display_name;
    item.item_category = itemCategoryFor({
      slug: input.catalogueSlug,
      revenue_category: input.catalogue.revenue_category,
    });
  }

  return {
    client_id: clientId,
    consent: mpConsent(input.adConsent),
    events: [
      {
        name: "purchase",
        params: {
          ...(sessionId ? { session_id: sessionId } : {}),
          transaction_id: input.orderId,
          currency: "EUR",
          value: input.amountCents / 100,
          items: [item],
          ...mpEnvParams(input.isProduction),
        },
      },
    ],
  };
}

// ---- trial_booked ----

export type TrialType = "paid" | "code" | "free";

/** tmc.trial_bookings.source naar trial_type. */
export function trialTypeForSource(source: string | null | undefined): TrialType | null {
  if (source === "paid") return "paid";
  if (source === "code") return "code";
  if (source === "opening") return "free";
  return null;
}

/**
 * De parameter code: een unieke code (max_uses = 1) gaat als "uniek" mee,
 * elke andere (gedeelde campagnecodes zoals MOVENOW en JOUWYOGA) letterlijk.
 */
export function trialCodeParam(
  code: { code: string | null; max_uses: number | null } | null | undefined,
): string | null {
  if (!code || !code.code) return null;
  return code.max_uses === 1 ? "uniek" : code.code;
}

export interface TrialBookedPayloadInput {
  trialBookingId: string;
  isTest: boolean;
  isProduction: boolean;
  clientId: string | null | undefined;
  sessionId: string | null | undefined;
  adConsent: unknown;
  /** tmc.trial_bookings.source: paid, code of opening. */
  source: string | null | undefined;
  /** class_sessions.pillar van de geboekte sessie. */
  pillar: string | null | undefined;
  /** De ingewisselde code (alleen bij source code). */
  code: { code: string | null; max_uses: number | null } | null | undefined;
  /** tmc.trial_bookings.action_page; null zolang er geen actiepagina is. */
  actionPage: string | null | undefined;
  /**
   * paid: het bedrag dat Mollie verwerkte. code en free: de drop-in-prijs van
   * de pillar uit tmc.catalogue. Null als het bedrag onbekend is; dan gaan
   * value en currency niet mee.
   */
  valueCents: number | null | undefined;
}

export function buildTrialBookedPayload(input: TrialBookedPayloadInput): MpPayload | null {
  // In productie nooit voor een testboeking. Buiten productie is elke
  // boeking een testboeking en vuurt het event wel, als intern verkeer.
  if (input.isTest && input.isProduction) return null;
  const clientId = sanitizeGaClientId(input.clientId);
  if (!clientId) return null;
  const trialType = trialTypeForSource(input.source);
  if (!trialType) return null;

  const sessionId = sanitizeGaSessionId(input.sessionId);
  const code = trialType === "code" ? trialCodeParam(input.code) : null;
  const actionPage = sanitizeActionPage(input.actionPage);
  const hasValue =
    typeof input.valueCents === "number" &&
    Number.isFinite(input.valueCents) &&
    input.valueCents >= 0;

  return {
    client_id: clientId,
    consent: mpConsent(input.adConsent),
    events: [
      {
        name: "trial_booked",
        params: {
          ...(sessionId ? { session_id: sessionId } : {}),
          trial_type: trialType,
          ...(input.pillar ? { pillar: input.pillar } : {}),
          ...(code ? { code } : {}),
          // Optioneel veld: weggelaten zolang er geen actiepagina is. Nooit
          // een lege string of "none".
          ...(actionPage ? { action_page: actionPage } : {}),
          transaction_id: input.trialBookingId,
          ...(hasValue ? { currency: "EUR", value: (input.valueCents as number) / 100 } : {}),
          ...mpEnvParams(input.isProduction),
        },
      },
    ],
  };
}
