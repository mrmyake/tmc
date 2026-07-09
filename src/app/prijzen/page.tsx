import type { Metadata } from "next";
import { getCatalogue, commit24mDiscountPercent } from "@/lib/catalogue";
import { getCampaignDeadline, getCampaignPhase } from "@/lib/campaign";
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
// (layout + page), dus deze pagina revalidatet sowieso elke minuut. De
// catalogus-fetch zelf is los getagd + 1u gecached (zie lib/catalogue.ts).

// Noodgreep, alleen gebruikt als de Supabase-fetch faalt (geen env vars,
// netwerkfout, etc). Moet gelijk blijven aan de huidige live catalogus-
// waarden, maar is bewust NIET de bron van waarheid: bij een prijswijziging
// in de catalogus hoeft dit blok niet aangepast te worden, de live fetch
// wint altijd als die slaagt.
const FALLBACK_PRICING: PrijzenPricing = {
  groepslessen: { twoX: 7900, threeX: 9900, unl: 11900 },
  allAccess: { twoX: 10900, threeX: 12900, unl: 14900 },
  vrijTrainen: { twoX: 4900, threeX: 5900, unl: 6900 },
  extendedAccessCents: 1000,
  signupFeeCents: 3900,
  commit24mDiscountPercent: 8,
  dropInCents: 1700,
  tenRideCardCents: 15000,
  ptSingleCents: 9500,
  ptCardCents: 90000,
  ptCardCredits: 10,
  duoSingleCents: 12000,
  duoCardCents: 110000,
  duoCardCredits: 10,
  programStudioCents: 240000,
  programOnlineCents: 125000,
  earlyMember: {
    active: false,
    allAccessUnlCents: 13900,
    signupFeeWaived: true,
  },
};

async function getPricing(): Promise<PrijzenPricing> {
  const [catalogue, campaignDeadlineIso] = await Promise.all([
    getCatalogue(),
    getCampaignDeadline(),
  ]);

  if (catalogue.size === 0) return FALLBACK_PRICING;

  const phase = getCampaignPhase(new Date(campaignDeadlineIso));
  const emActive = phase === "open-em";

  const price = (slug: string, fallback: number) =>
    catalogue.get(slug)?.price_cents ?? fallback;
  const priceOrNull = (slug: string) => catalogue.get(slug)?.price_cents ?? null;

  const allAccessUnl = catalogue.get("all_inclusive_unl");
  const signupFee = catalogue.get("signup_fee");
  const ptCard = catalogue.get("pt_10");
  const duoCard = catalogue.get("duo_10");

  return {
    groepslessen: {
      twoX: price("groepslessen_2x", FALLBACK_PRICING.groepslessen.twoX),
      threeX: price("groepslessen_3x", FALLBACK_PRICING.groepslessen.threeX),
      unl: price("groepslessen_unl", FALLBACK_PRICING.groepslessen.unl),
    },
    allAccess: {
      twoX: price("all_inclusive_2x", FALLBACK_PRICING.allAccess.twoX),
      threeX: price("all_inclusive_3x", FALLBACK_PRICING.allAccess.threeX),
      unl: price("all_inclusive_unl", FALLBACK_PRICING.allAccess.unl),
    },
    vrijTrainen: {
      twoX: price("vrij_trainen_2x", FALLBACK_PRICING.vrijTrainen.twoX),
      threeX: price("vrij_trainen_3x", FALLBACK_PRICING.vrijTrainen.threeX),
      unl: price("vrij_trainen_unl", FALLBACK_PRICING.vrijTrainen.unl),
    },
    extendedAccessCents: price("extended_access", FALLBACK_PRICING.extendedAccessCents),
    signupFeeCents: price("signup_fee", FALLBACK_PRICING.signupFeeCents),
    commit24mDiscountPercent:
      commit24mDiscountPercent(catalogue.get("groepslessen_2x")) ??
      FALLBACK_PRICING.commit24mDiscountPercent,
    dropInCents: price("drop_in", FALLBACK_PRICING.dropInCents),
    tenRideCardCents: price("ten_ride_card", FALLBACK_PRICING.tenRideCardCents),
    ptSingleCents: price("pt_single", FALLBACK_PRICING.ptSingleCents),
    ptCardCents: ptCard?.price_cents ?? FALLBACK_PRICING.ptCardCents,
    ptCardCredits: ptCard?.credits ?? FALLBACK_PRICING.ptCardCredits,
    duoSingleCents: price("duo_single", FALLBACK_PRICING.duoSingleCents),
    duoCardCents: duoCard?.price_cents ?? FALLBACK_PRICING.duoCardCents,
    duoCardCredits: duoCard?.credits ?? FALLBACK_PRICING.duoCardCredits,
    // Lead items (purchasable=false): a missing row renders "op aanvraag"
    // rather than a stale fallback price, since these are display-and-lead
    // only, never a charge source.
    programStudioCents: priceOrNull("program_studio_12w"),
    programOnlineCents: priceOrNull("program_online_12w"),
    earlyMember: {
      active: emActive,
      allAccessUnlCents: emActive ? (allAccessUnl?.early_member_price_cents ?? null) : null,
      signupFeeWaived: emActive ? (signupFee?.early_member_price_cents ?? 0) === 0 : false,
    },
  };
}

export default async function PrijzenPage() {
  const pricing = await getPricing();
  return <PrijzenContent pricing={pricing} />;
}
