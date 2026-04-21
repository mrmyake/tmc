"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Check } from "lucide-react";
import type { SanityPricingTier } from "../../../sanity/lib/fetch";

interface PricingTableProps {
  tiers: SanityPricingTier[];
}

export function PricingTable({ tiers }: PricingTableProps) {
  return (
    <Section>
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Lidmaatschap"
            heading="Investeer in jezelf"
            subtext="Kies het traject dat past bij jouw doelen en levensstijl."
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((tier, i) => (
            <ScrollReveal key={tier._id} delay={i * 0.1}>
              <Card
                className={`h-full flex flex-col relative ${
                  tier.highlighted ? "border-accent/60" : ""
                }`}
                hover={false}
              >
                {tier.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-bg text-accent text-[10px] font-medium uppercase tracking-[0.3em] px-4 py-1.5 border border-accent/40">
                    Meest gekozen
                  </span>
                )}
                <div className="mb-6">
                  <h3 className="text-2xl font-medium text-text mb-2 tracking-[-0.01em]">
                    {tier.name}
                  </h3>
                  <p className="text-text-muted text-sm">{tier.subtitle}</p>
                  {tier.price && (
                    <p className="font-[family-name:var(--font-playfair)] text-accent text-4xl mt-3 tracking-[-0.02em]">
                      {tier.price}
                    </p>
                  )}
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-text-muted"
                    >
                      <Check
                        size={16}
                        strokeWidth={1.5}
                        className="text-accent mt-0.5 shrink-0"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  href={tier.ctaLink}
                  variant={tier.highlighted ? "primary" : "secondary"}
                  className="w-full text-center"
                >
                  {tier.ctaText}
                </Button>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
