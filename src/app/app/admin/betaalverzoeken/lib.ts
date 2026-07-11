import {
  FAMILIES,
  FREQUENCIES,
  FREQUENCY_LABELS,
  planSlug,
  computeBreakdown,
  type FamilyKey,
  type FrequencyKey,
  type PriceBreakdown,
} from "@/app/abonnement/lib";
import type { CatalogueRow } from "@/lib/catalogue";

/**
 * WS-5 PR C: rekenlogica UITSLUITEND hergebruikt uit de publieke
 * configurator (src/app/abonnement/lib.ts), die zelf tmc._compute_order_price
 * spiegelt. Geen nieuwe prijsformules hier. Wat hier staat is puur
 * presentatie: welke 7 rijen getoond worden en in welke groep, in
 * admin-stijl in plaats van de full-bleed publieke kaarten-UI (die breekt
 * naast de vaste admin-sidebar).
 *
 * Early Member is in de admin-wizard altijd uit: createPaymentRequest stuurt
 * p_early_member nooit (WS-5 PR A, bewuste keuze), dus emActive is hier
 * altijd false.
 */
export const EM_ACTIVE = false;

export type SubscriptionRowId =
  | "groepslessen-2x"
  | "groepslessen-3x"
  | "groepslessen-onbeperkt"
  | "vrij-trainen-2x"
  | "vrij-trainen-3x"
  | "vrij-trainen-onbeperkt"
  | "all-access";

interface SubscriptionRowMeta {
  family: FamilyKey;
  frequency: FrequencyKey;
  /** Kan naar de all_inclusive-rij op dezelfde frequentie swappen (plus-30). */
  hasVtToggle: boolean;
}

// COPY: confirm met Marlon
export const SUBSCRIPTION_ROW_LABELS: Record<SubscriptionRowId, string> = {
  "groepslessen-2x": "Groepslessen 2x/wk",
  "groepslessen-3x": "Groepslessen 3x/wk",
  "groepslessen-onbeperkt": "Groepslessen onbeperkt",
  "vrij-trainen-2x": "Vrij Trainen 2x/wk",
  "vrij-trainen-3x": "Vrij Trainen 3x/wk",
  "vrij-trainen-onbeperkt": "Vrij Trainen onbeperkt",
  "all-access": "All Access",
};

export const SUBSCRIPTION_ROW_META: Record<
  Exclude<SubscriptionRowId, "all-access">,
  SubscriptionRowMeta
> = {
  "groepslessen-2x": { family: "groepslessen", frequency: "2x", hasVtToggle: true },
  "groepslessen-3x": { family: "groepslessen", frequency: "3x", hasVtToggle: true },
  "groepslessen-onbeperkt": {
    family: "groepslessen",
    frequency: "unl",
    hasVtToggle: false,
  },
  "vrij-trainen-2x": { family: "vrij_trainen", frequency: "2x", hasVtToggle: false },
  "vrij-trainen-3x": { family: "vrij_trainen", frequency: "3x", hasVtToggle: false },
  "vrij-trainen-onbeperkt": {
    family: "vrij_trainen",
    frequency: "unl",
    hasVtToggle: false,
  },
};

export const SUBSCRIPTION_ROWS: SubscriptionRowId[] = [
  "groepslessen-2x",
  "groepslessen-3x",
  "groepslessen-onbeperkt",
  "vrij-trainen-2x",
  "vrij-trainen-3x",
  "vrij-trainen-onbeperkt",
  "all-access",
];

export { FAMILIES, FREQUENCIES, FREQUENCY_LABELS, planSlug, computeBreakdown };
export type { PriceBreakdown };

export interface SubscriptionRowToggle {
  /** Plus-30: swap naar all_inclusive op dezelfde frequentie. Alleen 2x/3x. */
  vt: boolean;
  ext: boolean;
}

export const DEFAULT_SUBSCRIPTION_TOGGLE: SubscriptionRowToggle = {
  vt: false,
  ext: false,
};

/** Enige resolutie naar een catalogus-rij: planSlug(), geen optelling. */
export function resolveSubscriptionPlan(
  id: SubscriptionRowId,
  toggle: SubscriptionRowToggle,
  plans: Record<string, CatalogueRow>,
): CatalogueRow | undefined {
  if (id === "all-access") return plans[planSlug("all_inclusive", "unl")];
  const meta = SUBSCRIPTION_ROW_META[id];
  const family: FamilyKey = meta.hasVtToggle && toggle.vt ? "all_inclusive" : meta.family;
  return plans[planSlug(family, meta.frequency)];
}

/** Rijen die admin_create_order via createPaymentRequest mag verkopen. Geen drop-in. */
export const PRODUCT_SLUGS = [
  "ten_ride_card",
  "pt_single",
  "pt_10",
  "duo_single",
  "duo_10",
] as const;
export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

// COPY: confirm met Marlon
export const PRODUCT_LABELS: Record<ProductSlug, string> = {
  ten_ride_card: "Strippenkaart 10 ritten groepslessen",
  pt_single: "Losse PT-les",
  pt_10: "PT 10-rittenkaart",
  duo_single: "Losse Duo-training",
  duo_10: "Duo 10-rittenkaart",
};
