import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { CalibrationTicks } from "@/components/ui/CalibrationTicks";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import { ProgrammaEyebrow } from "./_components/ProgrammaEyebrow";
import {
  ProgrammaFaqAccordion,
  type ProgrammaFaqItem,
} from "./_components/ProgrammaFaqAccordion";

// COPY: confirm met Marlon
const steps = [
  {
    num: "01",
    title: "Intake en meting",
    description:
      "We beginnen met een uitgebreide intake en een 12 punts huidplooimeting. Een volledig startpunt: waar je nu staat, en waar je naartoe wilt.",
    tags: ["Uitgebreide intake", "12 punts huidplooimeting"],
  },
  {
    num: "02",
    title: "Jouw hormonaal profiel",
    description:
      "Op basis van de metingen stellen we je persoonlijk hormonaal profiel op. Dat bepaalt hoe we voeding en training precies op jou afstemmen.",
    tags: ["Volledig hormonaal profiel"],
  },
  {
    num: "03",
    title: "Voeding die je ook echt opneemt",
    description:
      "Met een maagzuurtest kijken we hoe goed je je voeding daadwerkelijk opneemt. Je persoonlijk voedings- en supplementenadvies bouwen we daarop.",
    tags: [
      "Maagzuurtest",
      "Persoonlijk voedingsadvies",
      "Persoonlijk supplementenadvies",
    ],
  },
  {
    num: "04",
    title: "Twaalf weken begeleiding",
    description:
      "Twee personal training sessies per week, een motiverende groepsles, en dagelijkse begeleiding richting een duurzame leefstijl.",
    tags: ["2× personal training", "Motiverende groepsles", "Dagelijkse begeleiding"],
  },
] as const;

// COPY: confirm met Marlon
const groups = [
  {
    eyebrow: "Meten en inzicht",
    title: "Jouw uitgangspunt",
    items: [
      "Uitgebreide intake",
      "12 punts huidplooimeting",
      "Volledig hormonaal profiel",
      "Optimalisatie voeding via maagzuurtest",
    ],
  },
  {
    eyebrow: "Trainen",
    title: "Beweging op maat",
    items: [
      "Twee personal training sessies per week",
      "Deelname aan motiverende groepsles",
    ],
  },
  {
    eyebrow: "Voeding en supplementen",
    title: "Persoonlijk afgestemd",
    items: ["Persoonlijk voedingsadvies", "Persoonlijk supplementenadvies"],
  },
  {
    eyebrow: "Begeleiding",
    title: "Elke dag naast je",
    items: ["Dagelijkse begeleiding", "Duurzame leefstijl begeleiding"],
  },
] as const;

// COPY + prijzen: confirm met Marlon
const studioFeatures = [
  "Alle metingen en je hormonaal profiel",
  "2× personal training per week in de studio",
  "Motiverende groepsles",
  "Voedings- en supplementenadvies",
  "Dagelijkse begeleiding",
];

// COPY + prijzen: confirm met Marlon
const onlineFeatures = [
  "Intake en hormonaal profiel op afstand",
  "Persoonlijk trainings- en voedingsplan",
  "Supplementenadvies",
  "Dagelijkse begeleiding online",
];

// COPY: confirm met Marlon
const faqs: ProgrammaFaqItem[] = [
  {
    question: "Voor wie is dit programma?",
    answer:
      "Voor iedereen die twaalf weken lang serieus en persoonlijk begeleid wil worden, van beginner tot ervaren sporter. Alles wordt afgestemd op jouw uitgangspunt.",
  },
  {
    question: "Wat is het verschil tussen studio en online?",
    answer:
      "De methode is hetzelfde. In de studio train je twee keer per week persoonlijk met Marlon in Loosdrecht. Online krijg je dezelfde metingen, plannen en dagelijkse begeleiding op afstand.",
  },
  {
    question: "Moet ik al ervaring hebben met trainen?",
    answer:
      "Nee. Het traject start altijd bij een volledige meting, zodat we op jouw niveau beginnen.",
  },
  {
    question: "Wat gebeurt er na mijn aanvraag?",
    answer:
      "Je plant een intake. Dat is een vrijblijvende kennismaking waarin we het programma doornemen en kijken of het bij je past. Pas daarna beslis je.",
  },
];

interface TwaalfWekenProgrammaContentProps {
  studioPriceCents: number;
  onlinePriceCents: number;
}

