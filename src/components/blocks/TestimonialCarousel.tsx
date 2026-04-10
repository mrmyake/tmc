"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { TESTIMONIALS } from "@/lib/constants";
import { Quote } from "lucide-react";

export function TestimonialCarousel() {
  return (
    <Section bg="elevated">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Ervaringen"
            heading="Wat onze leden zeggen"
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {TESTIMONIALS.map((testimonial, i) => (
            <ScrollReveal key={testimonial.name} delay={i * 0.1}>
              <div className="p-6 md:p-8">
                <Quote size={24} className="text-accent/40 mb-4" />
                <p className="text-text leading-relaxed mb-6 italic">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <p className="text-sm text-text-muted font-medium uppercase tracking-widest">
                  {testimonial.name}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
