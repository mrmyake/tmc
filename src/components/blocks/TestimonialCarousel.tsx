"use client";

import { useEffect, useRef, useState } from "react";
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
  // Pas de widget (230 KiB avatars + 1500 DOM nodes) mounten zodra de
  // sectie in viewport komt. Dit houdt de widget-weight uit de
  // kritieke render-path op de homepage.
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // De react-google-reviews library rendert eigen Previous/Next-buttons
  // en avatar <img>s zonder labels/alt. We patchen de DOM na mount —
  // MutationObserver re-apply't bij slide-change.
  useEffect(() => {
    if (!shouldMount || !ref.current) return;
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
  }, [shouldMount]);

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
            className="bg-bg border-y border-bg-subtle py-12 px-4 md:px-6 -mx-6 lg:mx-0 min-h-[280px]"
          >
            <div className="max-w-5xl mx-auto">
              {shouldMount ? (
                <ReactGoogleReviews
                  layout="carousel"
                  featurableId={FEATURABLE_WIDGET_ID}
                  theme="dark"
                  carouselAutoplay={true}
                  carouselSpeed={5000}
                  maxCharacters={200}
                  structuredData={true}
                />
              ) : (
                <ReviewsSkeleton />
              )}
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

/**
 * Editorial skeleton die het review-blok reserveert vóór de Featurable
 * widget mount. Houdt de layout stabiel — geen CLS bij scroll-in.
 */
function ReviewsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-6 py-8">
      <div className="w-20 h-px bg-accent/30" />
      <div className="w-full max-w-xl h-3 bg-bg-elevated" />
      <div className="w-2/3 h-3 bg-bg-elevated" />
      <div className="w-1/2 h-3 bg-bg-elevated" />
    </div>
  );
}
