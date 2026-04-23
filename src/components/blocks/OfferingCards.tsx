"use client";

import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";
import type { SanityOffering } from "../../../sanity/lib/fetch";
import { urlFor } from "../../../sanity/lib/client";

interface OfferingCardsProps {
  offerings: SanityOffering[];
}

export function OfferingCards({ offerings }: OfferingCardsProps) {
  return (
    <Section id="aanbod" bg="elevated">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Het aanbod"
            heading="Training die bij jou past"
            subtext="Of je nu kiest voor persoonlijke begeleiding of de energie van een kleine groep. Elke sessie is doordacht en op maat."
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {offerings.map((offering, i) => (
            <ScrollReveal key={offering._id} delay={i * 0.1}>
              <article className="h-full flex flex-col bg-bg-elevated border border-transparent hover:border-accent/40 transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] overflow-hidden">
                {offering.image?.asset && (
                  <div className="relative aspect-[16/10] bg-bg-subtle">
                    <Image
                      src={urlFor(offering.image).width(960).height(600).url()}
                      alt={`${offering.title} — The Movement Club`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 flex flex-col justify-between p-8">
                  <div>
                    <span className="tmc-eyebrow mb-3 block">
                      {String(i + 1).padStart(2, "0")} · Aanbod
                    </span>
                    <h3 className="text-xl md:text-2xl text-text mb-3 font-medium tracking-[-0.01em]">
                      {offering.title}
                    </h3>
                    <p className="text-text-muted leading-relaxed">
                      {offering.subtitle || offering.targetAudience}
                    </p>
                  </div>
                  <div className="mt-8">
                    <Button
                      href={`/aanbod#${offering.slug?.current || ""}`}
                      variant="ghost"
                      className="px-0 gap-2"
                    >
                      Meer info
                      <ArrowRight size={16} strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
