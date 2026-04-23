"use client";

import { useEffect, useRef } from "react";
import { ReactGoogleReviews } from "react-google-reviews";
import "react-google-reviews/dist/index.css";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";

const FEATURABLE_WIDGET_ID = "ef34740b-2ef8-467f-abbf-e58e3d348bdf";

export function TestimonialCarousel() {
  const ref = useRef<HTMLDivElement | null>(null);

  // The react-google-reviews library renders its own Previous/Next
  // buttons and avatar <img>s without labels/alt text. We can't pass
  // props to fix that, so we patch the DOM after mount — cheap, runs
  // once per paint, and a MutationObserver re-applies when the
  // carousel re-renders on slide-change.
  useEffect(() => {
    if (!ref.current) return;
    const root = ref.current;

    function apply() {
      root
        .querySelectorAll<HTMLButtonElement>("button")
        .forEach((btn) => {
          if (btn.getAttribute("aria-label")) return;
          const classes = btn.className.toLowerCase();
          if (classes.includes("next") || classes.includes("right")) {
            btn.setAttribute("aria-label", "Volgende review");
          } else if (classes.includes("prev") || classes.includes("left")) {
            btn.setAttribute("aria-label", "Vorige review");
          } else {
            btn.setAttribute("aria-label", "Carousel navigatie");
          }
        });
      root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
        if (!img.hasAttribute("alt")) img.setAttribute("alt", "");
      });
    }

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
          <section
            aria-label="Google reviews van onze leden"
            ref={ref}
            className="bg-bg border-y border-bg-subtle py-12 px-4 md:px-6 -mx-6 lg:mx-0"
          >
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
          </section>
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
