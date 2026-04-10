import { Hero } from "@/components/blocks/Hero";
import { PhilosophyGrid } from "@/components/blocks/PhilosophyGrid";
import { StudioSection } from "@/components/blocks/StudioSection";
import { TrainerSpotlight } from "@/components/blocks/TrainerSpotlight";
import { OfferingCards } from "@/components/blocks/OfferingCards";
import { PricingTable } from "@/components/blocks/PricingTable";
import { TestimonialCarousel } from "@/components/blocks/TestimonialCarousel";
import { ContactSection } from "@/components/blocks/ContactSection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <PhilosophyGrid />
      <StudioSection />
      <TrainerSpotlight />
      <OfferingCards />
      <PricingTable />
      <TestimonialCarousel />
      <ContactSection />
    </>
  );
}
