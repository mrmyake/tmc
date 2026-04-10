"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { TESTIMONIALS } from "@/lib/constants";
import { Quote, Star } from "lucide-react";

function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-1 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <Star
          key={i}
          size={16}
          className="text-accent fill-accent"
        />
      ))}
    </div>
  );
}

export function TestimonialCarousel() {
  return (
    <Section bg="elevated">
      <Container>
        <ScrollReveal>
          <SectionHeading
            label="Google Reviews"
            heading="Wat onze klanten zeggen"
            subtext="Beoordeeld met ★★★★★ op Google — voorheen PT Loosdrecht."
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {TESTIMONIALS.map((testimonial, i) => (
            <ScrollReveal key={testimonial.name} delay={i * 0.1}>
              <div className="p-6 md:p-8">
                <Stars />
                <Quote size={24} className="text-accent/40 mb-4" />
                <p className="text-text leading-relaxed mb-6 italic">
                  &ldquo;{testimonial.text}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent/20 text-accent flex items-center justify-center text-sm font-medium rounded-full">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm text-text font-medium">
                      {testimonial.name}
                    </p>
                    <p className="text-xs text-text-muted">Google Review</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={0.3}>
          <div className="text-center mt-10">
            <a
              href="https://www.google.com/maps/place/PT+Loosdrecht/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:text-accent-hover transition-colors underline underline-offset-4"
            >
              Bekijk alle reviews op Google →
            </a>
          </div>
        </ScrollReveal>
      </Container>
    </Section>
  );
}
