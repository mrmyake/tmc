"use client";

import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

// TODO: Vervang met je eigen Featurable widget ID
// 1. Ga naar https://featurable.com en maak een gratis account
// 2. Maak een nieuwe widget aan en koppel het Google Business Profile van PT Loosdrecht
// 3. Kopieer de widget ID en plak die hieronder
const FEATURABLE_WIDGET_ID = "JOUW_WIDGET_ID_HIER";

export function TestimonialCarousel() {
  const hasWidgetId = FEATURABLE_WIDGET_ID !== "JOUW_WIDGET_ID_HIER";

  return (
    <Section bg="elevated">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Google Reviews"
            heading="Wat onze klanten zeggen"
            subtext="Beoordeeld met ★★★★★ op Google — voorheen PT Loosdrecht."
          />
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          {hasWidgetId ? (
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
          ) : (
            <div className="text-center py-12 border border-dashed border-bg-subtle max-w-2xl mx-auto">
              <p className="text-text-muted text-sm">
                Google Reviews widget wordt hier geladen zodra de Featurable
                widget ID is ingesteld.
              </p>
              <p className="text-text-muted text-xs mt-2">
                Zie instructies in{" "}
                <code className="text-accent">
                  src/components/blocks/TestimonialCarousel.tsx
                </code>
              </p>
            </div>
          )}
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
