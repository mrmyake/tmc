import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";

// Homepage-teaser die intern naar /yoga linkt met een beschrijvende anker-
// tekst ("yoga in Loosdrecht"). Zonder dit blok rankt de homepage zelf voor
// "yoga loosdrecht" terwijl de toegewijde /yoga-pagina niet meekomt; deze
// link geeft /yoga het relevante interne signaal.
export function YogaTeaser() {
  return (
    <Section bg="elevated">
      <Container className="max-w-3xl">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Yoga · Loosdrecht &amp; regio Hilversum
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text leading-[1.05] tracking-[-0.02em]">
          Ook yoga, van diepe rust tot dynamische flow.
        </h2>
        <p className="mt-8 text-text-muted text-lg leading-relaxed">
          Naast personal training en kracht vind je bij The Movement Club ook
          yoga. Yin, Restorative, Yoga Nidra, iRest en Flow, in kleine,
          persoonlijke lessen. Onze studio in Loosdrecht ligt op zo&apos;n tien
          minuten van Hilversum en is goed bereikbaar vanuit het hele Gooi.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <Button href="/yoga">Ontdek yoga in Loosdrecht</Button>
          <QuietLink href="/yoga/rooster">Bekijk het yogarooster</QuietLink>
        </div>
      </Container>
    </Section>
  );
}
