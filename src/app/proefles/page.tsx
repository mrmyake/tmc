import type { Metadata } from "next";
import { getOpeningTrialPeriod } from "@/lib/opening-trial/period";
import { isOpeningPeriodActive } from "@/lib/opening-trial/rules";
import { resolveAttribution } from "@/lib/attribution/params";
import { ProeflesChoice } from "./ProeflesChoice";

export const metadata: Metadata = {
  title: "Boek een Proefles | Gratis & Vrijblijvend",
  description:
    "Boek een gratis proefles bij The Movement Club in Loosdrecht. Ervaar onze boutique studio en persoonlijke aanpak. Vrijblijvend en zonder verplichtingen.",
  alternates: { canonical: "/proefles" },
  openGraph: {
    title: "Boek een Proefles | Gratis & Vrijblijvend | The Movement Club",
    description:
      "Boek een gratis proefles bij The Movement Club in Loosdrecht. Ervaar onze boutique studio en persoonlijke aanpak.",
  },
};

// Datumgestuurd: de kaarten volgen de gratis openingsperiode uit
// tmc.booking_settings, dus geen statische render en geen deploy om te
// wisselen (spec-community-growth.md par. 1 "Gratis openingsperiode").
export const dynamic = "force-dynamic";

export default async function ProeflesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [period, sp] = await Promise.all([getOpeningTrialPeriod(), props.searchParams]);
  // Advertentie- en campagneparameters uit de URL (spec-marketing-attribution.md):
  // alleen gelezen en als props doorgegeven; de kaarten dragen ze mee in hun
  // links. Zonder parameters een leeg object en schone links.
  const attribution = resolveAttribution(sp, "/proefles");
  return (
    <ProeflesChoice
      freePeriodActive={isOpeningPeriodActive(period)}
      attribution={attribution}
    />
  );
}
