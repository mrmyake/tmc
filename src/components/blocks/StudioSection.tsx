"use client";

import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { urlFor } from "../../../sanity/lib/client";
import type { SanityImage } from "../../../sanity/lib/fetch";

interface StudioSectionProps {
  image?: SanityImage;
}

export function StudioSection({ image }: StudioSectionProps) {
  return (
    <Section bg="elevated">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <ScrollReveal>
            <div className="relative -mx-6 lg:mx-0 lg:ml-[-8vw]">
              {image?.asset ? (
                <div className="relative w-full aspect-[4/3]">
                  {/* Mobile renders at ~412px × DPR, so serving
                      anything past 800w is waste. Desktop tops out
                      at ~50vw on 1440px = ~720px × 2 DPR = 1440 is
                      enough. Bound the upstream URL at 960 and let
                      Next's optimizer serve the right srcset variant
                      from there. */}
                  <Image
                    src={urlFor(image).width(960).height(720).quality(75).format("webp").url()}
                    alt="The Movement Club studio interieur"
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] bg-bg-subtle flex items-center justify-center">
                  <span className="tmc-eyebrow text-text-muted">
                    Studio foto
                  </span>
                </div>
              )}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              01 · De studio
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6">
              160m² puur voor jouw training
            </h2>
            <div className="space-y-4 text-text-muted leading-relaxed">
              <p>
                Geen drukte, geen wachtrijen, geen anonimiteit. The Movement
                Club is bewust kleinschalig, zodat elke training voelt alsof de
                studio er alleen voor jou is.
              </p>
              <p>
                Met high-end apparatuur, doordachte verlichting en een sfeer die
                je nergens anders vindt, is onze studio ontworpen om het beste
                uit jezelf te halen. Elke vierkante meter is ingericht met oog
                voor functionaliteit én beleving.
              </p>
            </div>
            <div className="mt-8">
              <Button href="/over" variant="secondary">
                Meer over onze studio
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  );
}
