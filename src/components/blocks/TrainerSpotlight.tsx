"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SITE } from "@/lib/constants";

export function TrainerSpotlight() {
  return (
    <Section>
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text first on mobile, but visually second on desktop */}
          <ScrollReveal className="order-2 lg:order-1">
            <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
              {SITE.trainer.role}
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6">
              Maak kennis met {SITE.trainer.name}
            </h2>
            <div className="space-y-4 text-text-muted leading-relaxed">
              <p>
                Met jarenlange ervaring in personal training, functional
                movement en strength coaching begeleidt Marlon elke klant met
                dezelfde passie en precisie.
              </p>
              <p>
                Zijn aanpak is persoonlijk, wetenschappelijk onderbouwd en altijd
                gericht op duurzaam resultaat. Geen shortcuts, geen hypes —
                alleen wat werkt voor jouw lichaam.
              </p>
            </div>
            <blockquote className="mt-8 pl-6 border-l-2 border-accent">
              <p className="font-[family-name:var(--font-playfair)] text-lg text-text italic">
                &ldquo;Ik geloof dat iedereen een atleet is. Het gaat er niet om
                hoe zwaar je tilt, maar hoe goed je beweegt.&rdquo;
              </p>
              <cite className="block mt-3 text-sm text-text-muted not-italic">
                — {SITE.trainer.name}
              </cite>
            </blockquote>
          </ScrollReveal>

          {/* Portrait */}
          <ScrollReveal delay={0.15} className="order-1 lg:order-2">
            <div className="aspect-[3/4] bg-bg-elevated flex items-center justify-center">
              {/* {FOTO: Portret Marlon - professioneel, warm, zelfverzekerd} */}
              <span className="text-text-muted text-sm uppercase tracking-widest">
                Portret {SITE.trainer.name}
              </span>
            </div>
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  );
}
