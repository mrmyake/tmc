import { getPublicClient } from "@/lib/supabase";

export interface PricingItemRow {
  slug: string;
  price_cents: number;
  early_member_price_cents: number | null;
}

/**
 * Fetches the requested pricing_items rows (tmc.pricing_items), keyed by
 * slug. Callers supply their own fallback per slug since this returns an
 * empty map on any fetch failure rather than throwing.
 */
export async function getPricingItems(
  slugs: string[],
): Promise<Map<string, PricingItemRow>> {
  const map = new Map<string, PricingItemRow>();
  const supabase = getPublicClient();
  if (!supabase) return map;

  const { data, error } = await supabase
    .from("pricing_items")
    .select("slug,price_cents,early_member_price_cents")
    .eq("is_active", true)
    .in("slug", slugs);

  if (error) {
    console.error("[pricing-items] fetch failed:", error);
    return map;
  }

  for (const row of (data ?? []) as PricingItemRow[]) {
    map.set(row.slug, row);
  }
  return map;
}
