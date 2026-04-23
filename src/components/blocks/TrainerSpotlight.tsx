"use client";

import Image from "next/image";
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
  // Keep the photo itself in a local so TS narrows the branch below
  // without forcing a non-null assertion. `hasImage` is only the
  // JSX guard; the photo variable carries the type narrowing.
  const photo = trainer.photo?.asset ? trainer.photo : null;

  return (
    <Section>
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text first on mobile, but visually second on desktop */}
          <ScrollReveal className="order-2 lg:order-1">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              02 · {trainer.role}
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
                  hypes. Alleen wat werkt voor jouw lichaam.
                </p>
              </div>
            )}
            {trainer.quote && (
              <blockquote className="mt-10 relative pl-8">
                <span
                  aria-hidden
                  className="absolute left-0 top-0 font-[family-name:var(--font-playfair)] text-5xl text-accent leading-none select-none"
                >
                  &ldquo;
                </span>
                <p className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-snug">
                  {trainer.quote}
                </p>
                <cite className="mt-4 flex items-center gap-3 text-xs text-text-muted not-italic uppercase tracking-[0.2em]">
                  <span aria-hidden className="w-6 h-px bg-text-muted/60" />
                  {trainer.name}
                </cite>
              </blockquote>
            )}
          </ScrollReveal>

          {/* Portrait */}
          <ScrollReveal delay={0.15} className="order-1 lg:order-2">
            {photo ? (
              <div className="relative w-full aspect-[3/4]">
                <Image
                  src={urlFor(photo).width(600).height(800).url()}
                  alt={`Portret ${trainer.name}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 600px"
                  className="object-cover"
                />
              </div>
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
