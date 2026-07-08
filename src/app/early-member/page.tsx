import type { Metadata } from "next";
import { getPublicClient } from "@/lib/supabase";
import {
  EarlyMemberContent,
  type EarlyMemberPricing,
  type PoolAvailability,
} from "./EarlyMemberContent";

// ISR: de "nog X van 40"-teller mag maximaal een minuut achterlopen.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Early Member | The Movement Club Loosdrecht",
  description:
    "De studio opent 1 augustus. De eerste 40 leden per membership starten als Early Member — met voorwaarden die daarna niet meer terugkomen.",
  alternates: { canonical: "/early-member" },
  openGraph: {
    title: "Early Member | The Movement Club Loosdrecht",
    description:
      "De studio opent 1 augustus. De eerste 40 leden per membership starten als Early Member — met voorwaarden die daarna niet meer terugkomen.",
  },
};

// Noodgreep, alleen gebruikt als de Supabase-fetch faalt. Bewust niet de
// bron van waarheid, zie tmc.membership_plan_catalogue.
const FALLBACK_PRICING: EarlyMemberPricing = {
  groepslessen: { twoX: 7900, threeX: 9900, unl: 11900 },
  allAccessUnlCents: 14900,
  vrijTrainenTwoXCents: 4900,
};

interface CatalogueRow {
  plan_variant: string;
  price_per_cycle_cents: number;
}

async function getAvailability(
  supabase: ReturnType<typeof getPublicClient>
): Promise<PoolAvailability[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_early_member_availability");
  if (error || !data) {
    if (error) console.error("[early-member] availability fetch failed:", error);
    return null;
  }
  return data as PoolAvailability[];
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
    allAccessUnlCents:
      byVariant.get("all_inclusive_unl") ?? FALLBACK_PRICING.allAccessUnlCents,
    vrijTrainenTwoXCents:
      byVariant.get("vrij_trainen_2x") ?? FALLBACK_PRICING.vrijTrainenTwoXCents,
  };
}

export default async function EarlyMemberPage() {
  const supabase = getPublicClient();
  const [availability, pricing] = await Promise.all([
    getAvailability(supabase),
    getPricing(supabase),
  ]);
  return <EarlyMemberContent availability={availability} pricing={pricing} />;
}
