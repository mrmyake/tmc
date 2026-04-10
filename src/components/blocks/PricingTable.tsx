"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Card } from "@/components/ui/Card";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { PRICING_TIERS } from "@/lib/constants";
import { Check } from "lucide-react";

export function PricingTable() {
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
          {PRICING_TIERS.map((tier, i) => (
            <ScrollReveal key={tier.name} delay={i * 0.1}>
              <Card
                className={`h-full flex flex-col relative ${
                  tier.popular ? "border-accent" : ""
                }`}
                hover={false}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-bg text-xs font-medium uppercase tracking-widest px-4 py-1">
                    Populair
                  </span>
                )}
                <div className="mb-6">
                  <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-2">
                    {tier.name}
                  </h3>
                  <p className="text-text-muted text-sm">{tier.description}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-text-muted"
                    >
                      <Check
                        size={16}
                        className="text-accent mt-0.5 shrink-0"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  href="/contact"
                  variant={tier.popular ? "primary" : "secondary"}
                  className="w-full text-center"
                >
                  {tier.cta}
                </Button>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
