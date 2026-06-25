import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { YogaComparisonTable } from "@/components/blocks/yoga/YogaComparisonTable";
import { YogaTeacherStrip } from "@/components/blocks/yoga/YogaTeacherStrip";
import { YogaWaitlistCta } from "@/components/blocks/yoga/YogaWaitlistCta";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  getBreadcrumbSchema,
  getYogaItemListSchema,
} from "@/lib/structuredData";
import { SITE } from "@/lib/constants";
import { getYogaStyles, getYogaTeachers } from "../../../sanity/lib/fetch";

export const revalidate = 60;

export const metadata: Metadata = {
  // Brand-free: de layout-template voegt " | The Movement Club" toe.
  title: "Yoga in Loosdrecht, vlakbij Hilversum",
  description:
    "Yin, Restorative, Yoga Nidra, iRest en Flow in een kleine, persoonlijke studio in Loosdrecht, op tien minuten van Hilversum en het Gooi. Van diepe rust tot dynamische beweging. Schrijf je in voor de wachtlijst.",
  alternates: { canonical: "/yoga" },
  openGraph: {
    title: "Yoga in Loosdrecht, vlakbij Hilversum | The Movement Club",
    description:
      "Yin, Restorative, Yoga Nidra, iRest en Flow in een kleine, persoonlijke studio in Loosdrecht, op tien minuten van Hilversum. Schrijf je in voor de wachtlijst.",
  },
};

export default async function YogaHubPage() {
  const [styles, teachers] = await Promise.all([
    getYogaStyles(),
    getYogaTeachers(),
  ]);

  const breadcrumb = getBreadcrumbSchema([
    { name: "Home", url: SITE.url },
    { name: "Yoga", url: `${SITE.url}/yoga` },
  ]);
  const itemList = getYogaItemListSchema(
    styles.map((s) => ({ title: s.title, slug: s.slug })),
  );

  return (
    <>
      <JsonLd data={[breadcrumb, itemList]} />
      {/* Hero */}
      <Section className="pt-32 md:pt-40">
        <Container className="max-w-4xl">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
              Yoga · Loosdrecht &amp; regio Hilversum
            </span>
            <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl lg:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
              Yoga in Loosdrecht bij The Movement Club
            </h1>
            <p className="mt-8 text-text-muted text-lg md:text-xl leading-relaxed max-w-2xl">
              Binnen yoga zijn er verschillende vormen, elk met een eigen doel
              en gevoel. Sommige lessen zijn vooral gericht op diepe ontspanning
              en herstel, andere op beweging, kracht en energie. In onze kleine,
              persoonlijke studio vind je ze allemaal, van Yoga Nidra tot Flow.
              We zitten in Loosdrecht, op zo&apos;n tien minuten van Hilversum,
              en zijn goed bereikbaar vanuit het hele Gooi.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button href="#wachtlijst">Zet me op de wachtlijst</Button>
              <QuietLink href="/yoga/rooster">Bekijk het rooster</QuietLink>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Vergelijkingstabel */}
      <Section bg="elevated">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="De vijf vormen"
              heading="Vind de vorm die bij je past"
              subtext="Van volledige rust tot dynamische beweging. Verken de vormen op de as van rust naar actief."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <YogaComparisonTable styles={styles} />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Docentenstrip */}
      <Section>
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="De docenten"
              heading="Wie je begeleidt"
              subtext="Een klein team met elk een eigen stem en specialisatie."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <YogaTeacherStrip teachers={teachers} />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Rooster-preview */}
      <Section bg="elevated">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Wekelijks rooster
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Elke dag een moment voor jezelf
            </h2>
            <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">
              Ochtendlessen van maandag tot en met zaterdag, plus avondlessen
              vroeg in de week. Bekijk het volledige weekrooster en plan je les.
            </p>
            <Button href="/yoga/rooster" variant="secondary">
              Bekijk het rooster
            </Button>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Bereikbaarheid / regio */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Regio
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Yoga vlakbij Hilversum en het Gooi
            </h2>
            <p className="text-text-muted text-lg leading-relaxed">
              De studio staat aan de Industrieweg in Loosdrecht, op zo&apos;n
              tien minuten rijden vanuit het centrum van Hilversum en even goed
              bereikbaar vanuit Kortenhoef, Nederhorst den Berg en de rest van
              Wijdemeren. Er is ruime parkeergelegenheid voor de deur, dus je
              bent zo van Hilversum op je mat. Voor wie liever dichtbij huis
              traint, vormen onze kleine yogalessen een rustig alternatief voor
              de drukkere studio&apos;s in Hilversum.
            </p>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Wachtlijst-CTA */}
      <YogaWaitlistCta bg="elevated" />
    </>
  );
}
