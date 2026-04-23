import dynamic from "next/dynamic";
import { Hero } from "@/components/blocks/Hero";
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

// Intentionally no ReactDOM.preload for the hero image. On 4G the
// fetchPriority=high preload inserted by ReactDOM.preload lands above
// the 105 KiB CSS stylesheet in the <head> and starves the CSS
// download, pushing FCP by ~1.5s (Lighthouse measured 2.6s vs. 1.1s
// baseline). The <img fetchpriority="high"> attribute on the Hero tag
// itself already signals importance to the browser without competing
// with the render-blocking CSS.

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
