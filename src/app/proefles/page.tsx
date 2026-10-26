import type { Metadata } from "next";
import { resolveAttribution } from "@/lib/attribution/params";
import { lookupPromotedTrialCode } from "@/lib/trial-codes/lookup";
import { ProeflesChoice } from "./ProeflesChoice";

// COPY: confirm met Marlon
// Title zonder merknaam: de layout-template (%s | The Movement Club) voegt die toe.
export const metadata: Metadata = {
  title: "Boek een Proefles",
  description:
    "Maak kennis met The Movement Club in Loosdrecht. Boek een proefles, gebruik je proefcode of laat je bellen door Marlon.",
  alternates: { canonical: "/proefles" },
  openGraph: {
    title: "Boek een Proefles | The Movement Club",
    description:
      "Maak kennis met The Movement Club in Loosdrecht. Boek een proefles, gebruik je proefcode of laat je bellen door Marlon.",
  },
};

// Dynamisch vanwege de campagneparameters in searchParams. De gratis
// openingsperiode speelt hier geen rol: die loopt alleen via /proefles/gratis
// (spec-community-growth.md par. 1 "Gratis openingsperiode").
export const dynamic = "force-dynamic";

export default async function ProeflesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  // Advertentie- en campagneparameters uit de URL (spec-marketing-attribution.md):
  // alleen gelezen en als props doorgegeven; de kaarten dragen ze mee in hun
  // links. Zonder parameters een leeg object en schone links.
  const attribution = resolveAttribution(sp, "/proefles");
  // De aangeprezen campagnecode (PROMOTED_TRIAL_CODE) uit de database: alleen
  // als hij nu bruikbaar is, met zijn einddatum. Null = de kaart "Ik heb een
  // code" toont de gewone tekst.
  const promotedCode = await lookupPromotedTrialCode();
  return <ProeflesChoice attribution={attribution} promotedCode={promotedCode} />;
}
