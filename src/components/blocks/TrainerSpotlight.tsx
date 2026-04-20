"use client";

import { PortableText } from "@portabletext/react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { urlFor } from "../../../sanity/lib/client";
import type { SanityTrainer } from "../../../sanity/lib/fetch";

interface TrainerSpotlightProps {
  trainer: SanityTrainer;
}

export function TrainerSpotlight({ trainer }: TrainerSpotlightProps) {
  const hasImage = trainer.photo?.asset;

  return (
    <Section>
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text first on mobile, but visually second on desktop */}
          <ScrollReveal className="order-2 lg:order-1">
            <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
              {trainer.role}
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6">
              Maak kennis met {trainer.name}
            </h2>
            {trainer.bio ? (
              <div className="space-y-4 text-text-muted leading-relaxed prose-invert">
                <PortableText value={trainer.bio} />
              </div>
            ) : (
              <div className="space-y-4 text-text-muted leading-relaxed">
                <p>
                  Met jarenlange ervaring in personal training, functional
                  movement en strength coaching begeleidt {trainer.name} elke
                  klant met dezelfde passie en precisie.
                </p>
                <p>
                  Zijn aanpak is persoonlijk, wetenschappelijk onderbouwd en
                  altijd gericht op duurzaam resultaat. Geen shortcuts, geen
                  hypes — alleen wat werkt voor jouw lichaam.
                </p>
              </div>
            )}
            {trainer.quote && (
              <blockquote className="mt-8 pl-6 border-l-2 border-accent">
                <p className="font-[family-name:var(--font-playfair)] text-lg text-text italic">
                  &ldquo;{trainer.quote}&rdquo;
                </p>
                <cite className="block mt-3 text-sm text-text-muted not-italic">
                  — {trainer.name}
                </cite>
              </blockquote>
            )}
          </ScrollReveal>

          {/* Portrait */}
          <ScrollReveal delay={0.15} className="order-1 lg:order-2">
            {hasImage ? (
              <img
                src={urlFor(trainer.photo!).width(600).height(800).url()}
                alt={`Portret ${trainer.name}`}
                className="w-full aspect-[3/4] object-cover"
              />
            ) : (
              <div className="aspect-[3/4] bg-bg-elevated flex items-center justify-center">
                <span className="text-text-muted text-sm uppercase tracking-widest">
                  Portret {trainer.name}
                </span>
              </div>
            )}
          </ScrollReveal>
        </div>
      </Container>
    </Section>
  );
}
