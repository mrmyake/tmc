import type { Metadata } from "next";
import { getCatalogue, commit24mDiscountPercent } from "@/lib/catalogue";
import { getCampaignWindow, getCampaignPhase } from "@/lib/campaign";
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
//
// Geen FALLBACK_PRICING meer: tmc.catalogue is de enige prijsbron. Faalt de
// fetch volledig (catalogue.size === 0), dan gooien we in plaats van een
// verzonnen prijzenblok terug te geven -- Next.js' ISR houdt bij een
// gefaalde revalidate dan gewoon de laatst goede statische versie aan,
// precies het "last-good"-gedrag dat we willen in plaats van een tweede,
// drift-gevoelige prijsbron. Mist er individueel een verwachte rij (de
// fetch als geheel lukt wel), dan wordt dat veld null en toont
// PrijzenContent een neutrale lege staat voor precies dat item, nooit een
// verzonnen bedrag.

async function getPricing(): Promise<PrijzenPricing> {
  const [catalogue, campaignWindow] = await Promise.all([
    getCatalogue(),
    getCampaignWindow(),
  ]);

  if (catalogue.size === 0) {
    throw new Error("[prijzen] catalogue fetch returned no rows");
  }

  const phase = getCampaignPhase(campaignWindow);
  const emActive = phase === "open-em";

  const price = (slug: string): number | null => catalogue.get(slug)?.price_cents ?? null;

  const allAccessUnl = catalogue.get("all_inclusive_unl");
  const signupFee = catalogue.get("signup_fee");
  const ptCard = catalogue.get("pt_10");
  const duoCard = catalogue.get("duo_10");

  return {
    groepslessen: {
      twoX: price("groepslessen_2x"),
      threeX: price("groepslessen_3x"),
      unl: price("groepslessen_unl"),
    },
    allAccess: {
      twoX: price("all_inclusive_2x"),
      threeX: price("all_inclusive_3x"),
      unl: price("all_inclusive_unl"),
    },
    vrijTrainen: {
      twoX: price("vrij_trainen_2x"),
      threeX: price("vrij_trainen_3x"),
      unl: price("vrij_trainen_unl"),
    },
    extendedAccessCents: price("extended_access"),
    signupFeeCents: price("signup_fee"),
    commit24mDiscountPercent: commit24mDiscountPercent(catalogue.get("groepslessen_2x")),
    dropInCents: price("drop_in"),
    tenRideCardCents: price("ten_ride_card"),
    ptSingleCents: price("pt_single"),
    ptCardCents: ptCard?.price_cents ?? null,
    ptCardCredits: ptCard?.credits ?? null,
    duoSingleCents: price("duo_single"),
    duoCardCents: duoCard?.price_cents ?? null,
    duoCardCredits: duoCard?.credits ?? null,
    // Lead items (purchasable=false): a missing row renders "op aanvraag"
    // rather than a stale fallback price, since these are display-and-lead
    // only, never a charge source.
    programStudioCents: price("program_studio_12w"),
    programOnlineCents: price("program_online_12w"),
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
