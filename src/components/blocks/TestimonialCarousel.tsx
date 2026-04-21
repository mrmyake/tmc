"use client";

import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";

const FEATURABLE_WIDGET_ID = "ef34740b-2ef8-467f-abbf-e58e3d348bdf";

export function TestimonialCarousel() {
  return (
    <Section bg="elevated">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Reviews"
            heading="Wat onze leden zeggen"
            subtext="Beoordeeld op Google, voorheen onder de naam PT Loosdrecht."
          />
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <div className="bg-bg border-y border-bg-subtle py-12 px-4 md:px-6 -mx-6 lg:mx-0">
            <div className="max-w-5xl mx-auto">
              <ReactGoogleReviews
                layout="carousel"
                featurableId={FEATURABLE_WIDGET_ID}
                theme="dark"
                carouselAutoplay={true}
                carouselSpeed={5000}
                maxCharacters={200}
                structuredData={true}
              />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <div className="text-center mt-10">
            <QuietLink
              href="https://www.google.com/maps/place/PT+Loosdrecht/"
              external
            >
              Bekijk alle reviews op Google
            </QuietLink>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
