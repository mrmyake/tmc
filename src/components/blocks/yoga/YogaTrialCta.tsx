import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { CLASS_CAPACITY } from "@/lib/constants";

interface Props {
  heading?: string;
  subtext?: string;
  bg?: "default" | "elevated" | "subtle";
}

/** Het publieke rooster, gefilterd op yoga en mobility. */
export const YOGA_ROOSTER_HREF = "/rooster?pijler=yoga_mobility";

/**
 * Proefles-CTA op alle yoga-pagina's, sinds de studio open is (verving de
 * wachtlijst-CTA van de pre-opening, fix/ads-landingspaginas-movenow).
 * Primair "Plan je proefles" naar /proefles, secundair het rooster. De
 * groepsgrootte komt uit CLASS_CAPACITY, dezelfde bron als /aanbod en
 * /prijzen.
 */
export function YogaTrialCta({
  // COPY: confirm met Marlon
  heading = "Ervaar het zelf",
  // COPY: confirm met Marlon
  subtext = `Plan een proefles en ontdek welke vorm bij je past. Maximaal ${CLASS_CAPACITY.yogaMobility} personen per les, met persoonlijke aandacht.`,
  bg = "elevated",
}: Props) {
  return (
    <Section bg={bg} id="proefles">
      <Container className="max-w-3xl text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          {/* COPY: confirm met Marlon */}
          Proefles
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
          {heading}
        </h2>
        <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">
          {subtext}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {/* COPY: confirm met Marlon */}
          <Button href="/proefles">Plan je proefles</Button>
          {/* COPY: confirm met Marlon */}
          <QuietLink href={YOGA_ROOSTER_HREF}>Bekijk het rooster</QuietLink>
        </div>
      </Container>
    </Section>
  );
}
