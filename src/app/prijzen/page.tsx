import type { Metadata } from "next";
import { getPublicClient } from "@/lib/supabase";
import { getPricingItems } from "@/lib/pricing-items";
import { PrijzenContent, type PrijzenPricing } from "./PrijzenContent";

export const metadata: Metadata = {
  title: "Prijzen | The Movement Club Loosdrecht",
  description:
    "Alle tarieven op een rij: lidmaatschappen, personal training, programma's en losse bezoeken.",
  alternates: { canonical: "/prijzen" },
  openGraph: {
    title: "Prijzen | The Movement Club Loosdrecht",
    description:
      "Alle tarieven op een rij: lidmaatschappen, personal training, programma's en losse bezoeken.",
  },
};

// Geen eigen `revalidate` nodig: de root layout zet al `revalidate = 60`
// site-breed, en Next.js gebruikt het strengste interval binnen een route
// (layout + page), dus deze pagina revalidatet sowieso elke minuut.

// Noodgreep, alleen gebruikt als de Supabase-fetch faalt (geen env vars,
// netwerkfout, etc). Moet gelijk blijven aan de huidige live catalogus-
// waarden, maar is bewust NIET de bron van waarheid: bij een prijswijziging
// in de catalogus hoeft dit blok niet aangepast te worden, de live fetch
// wint altijd als die slaagt.
const FALLBACK_PRICING: PrijzenPricing = {
  groepslessen: { twoX: 7900, threeX: 9900, unl: 11900 },
  allAccess: { twoX: 10900, threeX: 12900, unl: 14900 },
  vrijTrainen: { twoX: 4900, threeX: 5900, unl: 6900 },
  dropInCents: 1700,
  tenRideCardCents: 15000,
  ptSingleCents: 9500,
  ptTwelveCents: 90000,
  duoSingleCents: 12000,
  duoTwelveCents: 110000,
  programStudioCents: 240000,
  programOnlineCents: 125000,
};

interface CatalogueRow {
  plan_variant: string;
  price_per_cycle_cents: number;
}

const PRICING_ITEM_SLUGS = [
  "pt_one_on_one_single",
  "pt_one_on_one_12",
  "duo_single",
  "duo_12",
  "program_studio_12w",
  "program_online_12w",
];

async function getPricing(): Promise<PrijzenPricing> {
  const supabase = getPublicClient();
  if (!supabase) return FALLBACK_PRICING;

  const [
    { data: plans, error: plansError },
    { data: settings, error: settingsError },
    pricingItems,
  ] = await Promise.all([
    supabase
      .from("membership_plan_catalogue")
      .select("plan_variant,price_per_cycle_cents")
      .eq("is_active", true)
      .in("plan_type", ["groepslessen", "all_inclusive", "vrij_trainen"]),
    supabase
      .from("booking_settings")
      .select("drop_in_yoga_cents,drop_in_kettlebell_cents,ten_ride_card_cents")
      .eq("id", "singleton")
      .maybeSingle(),
    getPricingItems(PRICING_ITEM_SLUGS),
  ]);

  if (plansError) console.error("[prijzen] catalogue fetch failed:", plansError);
  if (settingsError) console.error("[prijzen] booking_settings fetch failed:", settingsError);

  const byVariant = new Map<string, number>(
    ((plans ?? []) as CatalogueRow[]).map((p) => [p.plan_variant, p.price_per_cycle_cents])
  );

  // drop_in_yoga_cents en drop_in_kettlebell_cents zijn vandaag gelijk; de
  // pagina toont één "losse les"-tarief voor yoga/mobility/kettlebell samen.
  // Als ze ooit uiteenlopen moet deze pagina expliciet per activiteit gaan
  // splitsen, log daarom een waarschuwing zodat dat niet stilzwijgend gemist
  // wordt.
  if (
    settings &&
    settings.drop_in_yoga_cents !== settings.drop_in_kettlebell_cents
  ) {
    console.warn(
      "[prijzen] drop_in_yoga_cents en drop_in_kettlebell_cents wijken af, pagina toont nu alleen het yoga-tarief"
    );
  }

  return {
    groepslessen: {
      twoX: byVariant.get("groepslessen_2x") ?? FALLBACK_PRICING.groepslessen.twoX,
      threeX: byVariant.get("groepslessen_3x") ?? FALLBACK_PRICING.groepslessen.threeX,
      unl: byVariant.get("groepslessen_unl") ?? FALLBACK_PRICING.groepslessen.unl,
    },
    allAccess: {
      twoX: byVariant.get("all_inclusive_2x") ?? FALLBACK_PRICING.allAccess.twoX,
      threeX: byVariant.get("all_inclusive_3x") ?? FALLBACK_PRICING.allAccess.threeX,
      unl: byVariant.get("all_inclusive_unl") ?? FALLBACK_PRICING.allAccess.unl,
    },
    vrijTrainen: {
      twoX: byVariant.get("vrij_trainen_2x") ?? FALLBACK_PRICING.vrijTrainen.twoX,
      threeX: byVariant.get("vrij_trainen_3x") ?? FALLBACK_PRICING.vrijTrainen.threeX,
      unl: byVariant.get("vrij_trainen_unl") ?? FALLBACK_PRICING.vrijTrainen.unl,
    },
    dropInCents: settings?.drop_in_yoga_cents ?? FALLBACK_PRICING.dropInCents,
    tenRideCardCents: settings?.ten_ride_card_cents ?? FALLBACK_PRICING.tenRideCardCents,
    ptSingleCents:
      pricingItems.get("pt_one_on_one_single")?.price_cents ??
      FALLBACK_PRICING.ptSingleCents,
    ptTwelveCents:
      pricingItems.get("pt_one_on_one_12")?.price_cents ??
      FALLBACK_PRICING.ptTwelveCents,
    duoSingleCents:
      pricingItems.get("duo_single")?.price_cents ??
      FALLBACK_PRICING.duoSingleCents,
    duoTwelveCents:
      pricingItems.get("duo_12")?.price_cents ?? FALLBACK_PRICING.duoTwelveCents,
    programStudioCents:
      pricingItems.get("program_studio_12w")?.price_cents ??
      FALLBACK_PRICING.programStudioCents,
    programOnlineCents:
      pricingItems.get("program_online_12w")?.price_cents ??
      FALLBACK_PRICING.programOnlineCents,
  };
}

export default async function PrijzenPage() {
  const pricing = await getPricing();
  return <PrijzenContent pricing={pricing} />;
}
