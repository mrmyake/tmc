import type { Metadata } from "next";
import { resolveAttribution } from "@/lib/attribution/params";
import { getCatalogue } from "@/lib/catalogue";
import { dropInSlugForPillar } from "@/lib/trial-pricing";
import { formatEuro, formatEuroCents } from "@/lib/format";
import { getTrainers } from "../../../sanity/lib/fetch";
import { urlFor } from "../../../sanity/lib/client";
import { ProeflesChoice } from "./ProeflesChoice";

// COPY: confirm met Marlon
// Title zonder merknaam: de layout-template (%s | The Movement Club) voegt die toe.
export const metadata: Metadata = {
  title: "Boek een Proefles",
  description:
    "Maak kennis met The Movement Club in Loosdrecht. Boek je proefles: yoga, mobility, kettlebell of vrij trainen, in kleine groepen.",
  alternates: { canonical: "/proefles" },
  openGraph: {
    title: "Boek een Proefles | The Movement Club",
    description:
      "Maak kennis met The Movement Club in Loosdrecht. Boek je proefles: yoga, mobility, kettlebell of vrij trainen, in kleine groepen.",
  },
};

// Dynamisch vanwege de campagneparameters in searchParams. De gratis
// openingsperiode speelt hier geen rol: die loopt alleen via /proefles/gratis
// (spec-community-growth.md par. 1 "Gratis openingsperiode").
export const dynamic = "force-dynamic";

/**
 * De prijs op de kaart: dezelfde catalogusrij als het betaalpad
 * (startTrialBooking gebruikt dropInSlugForPillar voor het Mollie-bedrag), dus
 * wat hier staat is wat er wordt afgerekend. Yoga & mobility en kettlebell
 * delen de rij 'drop_in'. Geen rij of geen database: geen prijs tonen, nooit
 * een bedrag uit de code.
 */
async function trialPriceLabel(): Promise<string | null> {
  const slug = dropInSlugForPillar("yoga_mobility");
  if (!slug) return null;
  const cents = (await getCatalogue()).get(slug)?.price_cents;
  if (typeof cents !== "number") return null;
  return cents % 100 === 0 ? formatEuro(cents / 100) : formatEuroCents(cents);
}

export default async function ProeflesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  // Advertentie- en campagneparameters uit de URL (spec-marketing-attribution.md):
  // alleen gelezen en als props doorgegeven; de knop en de codestap dragen ze
  // mee in hun links. Zonder parameters een leeg object en schone links.
  const attribution = resolveAttribution(sp, "/proefles");
  const [priceLabel, trainers] = await Promise.all([trialPriceLabel(), getTrainers()]);
  // Portret van Marlon (trainer.photo, hoofdtrainer eerst). Alleen op desktop
  // zichtbaar; de uitsnede (300 px hoog) doet CSS met object-position.
  const photo = trainers[0]?.photo;
  const portraitUrl = photo ? urlFor(photo).width(1040).url() : null;
  // ?kaart=bellen opent direct het terugbelformulier (doorlink van de
  // yoga-quiz).
  const kaart = Array.isArray(sp.kaart) ? sp.kaart[0] : sp.kaart;
  return (
    <ProeflesChoice
      attribution={attribution}
      priceLabel={priceLabel}
      portraitUrl={portraitUrl}
      initialChoice={kaart === "bellen" ? "call" : "none"}
    />
  );
}