export function TwaalfWekenProgrammaContent({
  studioPriceCents,
  onlinePriceCents,
}: TwaalfWekenProgrammaContentProps) {
  return (
    <>
      {/* Hero. Losse h1 (niet SectionHeading, die rendert altijd h2) zodat
          dit de enige h1 op de pagina is — zie /prijzen voor hetzelfde
          patroon. Top-padding houdt rekening met de absoluut gepositioneerde
          ProgrammaTopbar erboven. */}
      <Section className="pt-32 pb-16 md:pt-[150px] md:pb-24">
        <Container>
          <ScrollReveal>
            {/* COPY: confirm met Marlon */}
            <ProgrammaEyebrow>Het 12 weken programma</ProgrammaEyebrow>
            {/* COPY: confirm met Marlon */}
            <h1 className="font-[family-name:var(--font-playfair)] font-normal text-text mt-7 text-[2.75rem] leading-[1.05] tracking-[-0.01em] max-w-[15ch] md:text-6xl lg:text-7xl">
              Eerst meten.
              <br />
              Dan pas{" "}
              <em className="not-italic text-accent font-normal">
                trainen.
              </em>
            </h1>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-lg mt-7 max-w-[52ch]">
              Een persoonlijk traject van twaalf weken, opgebouwd rond jouw
              lichaam. We brengen alles in kaart, van huidplooimeting tot
              hormonaal profiel, en bouwen daar training, voeding en
              dagelijkse begeleiding op.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-10">
              {/* COPY: confirm met Marlon */}
              <Button
                href="/12-weken-programma/intake"
                variant="primary"
                className="group"
              >
                Plan je intake
                <span
                  aria-hidden
                  className="ml-2 inline-block transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-1"
                >
                  →
                </span>
              </Button>
              {/* COPY: confirm met Marlon */}
              <Button href="#aanpak" variant="secondary">
                Bekijk de aanpak
              </Button>
            </div>
            <div className="flex flex-wrap gap-10 md:gap-12 mt-16 pt-7 border-t border-bg-subtle">
              {/* COPY: confirm met Marlon */}
              <div className="flex flex-col gap-1.5">
                <span className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                  12
                </span>
                <span className="text-text-muted text-xs uppercase tracking-[0.13em]">
                  weken begeleiding
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                  2×
                </span>
                <span className="text-text-muted text-xs uppercase tracking-[0.13em]">
                  personal training per week
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                  1-op-1
                </span>
                <span className="text-text-muted text-xs uppercase tracking-[0.13em]">
                  volledig op maat
                </span>
              </div>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      <CalibrationTicks />

      {/* Thesis strip */}
      <Section bg="stone" className="py-16 md:py-24">
        <Container className="max-w-[900px]">
          <ScrollReveal>
            {/* COPY: confirm met Marlon */}
            <p className="font-[family-name:var(--font-playfair)] text-on-light text-[1.7rem] leading-[1.28] tracking-[-0.005em] md:text-4xl lg:text-[2.5rem]">
              De meeste programma&apos;s beginnen bij een schema. Wij
              beginnen bij jou:{" "}
              <span className="text-accent not-italic">
                wat je lichaam nodig heeft, hoe je voeding opneemt, en waar
                je energie vandaan komt.
              </span>{" "}
              Pas als dat helder is, begint het echte werk.
            </p>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Aanpak / methode */}
      <Section id="aanpak">
        <Container>
          <ScrollReveal>
            <div className="max-w-[620px] mb-14 md:mb-16">
              {/* COPY: confirm met Marlon */}
              <ProgrammaEyebrow>De aanpak</ProgrammaEyebrow>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-text text-4xl md:text-5xl mt-5 tracking-[-0.01em]">
                Vier stappen naar een compleet beeld
              </h2>
            </div>
          </ScrollReveal>
          <div className="border-b border-bg-subtle">
            {steps.map((step, i) => (
              <ScrollReveal key={step.title} delay={i * 0.08}>
                <div className="grid grid-cols-1 sm:grid-cols-[96px_1fr] gap-3 sm:gap-8 py-9 border-t border-bg-subtle">
                  <span className="font-[family-name:var(--font-playfair)] text-3xl sm:text-4xl text-accent leading-none">
                    {step.num}
                  </span>
                  <div>
                    <h3 className="text-text text-xl md:text-2xl mb-3">
                      {step.title}
                    </h3>
                    <p className="text-text-muted max-w-[60ch]">
                      {step.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {step.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs tracking-[0.02em] text-text border border-bg-subtle rounded-full px-3.5 py-1.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Wat je krijgt */}
      <Section bg="stone">
        <Container>
          <ScrollReveal>
            <div className="max-w-[640px] mb-14 md:mb-16">
              {/* COPY: confirm met Marlon */}
              <ProgrammaEyebrow>Wat je krijgt</ProgrammaEyebrow>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-on-light text-4xl md:text-5xl mt-5 tracking-[-0.01em]">
                Alles wat bij het traject hoort
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border-on-light border border-border-on-light">
              {groups.map((group) => (
                <div key={group.eyebrow} className="bg-surface-light p-8 md:p-10">
                  {/* COPY: confirm met Marlon */}
                  <span className="tmc-eyebrow tmc-eyebrow--accent font-semibold">
                    {group.eyebrow}
                  </span>
                  <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-on-light mt-3 mb-5">
                    {group.title}
                  </h3>
                  <ul className="divide-y divide-border-on-light">
                    {group.items.map((item) => (
                      <li
                        key={item}
                        className="flex gap-3.5 items-start py-2.5 first:pt-0 text-on-light text-[15px] md:text-base"
                      >
                        <span
                          aria-hidden
                          className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-none"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Marlon. Mockup's sec-ink (#171310) valt vrijwel samen met de
          bestaande bg="elevated" toon (--ink-800, #17140F) — geen aparte
          derde Section-variant nodig, dit is al zo goed als een exacte
          match. */}
      <Section bg="elevated">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-[0.85fr_1.15fr] gap-9 md:gap-14 items-center">
            <ScrollReveal>
              <div className="relative aspect-[16/11] md:aspect-[4/5] border border-bg-subtle bg-gradient-to-b from-[#211b15] to-[#14100c] flex items-center justify-center">
                <span
                  aria-hidden
                  className="absolute inset-3.5 border border-accent/25"
                />
                <span className="tmc-eyebrow text-text-muted text-center px-6 relative z-10">
                  Foto Marlon
                  <br />
                  (4:5)
                </span>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.12}>
              {/* COPY: confirm met Marlon */}
              <ProgrammaEyebrow>Onder begeleiding van Marlon</ProgrammaEyebrow>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-text text-3xl md:text-4xl lg:text-5xl mt-6 tracking-[-0.01em]">
                De trainer achter het programma
              </h2>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted mt-6 max-w-[52ch] leading-relaxed">
                Marlon is hoofdtrainer en Kettlebell Master bij The Movement
                Club. Zij ontwikkelde dit traject vanuit één overtuiging:
                dat blijvende verandering begint bij begrijpen hoe jouw
                lichaam werkt, niet bij een standaardschema.
              </p>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted mt-5 max-w-[52ch] leading-relaxed">
                Gedurende twaalf weken werk je persoonlijk met haar samen,
                van de eerste meting tot de dagelijkse begeleiding.
              </p>
              {/* COPY: confirm met Marlon */}
              <p className="font-[family-name:var(--font-playfair)] text-accent text-xl mt-7">
                Marlon
              </p>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Investering */}
      <Section bg="stone">
        <Container>
          <ScrollReveal>
            <div className="max-w-[640px] mb-14 md:mb-16">
              {/* COPY: confirm met Marlon */}
              <ProgrammaEyebrow>Investering</ProgrammaEyebrow>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-on-light text-4xl md:text-5xl mt-5 tracking-[-0.01em]">
                Kies je vorm
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Studio (feature) card — dark, on top of the stone section */}
            <ScrollReveal>
              <div className="bg-bg text-text border border-bg p-9 md:p-11 h-full flex flex-col">
                {/* COPY + prijzen: confirm met Marlon */}
                <span className="text-accent text-xs font-semibold uppercase tracking-[0.16em]">
                  In de studio
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl mt-3.5">
                  12 Weken Studio
                </h3>
                <p className="text-text-muted text-sm mt-1">
                  Volledig begeleid, in Loosdrecht
                </p>
                <p className="font-[family-name:var(--font-playfair)] text-[3.25rem] leading-none mt-7 tracking-[-0.01em]">
                  {formatPriceEuro(studioPriceCents)}{" "}
                  <small className="font-sans text-base text-text-muted align-top">
                    totaal
                  </small>
                </p>
                <p className="text-text-muted text-sm mt-1">
                  Voor het volledige traject van 12 weken
                </p>
                <div className="border border-accent/45 bg-accent/10 rounded-sm px-4 py-3.5 mt-5 flex flex-col gap-1.5">
                  <span className="text-accent text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Early Member bonus
                  </span>
                  <span className="text-text text-[15px] font-medium leading-snug">
                    Onbeperkt groepslessen tijdens je programma
                  </span>
                </div>
                <ul className="mt-6 mb-8 space-y-2.5 flex-1">
                  {studioFeatures.map((feature) => (
                    <li key={feature} className="flex gap-3 items-start text-[15px]">
                      <span aria-hidden className="text-accent mt-0.5">
                        ✓
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  href="/12-weken-programma/intake"
                  variant="primary"
                  className="w-full justify-center"
                >
                  Plan je intake
                </Button>
              </div>
            </ScrollReveal>

            {/* Online card — light, bordered */}
            <ScrollReveal delay={0.1}>
              <div className="bg-surface-light text-on-light border border-border-on-light p-9 md:p-11 h-full flex flex-col">
                {/* COPY + prijzen: confirm met Marlon */}
                <span className="text-accent text-xs font-semibold uppercase tracking-[0.16em]">
                  Online
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl mt-3.5">
                  12 Weken Online
                </h3>
                <p className="text-on-light-muted text-sm mt-1">
                  Zelfde methode, op afstand begeleid
                </p>
                <p className="font-[family-name:var(--font-playfair)] text-[3.25rem] leading-none mt-7 tracking-[-0.01em]">
                  {formatPriceEuro(onlinePriceCents)}{" "}
                  <small className="font-sans text-base text-on-light-muted align-top">
                    totaal
                  </small>
                </p>
                <p className="text-on-light-muted text-sm mt-1">
                  Voor het volledige traject van 12 weken
                </p>
                <div className="border border-accent/45 bg-accent/[0.07] rounded-sm px-4 py-3.5 mt-5 flex flex-col gap-1.5">
                  <span className="text-accent text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Early Member bonus
                  </span>
                  <span className="text-on-light text-[15px] font-medium leading-snug">
                    2× vrij trainen + 1× kettlebell per week
                  </span>
                </div>
                <ul className="mt-6 mb-8 space-y-2.5 flex-1">
                  {onlineFeatures.map((feature) => (
                    <li key={feature} className="flex gap-3 items-start text-[15px]">
                      <span aria-hidden className="text-accent mt-0.5">
                        ✓
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {/*
                  Bewuste keuze: geen Button-component hier. Button's
                  "secondary" variant hardcodet text-text/border-text-muted
                  (bedoeld voor donkere achtergronden) — op deze lichte kaart
                  geeft dat te weinig contrast. Dit is de mockup's
                  "btn-ghost.on-light": zelfde maatvoering/typografie als
                  Button, maar met de on-light kleurtokens.
                */}
                <Link
                  href="/12-weken-programma/intake"
                  className="w-full inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer border border-border-on-light text-on-light hover:border-accent hover:text-accent active:scale-[0.99]"
                >
                  Plan je intake
                </Link>
              </div>
            </ScrollReveal>
          </div>
          {/* COPY: confirm met Marlon */}
          <p className="text-on-light-muted text-sm mt-7 max-w-[70ch]">
            Vaste prijs, voor iedereen gelijk. De Early Member bonus is een
            extra bovenop je programma.
          </p>
        </Container>
      </Section>

      {/* FAQ */}
      <Section bg="stone" className="pt-5 md:pt-8">
        <Container className="max-w-[800px]">
          <ScrollReveal>
            <div className="max-w-[640px] mb-10">
              {/* COPY: confirm met Marlon */}
              <ProgrammaEyebrow>Veelgestelde vragen</ProgrammaEyebrow>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-on-light text-4xl md:text-5xl mt-5 tracking-[-0.01em]">
                Goed om te weten
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <ProgrammaFaqAccordion faqs={faqs} />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Intake CTA */}
      <Section id="intake" className="text-center py-24 md:py-32">
        <Container className="max-w-3xl">
          <ScrollReveal>
            {/* COPY: confirm met Marlon */}
            <ProgrammaEyebrow center>Zet de eerste stap</ProgrammaEyebrow>
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-text text-4xl md:text-6xl mt-6 tracking-[-0.01em] max-w-[16ch] mx-auto">
              Begin met een intake
            </h2>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted mt-6 max-w-[48ch] mx-auto">
              Een vrijblijvende kennismaking. We nemen het programma door en
              bepalen samen of dit het juiste traject voor je is.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-10">
              {/* COPY: confirm met Marlon */}
              <Button
                href="/12-weken-programma/intake"
                variant="primary"
                className="group"
              >
                Plan je intake
                <span
                  aria-hidden
                  className="ml-2 inline-block transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-1"
                >
                  →
                </span>
              </Button>
              {/* COPY: confirm met Marlon */}
              <Button href="/12-weken-programma/intake" variant="secondary">
                Liever gebeld worden
              </Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>
    </>
  );
}
