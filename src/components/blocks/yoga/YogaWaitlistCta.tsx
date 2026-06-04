import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";

interface Props {
  heading?: string;
  subtext?: string;
  bg?: "default" | "elevated" | "subtle";
}

/**
 * Wachtlijst-CTA voor de pré-opening. De primaire conversie op alle
 * yoga-pagina's.
 *
 * NB: het echte wachtlijst-formulier en het endpoint
 * `/api/leads/yoga-waitlist` (MailerLite-groep "Yoga Wachtlijst") landen in
 * PR-Y4. Tot die tijd wijst de knop naar het contactformulier zodat de
 * pagina nu al een werkende conversie heeft.
 */
export function YogaWaitlistCta({
  heading = "Wees erbij vanaf de eerste les",
  subtext = "De studio opent binnenkort. Schrijf je in voor de wachtlijst en je krijgt als eerste bericht zodra de yogalessen starten.",
  bg = "elevated",
}: Props) {
  return (
    <Section bg={bg}>
      <Container className="max-w-3xl text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Wachtlijst
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {heading}
        </h2>
        <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">
          {subtext}
        </p>
        <Button href="/contact">Zet me op de wachtlijst</Button>
      </Container>
    </Section>
  );
}
