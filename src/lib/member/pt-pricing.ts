/**
 * PT pricing formula from `docs/member-system/tmc-member-system.md §Pricing engine`.
 *
 * Marlon is de enige PT (besluit vastgelegd, zie CLAUDE.md), dus er is nog
 * maar één tarief. Er is daarom geen tier-concept meer in dit bestand: geen
 * `PtTier` type en geen `tier` parameter in `calculatePtPriceCents`, want de
 * prijs varieert niet meer per trainer.
 *
 * Scope in deze MVP: alleen 1-op-1 format en "single" aankoop (geen
 * strip-card purchase via /app/pt; strip-cards koop je via
 * /app/abonnement/nieuw als pt_package plan). Duo / small_group_4 staan
 * in de enum maar zijn nog niet UI-geactiveerd.
 */

export type PtFormat = "one_on_one" | "duo" | "small_group_4";
export type PtPurchaseType = "single" | "ten";

const PRICES: Record<PtFormat, Record<PtPurchaseType, number>> = {
  one_on_one: { single: 9500, ten: 90000 },
  duo: { single: 12000, ten: 110000 },
  small_group_4: { single: 14000, ten: 130000 },
};

interface CalculatePtPriceParams {
  format: PtFormat;
  purchaseType: PtPurchaseType;
}

export function calculatePtPriceCents(params: CalculatePtPriceParams): number {
  return PRICES[params.format][params.purchaseType];
}

export function formatPriceEuro(cents: number): string {
  return `€${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}
