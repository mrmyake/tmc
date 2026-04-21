"use client";

import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { ArrowUpRight } from "lucide-react";
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
            <a
              href="https://www.google.com/maps/place/PT+Loosdrecht/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text"
            >
              <span className="relative">
                Bekijk alle reviews op Google
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 right-0 -bottom-0.5 h-px origin-left scale-x-0 bg-accent transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:scale-x-100"
                />
              </span>
              <ArrowUpRight
                size={14}
                strokeWidth={1.5}
                className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </a>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
