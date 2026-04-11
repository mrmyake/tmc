import { Hero } from "@/components/blocks/Hero";
import { PhilosophyGrid } from "@/components/blocks/PhilosophyGrid";
import { StudioSection } from "@/components/blocks/StudioSection";
import { TrainerSpotlight } from "@/components/blocks/TrainerSpotlight";
import { OfferingCards } from "@/components/blocks/OfferingCards";
import { PricingTable } from "@/components/blocks/PricingTable";
import { TestimonialCarousel } from "@/components/blocks/TestimonialCarousel";
import { ContactSection } from "@/components/blocks/ContactSection";
import {
  getSiteSettings,
  getTrainers,
  getOfferings,
  getPricing,
  getOpeningHours,
} from "../../sanity/lib/fetch";

export const revalidate = 60; // Revalidate every 60 seconds

export default async function HomePage() {
  const [settings, trainers, offerings, pricing, hours] = await Promise.all([
    getSiteSettings(),
    getTrainers(),
    getOfferings(),
    getPricing(),
    getOpeningHours(),
  ]);

  const trainer = trainers[0];

  return (
    <>
      <Hero settings={settings} />
      <PhilosophyGrid />
      <StudioSection />
      <TrainerSpotlight trainer={trainer} />
      <OfferingCards offerings={offerings} />
      <PricingTable tiers={pricing} />
      <TestimonialCarousel />
      <ContactSection settings={settings} hours={hours} />
    </>
  );
}
