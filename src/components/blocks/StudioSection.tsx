"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";

export function StudioSection() {
  return (
    <Section bg="elevated">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Image placeholder */}
          <ScrollReveal>
            <div className="aspect-[4/3] bg-bg-subtle flex items-center justify-center">
              {/* {FOTO: Studio interieur - premium apparatuur, moody sfeer, warm licht} */}
              <span className="text-text-muted text-sm uppercase tracking-widest">
                Studio foto
              </span>
            </div>
          </ScrollReveal>

          {/* Text */}
          <ScrollReveal delay={0.15}>
            <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
              De studio
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6">
              160m² puur voor jouw training
            </h2>
            <div className="space-y-4 text-text-muted leading-relaxed">
              <p>
                Geen drukte, geen wachtrijen, geen anonimiteit. The Movement
                Club is bewust kleinschalig — zodat elke training voelt alsof de
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
