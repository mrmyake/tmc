import dynamic from "next/dynamic";
import ReactDOM from "react-dom";
import { Hero, buildHeroImageSources } from "@/components/blocks/Hero";
import { PhilosophyGrid } from "@/components/blocks/PhilosophyGrid";
import { ScheduleTeaser } from "@/components/blocks/ScheduleTeaser";
import { StudioSection } from "@/components/blocks/StudioSection";
import { TrainerSpotlight } from "@/components/blocks/TrainerSpotlight";
import { OfferingCards } from "@/components/blocks/OfferingCards";
import { YogaTeaser } from "@/components/blocks/YogaTeaser";
import { PricingTable, type HomePricingTier } from "@/components/blocks/PricingTable";
import { ContactSection } from "@/components/blocks/ContactSection";
import { getCatalogue } from "@/lib/catalogue";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import {
  getSiteSettings,
  getTrainers,
  getOfferings,
  getOpeningHours,
  getSiteImages,
} from "../../sanity/lib/fetch";

// Drie representatieve "Onbeperkt"-tiers. Prijs en naam komen live uit
// tmc.catalogue (de _id is de catalogus-slug); de features-bullets zijn
// lokale marketing-copy (voorheen membership_plan_catalogue.includes, die
// tabel is gedropt in Migratie B) en de prijs-strings hieronder zijn de
// noodgreep als de catalogus-fetch faalt, bewust niet de bron van waarheid.
// COPY: confirm met Marlon
const FALLBACK_TIERS: HomePricingTier[] = [
  {
    _id: "groepslessen_unl",
    name: "Groepslessen Onbeperkt",
    subtitle: "",
    price: "€119 / 4 weken",
    features: ["Onbeperkt groepslessen", "Yoga, mobility en kettlebell, mix zoals jij wilt"],
    ctaText: "Bekijk alle tarieven",
    ctaLink: "/prijzen",
    highlighted: false,
  },
  {
    _id: "vrij_trainen_unl",
    name: "Vrij Trainen Onbeperkt",
    subtitle: "",
    price: "€69 / 4 weken",
    features: ["Onbeperkt vrij trainen", "Toegang tot alle equipment"],
    ctaText: "Bekijk alle tarieven",
    ctaLink: "/prijzen",
    highlighted: false,
  },
  {
    _id: "all_inclusive_unl",
    name: "All Access Onbeperkt",
    subtitle: "",
    price: "€149 / 4 weken",
    features: ["Onbeperkt alle lessen", "Vrij trainen inbegrepen", "Yoga, mobility, kettlebell"],
    ctaText: "Bekijk alle tarieven",
    ctaLink: "/prijzen",
    highlighted: true,
  },
];

async function getPricing(): Promise<HomePricingTier[]> {
  const catalogue = await getCatalogue();
  if (catalogue.size === 0) return FALLBACK_TIERS;

  return FALLBACK_TIERS.map((tier) => {
    const row = catalogue.get(tier._id);
    if (!row) return tier;
    return {
      ...tier,
      name: row.display_name,
      price: `${formatPriceEuro(row.price_cents)} / 4 weken`,
    };
  });
}

// TestimonialCarousel pulls in react-google-reviews (third-party
// widget) and sits below the fold. Dynamic import keeps its bundle
// out of the critical JS; SSR stays on so the section still renders
// as HTML on the server.
const TestimonialCarousel = dynamic(() =>
  import("@/components/blocks/TestimonialCarousel").then(
    (m) => m.TestimonialCarousel,
  ),
);

export const revalidate = 60;

export default async function HomePage() {
  const [settings, trainers, offerings, pricing, hours, images] =
    await Promise.all([
      getSiteSettings(),
      getTrainers(),
      getOfferings(),
      getPricing(),
      getOpeningHours(),
      getSiteImages(),
    ]);

  const trainer = trainers[0];

  // LCP preload. We feed imageSrcSet/imageSizes so the browser picks
  // the viewport-appropriate variant — mobile phones preload the 640w
  // WebP (~40-60 KiB), not the 900 KiB desktop one. At that size it
  // no longer competes meaningfully with the CSS on 4G, and LCP flips
  // from the wordmark text back to the actual hero image.
  if (images.hero?.asset) {
    const sources = buildHeroImageSources(images.hero);
    ReactDOM.preload(sources.src, {
      as: "image",
      fetchPriority: "high",
      imageSrcSet: sources.srcSet,
      imageSizes: sources.sizes,
    });
  }

  return (
    <>
      <Hero settings={settings} heroImage={images.hero} />
      <PhilosophyGrid />
      <ScheduleTeaser />
      <StudioSection image={images.studio} />
      <TrainerSpotlight trainer={trainer} />
      <OfferingCards offerings={offerings} />
      <YogaTeaser />
      <PricingTable tiers={pricing} />
      <TestimonialCarousel />
      <ContactSection settings={settings} hours={hours} />
    </>
  );
}
