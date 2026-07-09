import type { Metadata } from "next";
import { getPublicClient } from "@/lib/supabase";
import { getPricingItems } from "@/lib/pricing-items";
import { OPENING_DATE, EARLY_MEMBER_DEADLINE } from "@/lib/campaign";
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
  allAccessUnlEarlyMemberCents: 13900,
  vrijTrainenTwoXCents: 4900,
  signupFeeCents: 3900,
  programStudioCents: 240000,
  programOnlineCents: 125000,
};

interface CatalogueRow {
  plan_variant: string;
  price_per_cycle_cents: number;
  early_member_price_cents: number | null;
}

async function getPricing(
  supabase: ReturnType<typeof getPublicClient>
): Promise<EarlyMemberPricing> {
  if (!supabase) return FALLBACK_PRICING;

  const [{ data: plans, error }, pricingItems] = await Promise.all([
    supabase
      .from("membership_plan_catalogue")
      .select("plan_variant,price_per_cycle_cents,early_member_price_cents")
      .eq("is_active", true)
      .in("plan_type", ["groepslessen", "all_inclusive", "vrij_trainen"]),
    getPricingItems(["signup_fee", "program_studio_12w", "program_online_12w"]),
  ]);

  if (error) console.error("[early-member] catalogue fetch failed:", error);

  const byVariant = new Map<string, CatalogueRow>(
    ((plans ?? []) as CatalogueRow[]).map((p) => [p.plan_variant, p])
  );

  return {
    groepslessen: {
      twoX:
        byVariant.get("groepslessen_2x")?.price_per_cycle_cents ??
        FALLBACK_PRICING.groepslessen.twoX,
      threeX:
        byVariant.get("groepslessen_3x")?.price_per_cycle_cents ??
        FALLBACK_PRICING.groepslessen.threeX,
      unl:
        byVariant.get("groepslessen_unl")?.price_per_cycle_cents ??
        FALLBACK_PRICING.groepslessen.unl,
    },
    allAccessTwoXCents:
      byVariant.get("all_inclusive_2x")?.price_per_cycle_cents ??
      FALLBACK_PRICING.allAccessTwoXCents,
    allAccessThreeXCents:
      byVariant.get("all_inclusive_3x")?.price_per_cycle_cents ??
      FALLBACK_PRICING.allAccessThreeXCents,
    allAccessUnlCents:
      byVariant.get("all_inclusive_unl")?.price_per_cycle_cents ??
      FALLBACK_PRICING.allAccessUnlCents,
    allAccessUnlEarlyMemberCents:
      byVariant.get("all_inclusive_unl")?.early_member_price_cents ??
      FALLBACK_PRICING.allAccessUnlEarlyMemberCents,
    vrijTrainenTwoXCents:
      byVariant.get("vrij_trainen_2x")?.price_per_cycle_cents ??
      FALLBACK_PRICING.vrijTrainenTwoXCents,
    // Reguliere inschrijfkosten (het bedrag dat een Early Member juist NIET
    // betaalt) — niet de early_member_price_cents-kolom, die is hier 0.
    signupFeeCents:
      pricingItems.get("signup_fee")?.price_cents ??
      FALLBACK_PRICING.signupFeeCents,
    programStudioCents:
      pricingItems.get("program_studio_12w")?.price_cents ??
      FALLBACK_PRICING.programStudioCents,
    programOnlineCents:
      pricingItems.get("program_online_12w")?.price_cents ??
      FALLBACK_PRICING.programOnlineCents,
  };
}

export default async function EarlyMemberPage() {
  const supabase = getPublicClient();
  const pricing = await getPricing(supabase);
  // Server-side fasebepaling: vóór/na de (placeholder) openingsdatum. Bepaalt
  // alleen de framing in de hero-copy, niet of de pagina/CTA's werken. Zelfde
  // OPENING_DATE als de teaser-bar en het Early Member-menuslot (campaign.ts).
  const hasOpened = new Date() >= OPENING_DATE;

  return (
    <EarlyMemberContent
      deadline={EARLY_MEMBER_DEADLINE.toISOString()}
      pricing={pricing}
      hasOpened={hasOpened}
    />
  );
}
