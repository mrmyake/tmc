import { unstable_cache } from "next/cache";
import { getPublicClient } from "@/lib/supabase";

export interface CatalogueRow {
  slug: string;
  kind: "plan" | "addon" | "product" | "fee";
  family: string | null;
  display_name: string;
  price_cents: number;
  billing_cycle_weeks: number | null;
  frequency_cap: number | null;
  commit_months: number | null;
  commit_24m_discount_factor: number | null;
  price_cents_24m_computed: number | null;
  extended_access_mode: "included" | "addon" | "na" | null;
  credits: number | null;
  validity_months: number | null;
  purchasable: boolean;
  early_member_eligible: boolean;
  early_member_price_cents: number | null;
  early_member_commit_months: number | null;
  early_member_price_lock: boolean;
  age_category: string;
}

const CATALOGUE_COLUMNS =
  "slug,kind,family,display_name,price_cents,billing_cycle_weeks,frequency_cap,commit_months,commit_24m_discount_factor,price_cents_24m_computed,extended_access_mode,credits,validity_months,purchasable,early_member_eligible,early_member_price_cents,early_member_commit_months,early_member_price_lock,age_category";

async function fetchCatalogueRows(): Promise<CatalogueRow[]> {
  const supabase = getPublicClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("catalogue")
    .select(CATALOGUE_COLUMNS)
    .eq("is_active", true);

  if (error) {
    console.error("[catalogue] fetch failed:", error);
    return [];
  }

  return (data ?? []) as CatalogueRow[];
}

// unstable_cache round-trips its return value through JSON, so it must
// cache a plain array, not a Map (a Map serializes to "{}" and loses
// .get()). The Map is rebuilt fresh on every call from the cached array,
// which is cheap for ~30 rows.
const getCachedCatalogueRows = unstable_cache(fetchCatalogueRows, ["catalogue-active"], {
  revalidate: 3600,
  tags: ["catalogue"],
});

/**
 * Every active tmc.catalogue row, keyed by slug. This is the single price
 * source for /prijzen, /app/pt, and /12-weken-programma: display and charge
 * both read this table, so the shown price and the eventual Order pipeline
 * charge cannot drift.
 *
 * Tagged + generously cached (price changes normally arrive by migration,
 * i.e. a deploy, which busts this automatically): the tag exists so a rare
 * non-deploy price edit can be revalidated on demand once a trigger for it
 * is built (mirrors the still-open "campaign" tag from
 * ws1-catalogue-design.md §5, not yet wired to a route either).
 */
export async function getCatalogue(): Promise<Map<string, CatalogueRow>> {
  const rows = await getCachedCatalogueRows();
  return new Map(rows.map((row) => [row.slug, row]));
}

/** 8 for a 0.920 discount factor. Null when the row offers no 24m option. */
export function commit24mDiscountPercent(row: CatalogueRow | undefined): number | null {
  if (!row?.commit_24m_discount_factor) return null;
  return Math.round((1 - row.commit_24m_discount_factor) * 100);
}
