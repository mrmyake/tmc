import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { LeadPageLayout } from "@/components/layout/LeadPageLayout";
import { Button } from "@/components/ui/Button";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Je aanvraag is ontvangen!",
  robots: { index: false },
};

export default function BedanktPage() {
  return (
    <LeadPageLayout>
      <Section className="pt-16 md:pt-24 min-h-[80vh] flex items-center">
        <Container className="max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent/10 text-accent mb-6">
            <Check size={32} />
          </div>
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4">
            Je aanvraag is ontvangen!
          </h1>
          <p className="text-text-muted text-lg mb-2">
            Marlon neemt binnen 24 uur contact op om een moment te prikken.
          </p>
          <p className="text-text-muted mb-8">
            We kijken ernaar uit je te ontmoeten in de studio.
          </p>
          <div className="bg-bg-elevated border border-bg-subtle p-8 mb-8">
            <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-3">
              In de tussentijd
            </h2>
            <p className="text-text-muted mb-6">
              Download de gratis Beweeg Beter guide: 5 oefeningen die je
              vandaag nog kunt doen.
            </p>
            <Button href="/beweeg-beter">Download de guide</Button>
          </div>
          <Button href="/" variant="ghost">
            Terug naar home
          </Button>
        </Container>
      </Section>
    </LeadPageLayout>
  );
}
