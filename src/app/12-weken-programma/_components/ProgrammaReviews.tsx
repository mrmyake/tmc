"use client";

import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";
import { ProgrammaEyebrow } from "./ProgrammaEyebrow";

// Zelfde Featurable-widget als de homepage (TestimonialCarousel) en /proefles.
const FEATURABLE_WIDGET_ID = "ef34740b-2ef8-467f-abbf-e58e3d348bdf";
const GOOGLE_REVIEWS_URL =
  "https://search.google.com/local/reviews?placeid=ChIJk23aIbVtxkcRIXOl7QEbH9U";

/**
 * Reviewsectie direct na de Marlon-sectie. Toont de live Google-reviews via
 * de bestaande widget; bewust geen aantal in de tekst, want dat blijft niet
 * vanzelf kloppen.
 */
export function ProgrammaReviews() {
  return (
    <Section>
      <Container>
        <ScrollReveal>
          <div className="max-w-[640px] mb-10 md:mb-12">
            {/* COPY: confirm met Marlon */}
            <ProgrammaEyebrow>Reviews</ProgrammaEyebrow>
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-text text-4xl md:text-5xl mt-5 tracking-[-0.01em]">
              Alleen 5-sterrenreviews
            </h2>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted mt-5">
              Alle reviews op Google zijn 5 sterren.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <section
            aria-label="Google reviews van onze leden"
            className="min-h-[280px]"
          >
            <ReactGoogleReviews
              layout="carousel"
              featurableId={FEATURABLE_WIDGET_ID}
              theme="dark"
              carouselAutoplay={true}
              carouselSpeed={5000}
              maxCharacters={200}
            />
          </section>
        </ScrollReveal>
        <ScrollReveal delay={0.2}>
          <div className="mt-10">
            {/* COPY: confirm met Marlon */}
            <QuietLink href={GOOGLE_REVIEWS_URL} external>
              Bekijk alle reviews op Google
            </QuietLink>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
