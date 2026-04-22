/**
 * PT pricing formula from `docs/member-system/tmc-member-system.md §Pricing engine`.
 *
 * Scope in deze MVP: alleen 1-op-1 format en "single" aankoop (geen
 * strip-card purchase via /app/pt; strip-cards koop je via
 * /app/abonnement/nieuw als pt_package plan). Duo / small_group_4 staan
 * in de enum maar zijn nog niet UI-geactiveerd.
 */

export type PtTier = "premium" | "standard";
export type PtFormat = "one_on_one" | "duo" | "small_group_4";
export type PtPurchaseType = "single" | "ten" | "twenty";

const PRICES: Record<
  PtTier,
  Record<PtFormat, Record<PtPurchaseType, number>>
> = {
  premium: {
    one_on_one: { single: 9500, ten: 85000, twenty: 160000 },
    duo: { single: 12000, ten: 110000, twenty: 200000 },
    small_group_4: { single: 14000, ten: 130000, twenty: 240000 },
  },
  standard: {
    one_on_one: { single: 8000, ten: 72000, twenty: 135000 },
    duo: { single: 10000, ten: 90000, twenty: 170000 },
    small_group_4: { single: 12000, ten: 110000, twenty: 200000 },
  },
};

const INTAKE_PRICE_CENTS = 4500; // 50% off standard 1:1 for first-ever non-Marlon session

interface CalculatePtPriceParams {
  tier: PtTier;
  format: PtFormat;
  purchaseType: PtPurchaseType;
  memberHasActiveSub: boolean;
  isIntakeSession: boolean;
}

export function calculatePtPriceCents(params: CalculatePtPriceParams): number {
  const { tier, format, purchaseType, memberHasActiveSub, isIntakeSession } =
    params;

  // Intake korting: 50% op eerste 1-op-1 sessie bij standaard trainer.
  if (
    isIntakeSession &&
    tier === "standard" &&
    format === "one_on_one" &&
    purchaseType === "single"
  ) {
    return INTAKE_PRICE_CENTS;
  }

  let price = PRICES[tier][format][purchaseType];

  // 10% lidkorting op strip-cards (niet op single sessions).
  if (purchaseType !== "single" && memberHasActiveSub) {
    price = Math.round(price * 0.9);
  }

  return price;
}

/**
 * Is this member eligible for the intake discount at the given trainer?
 * Set `has_used_pt_intake_discount=true` op de profile zodra een paid
 * booking met intake-korting is gedaan.
 */
export function qualifiesForIntakeDiscount(params: {
  hasUsedIntakeDiscount: boolean;
  trainerTier: PtTier;
  format: PtFormat;
  purchaseType: PtPurchaseType;
}): boolean {
  return (
    !params.hasUsedIntakeDiscount &&
    params.trainerTier === "standard" &&
    params.format === "one_on_one" &&
    params.purchaseType === "single"
  );
}

export function formatPriceEuro(cents: number): string {
  return `€${(cents / 100).toFixed(0)}`;
}
