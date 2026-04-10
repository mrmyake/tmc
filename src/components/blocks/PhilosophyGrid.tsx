"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { PILLARS } from "@/lib/constants";
import { Activity, Minimize2, Dumbbell } from "lucide-react";

const icons = [Activity, Minimize2, Dumbbell];

export function PhilosophyGrid() {
  return (
    <Section>
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Onze filosofie"
            heading="Drie pijlers. Eén visie."
            subtext="Elke training bij The Movement Club is gebouwd op deze drie fundamenten."
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PILLARS.map((pillar, i) => {
            const Icon = icons[i];
            return (
              <ScrollReveal key={pillar.title} delay={i * 0.15}>
                <div className="text-center p-8">
                  <div className="inline-flex items-center justify-center w-14 h-14 mb-6 border border-accent/30 text-accent">
                    <Icon size={24} />
                  </div>
                  <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-3">
                    {pillar.title}
                  </h3>
                  <p className="text-text-muted leading-relaxed">
                    {pillar.description}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
