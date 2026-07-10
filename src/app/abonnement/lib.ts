import { commit24mDiscountPercent, type CatalogueRow } from "@/lib/catalogue";

export const FAMILIES = ["groepslessen", "vrij_trainen", "all_inclusive"] as const;
export type FamilyKey = (typeof FAMILIES)[number];

export const FREQUENCIES = ["2x", "3x", "unl"] as const;
export type FrequencyKey = (typeof FREQUENCIES)[number];

// COPY: confirm met Marlon
export const FAMILY_LABELS: Record<FamilyKey, string> = {
  groepslessen: "Groepslessen",
  vrij_trainen: "Vrij Trainen",
  all_inclusive: "All Access",
};

// COPY: confirm met Marlon
export const FREQUENCY_LABELS: Record<FrequencyKey, string> = {
  "2x": "2× per week",
  "3x": "3× per week",
  unl: "Onbeperkt",
};

/** tmc.catalogue modelleert elke familie x frequentie als een losse, discrete slug. */
export function planSlug(family: FamilyKey, frequency: FrequencyKey): string {
  return `${family}_${frequency}`;
}

export interface Selection {
  family: FamilyKey;
  frequency: FrequencyKey;
  extendedAccess: boolean;
  commit24m: boolean;
}

export interface PriceBreakdown {
  /** Early Member actief voor déze rij (fase open EN rij eligible). */
  emOpen: boolean;
  hasEmDiscount: boolean;
  /** Catalogusprijs zonder EM/24m, voor de doorgestreepte vergelijkingsprijs. */
  baseCatalogueCents: number;
  /** Wat create_order() als recurring basisbedrag zou rekenen (excl. add-on). */
  chargeCents: number;
  extendedAccessCents: number;
  recurringTotalCents: number;
  signupFeeCents: number;
  commitMonths: number;
  commit24mAvailable: boolean;
  commit24mDiscountPercent: number | null;
}

/**
 * Spiegelt de weergavelogica die tmc._compute_order_price() server-side
 * toepast: zelfde EM-gate, 24m-factor en fee-waiver, zodat wat hier getoond
 * wordt niet kan afwijken van wat create_order() daadwerkelijk rekent. Deze
 * functie berekent alleen weergave, nooit het bedrag dat naar Mollie gaat
 * (dat komt terug via createOrderAndCheckout's amountCents).
 */
export function computeBreakdown(params: {
  plan: CatalogueRow;
  extendedAccessAddon: CatalogueRow | undefined;
  signupFee: CatalogueRow | undefined;
  extendedAccess: boolean;
  commit24m: boolean;
  emActive: boolean;
}): PriceBreakdown {
  const { plan, extendedAccessAddon, signupFee, extendedAccess, commit24m, emActive } = params;

  const emOpen = emActive && plan.early_member_eligible;
  const hasEmDiscount =
    emOpen &&
    plan.early_member_price_cents !== null &&
    plan.early_member_price_cents !== plan.price_cents;

  const commit24mAvailable = !emOpen && plan.price_cents_24m_computed !== null;
  const applyCommit24m = commit24m && commit24mAvailable;

  let chargeCents: number;
  if (emOpen) {
    chargeCents = hasEmDiscount ? plan.early_member_price_cents! : plan.price_cents;
  } else if (applyCommit24m) {
    chargeCents = plan.price_cents_24m_computed!;
  } else {
    chargeCents = plan.price_cents;
  }

  const extendedAccessCents =
    extendedAccess && plan.extended_access_mode === "addon" && extendedAccessAddon
      ? extendedAccessAddon.price_cents
      : 0;

  const signupFeeCents = emOpen ? 0 : signupFee?.price_cents ?? 0;

  const commitMonths = emOpen
    ? plan.early_member_commit_months ?? 0
    : applyCommit24m
    ? 24
    : plan.commit_months ?? 0;

  return {
    emOpen,
    hasEmDiscount,
    baseCatalogueCents: plan.price_cents,
    chargeCents,
    extendedAccessCents,
    recurringTotalCents: chargeCents + extendedAccessCents,
    signupFeeCents,
    commitMonths,
    commit24mAvailable,
    commit24mDiscountPercent: commit24mDiscountPercent(plan),
  };
}
