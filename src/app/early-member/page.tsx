import type { Metadata } from "next";
import { getPublicClient } from "@/lib/supabase";
import { STUDIO_OPENING_DATE } from "@/lib/constants";
import { EarlyMemberContent, type EarlyMemberPricing } from "./EarlyMemberContent";

// ISR: prijzen en de countdown-deadline mogen maximaal een minuut achterlopen.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Early Member | The Movement Club Loosdrecht",
  description:
    "Medio augustus opent The Movement Club in Loosdrecht. Word Early Member en train zonder inschrijfkosten, zonder jaarcontract en met een All Access-tarief dat daarna verdwijnt.",
  alternates: { canonical: "/early-member" },
  openGraph: {
    title: "Early Member | The Movement Club Loosdrecht",
    description:
      "Medio augustus opent The Movement Club in Loosdrecht. Word Early Member en train zonder inschrijfkosten, zonder jaarcontract en met een All Access-tarief dat daarna verdwijnt.",
  },
};

// Noodgreep, alleen gebruikt als de Supabase-fetch faalt. Bewust niet de
// bron van waarheid, zie tmc.membership_plan_catalogue.
const FALLBACK_PRICING: EarlyMemberPricing = {
  groepslessen: { twoX: 7900, threeX: 9900, unl: 11900 },
  allAccessTwoXCents: 10900,
  allAccessThreeXCents: 12900,
  allAccessUnlCents: 14900,
  vrijTrainenTwoXCents: 4900,
};

// Noodgreep voor de countdown-deadline, alleen gebruikt als de
// get_early_member_availability()-fetch faalt. Moet gelijk blijven aan de
// live closes_at op tmc.early_member_pools (identiek voor beide pools op
// moment van schrijven), maar is bewust niet de bron van waarheid.
const FALLBACK_DEADLINE = "2026-09-30T22:00:00+00:00";

interface CatalogueRow {
  plan_variant: string;
  price_per_cycle_cents: number;
}

interface AvailabilityRow {
  pool: string;
  closes_at: string;
}

async function getDeadline(
  supabase: ReturnType<typeof getPublicClient>
): Promise<string> {
  if (!supabase) return FALLBACK_DEADLINE;
  const { data, error } = await supabase.rpc("get_early_member_availability");
  if (error || !data || !Array.isArray(data) || data.length === 0) {
    if (error) console.error("[early-member] availability fetch failed:", error);
    return FALLBACK_DEADLINE;
  }
  // Beide pools delen dezelfde closes_at (zie tmc.early_member_pools), dus
  // de eerste rij volstaat als bron voor de pagina-brede countdown.
  return (data as AvailabilityRow[])[0]?.closes_at ?? FALLBACK_DEADLINE;
}

async function getPricing(
  supabase: ReturnType<typeof getPublicClient>
): Promise<EarlyMemberPricing> {
  if (!supabase) return FALLBACK_PRICING;

  const { data: plans, error } = await supabase
    .from("membership_plan_catalogue")
    .select("plan_variant,price_per_cycle_cents")
    .eq("is_active", true)
    .in("plan_type", ["groepslessen", "all_inclusive", "vrij_trainen"]);

  if (error) console.error("[early-member] catalogue fetch failed:", error);

  const byVariant = new Map<string, number>(
    ((plans ?? []) as CatalogueRow[]).map((p) => [p.plan_variant, p.price_per_cycle_cents])
  );

  return {
    groepslessen: {
      twoX: byVariant.get("groepslessen_2x") ?? FALLBACK_PRICING.groepslessen.twoX,
      threeX: byVariant.get("groepslessen_3x") ?? FALLBACK_PRICING.groepslessen.threeX,
      unl: byVariant.get("groepslessen_unl") ?? FALLBACK_PRICING.groepslessen.unl,
    },
    allAccessTwoXCents:
      byVariant.get("all_inclusive_2x") ?? FALLBACK_PRICING.allAccessTwoXCents,
    allAccessThreeXCents:
      byVariant.get("all_inclusive_3x") ?? FALLBACK_PRICING.allAccessThreeXCents,
    allAccessUnlCents:
      byVariant.get("all_inclusive_unl") ?? FALLBACK_PRICING.allAccessUnlCents,
    vrijTrainenTwoXCents:
      byVariant.get("vrij_trainen_2x") ?? FALLBACK_PRICING.vrijTrainenTwoXCents,
  };
}

export default async function EarlyMemberPage() {
  const supabase = getPublicClient();
  const [deadline, pricing] = await Promise.all([
    getDeadline(supabase),
    getPricing(supabase),
  ]);
  // Server-side fasebepaling: vóór/na de (placeholder) openingsdatum. Bepaalt
  // alleen de framing in de hero-copy, niet of de pagina/CTA's werken.
  const hasOpened = new Date() >= STUDIO_OPENING_DATE;

  return (
    <EarlyMemberContent deadline={deadline} pricing={pricing} hasOpened={hasOpened} />
  );
}
