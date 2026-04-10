"use client";

import { useEffect } from "react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { LeadPageLayout } from "@/components/layout/LeadPageLayout";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Check } from "lucide-react";

export function BedanktContent() {
  // Auto-download backup
  useEffect(() => {
    const timer = setTimeout(() => {
      const link = document.createElement("a");
      link.href = "/downloads/beweeg-beter-guide.pdf";
      link.download = "Beweeg-Beter-Guide-The-Movement-Club.pdf";
      link.click();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LeadPageLayout>
      <Section className="pt-16 md:pt-24 min-h-[80vh] flex items-center">
        <Container className="max-w-2xl text-center">
          <ScrollReveal>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 text-accent mb-6">
              <Check size={32} />
            </div>
            <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4">
              Je guide is onderweg!
            </h1>
            <p className="text-text-muted text-lg mb-2">
              Check je inbox — de Beweeg Beter guide staat klaar.
            </p>
            <p className="text-text-muted mb-8">
              De download start ook automatisch.
            </p>
            <div className="bg-bg-elevated border border-bg-subtle p-8 mb-8">
              <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-3">
                Volgende stap
              </h2>
              <p className="text-text-muted mb-6">
                Klaar voor meer? Start de 7-Dagen Mobility Reset — elke dag een
                korte video van Marlon.
              </p>
              <Button href="/mobility-reset">
                Start de Mobility Reset
              </Button>
            </div>
            <Button href="/" variant="ghost">
              Terug naar home
            </Button>
          </ScrollReveal>
        </Container>
      </Section>
    </LeadPageLayout>
  );
}
