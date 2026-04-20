"use client";

import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const FEATURABLE_WIDGET_ID = "ef34740b-2ef8-467f-abbf-e58e3d348bdf";

export function TestimonialCarousel() {
  return (
    <Section bg="elevated">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Google Reviews"
            heading="Wat onze klanten zeggen"
            subtext="Beoordeeld met ★★★★★ op Google, voorheen PT Loosdrecht."
          />
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
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
        </ScrollReveal>

        <ScrollReveal delay={0.3}>
          <div className="text-center mt-10">
            <a
              href="https://www.google.com/maps/place/PT+Loosdrecht/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:text-accent-hover transition-colors underline underline-offset-4"
            >
              Bekijk alle reviews op Google →
            </a>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
