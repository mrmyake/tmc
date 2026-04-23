import dynamic from "next/dynamic";
import ReactDOM from "react-dom";
import { Hero, buildHeroImageSources } from "@/components/blocks/Hero";
import { PhilosophyGrid } from "@/components/blocks/PhilosophyGrid";
import { ScheduleTeaser } from "@/components/blocks/ScheduleTeaser";
import { StudioSection } from "@/components/blocks/StudioSection";
import { TrainerSpotlight } from "@/components/blocks/TrainerSpotlight";
import { OfferingCards } from "@/components/blocks/OfferingCards";
import { PricingTable } from "@/components/blocks/PricingTable";
import { ContactSection } from "@/components/blocks/ContactSection";
import {
  getSiteSettings,
  getTrainers,
  getOfferings,
  getPricing,
  getOpeningHours,
  getSiteImages,
} from "../../sanity/lib/fetch";

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
      <PricingTable tiers={pricing} />
      <TestimonialCarousel />
      <ContactSection settings={settings} hours={hours} />
    </>
  );
}
