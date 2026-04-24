"use client";

import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { urlFor } from "../../../sanity/lib/client";
import type { SanityImage } from "../../../sanity/lib/fetch";

interface AanbodImages {
  personalTraining?: SanityImage;
  smallGroup?: SanityImage;
  mobility?: SanityImage;
  strength?: SanityImage;
}

type TrainingId =
  | "personal-training"
  | "small-group"
  | "mobility"
  | "strength";

const IMAGE_KEY_BY_ID: Record<TrainingId, keyof AanbodImages> = {
  "personal-training": "personalTraining",
  "small-group": "smallGroup",
  mobility: "mobility",
  strength: "strength",
};

const trainings = [
  {
    id: "personal-training" as TrainingId,
    title: "Personal Training",
    subtitle: "Eén-op-één, volledig op maat",
    description:
      "De meest effectieve manier om je doelen te bereiken. Elke sessie is volledig afgestemd op jouw lichaam, niveau en ambities. Marlon begeleidt je door elke beweging met volle aandacht.",
    forWhom: "Voor iedereen die maximaal resultaat wil met persoonlijke begeleiding.",
    expect: [
      "Intake en assessment van je huidige niveau",
      "Gepersonaliseerd trainingsschema",
      "Continue begeleiding en bijsturing",
      "Voedingsadvies op maat",
    ],
    frequency: "1-4x per week, flexibel in te plannen",
  },
  {
    id: "small-group" as TrainingId,
    title: "Small Group Training",
    subtitle: "Maximaal 6 personen",
    description:
      "De energie van samen trainen, met de aandacht van personal training. In groepen van maximaal 6 personen garanderen we dat iedereen gezien wordt en de juiste techniek hanteert.",
    forWhom: "Voor wie de balans zoekt tussen persoonlijke aandacht en groepsdynamiek.",
    expect: [
      "Gevarieerde workouts die uitdagen",
      "Persoonlijke correcties en aanpassingen",
      "Vaste trainingstijden voor routine",
      "Motivatie van een hechte groep",
    ],
    frequency: "Vaste momenten door de week, ochtend en avond",
  },
  {
    id: "mobility" as TrainingId,
    title: "Mobility Sessions",
    subtitle: "Het fundament van goed bewegen",
    description:
      "Mobility is geen nice-to-have, het is de basis. In deze sessies werken we gericht aan je beweeglijkheid, flexibiliteit en lichaamsbewustzijn. Ideaal als aanvulling op je training of als zelfstandig traject.",
    forWhom: "Voor iedereen met stijfheid, blessure-gevoeligheid of zittend werk.",
    expect: [
      "Gerichte mobiliteitsroutines",
      "Myofasciale release technieken",
      "Ademhalingswerk",
      "Bewegingsscreenings",
    ],
    frequency: "1-2x per week, los of als aanvulling",
  },
  {
    id: "strength" as TrainingId,
    title: "Strength Programs",
    subtitle: "Gestructureerd sterker worden",
    description:
      "Een doordacht krachtprogramma dat periodisatie, progressieve overload en herstelbeheer combineert. Geen random workouts, maar een plan dat je meetbaar sterker maakt, week na week.",
    forWhom: "Voor gevorderden die structuur en progressie zoeken in hun krachttraining.",
    expect: [
      "Periodisatie-schema op maat",
      "Progressieve overload tracking",
      "Techniekanalyse van compound lifts",
      "Regelmatige evaluatiemomenten",
    ],
    frequency: "3-4x per week, volgens vast schema",
  },
];

const faqs = [
  {
    q: "Heb ik ervaring nodig om te starten?",
    a: "Nee. Of je nu beginner bent of gevorderd, we passen elke training aan op jouw niveau. Tijdens de intake brengen we je huidige staat in kaart.",
  },
  {
    q: "Kan ik verschillende trainingsvormen combineren?",
    a: "Absoluut. Veel leden combineren bijvoorbeeld small group training met een maandelijkse personal training sessie of mobility sessions.",
  },
  {
    q: "Hoe groot zijn de groepen bij Small Group Training?",
    a: "Maximaal 6 personen. Zo garanderen we dat iedereen persoonlijke aandacht krijgt en de techniek correct wordt uitgevoerd.",
  },
  {
    q: "Wat als ik een blessure heb?",
    a: "Bij een blessure passen we het programma aan. We werken samen met fysiotherapeuten in de regio voor een geïntegreerde aanpak.",
  },
  {
    q: "Zijn er vaste contracten?",
    a: "We werken met flexibele lidmaatschappen. Neem contact op voor de mogelijkheden die bij jou passen.",
  },
];

interface AanbodContentProps {
  images: AanbodImages;
}

export function AanbodContent({ images }: AanbodContentProps) {
  return (
    <>
      {/* Header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Ons aanbod"
              heading="Trainingen op maat"
              subtext="Elke trainingsvorm bij The Movement Club is ontworpen met hetzelfde doel: jou helpen beter te bewegen, sterker te worden en je het beste te laten voelen."
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Training types */}
      {trainings.map((training, i) => {
        const image = images[IMAGE_KEY_BY_ID[training.id]];
        return (
        <Section key={training.id} id={training.id} bg={i % 2 === 0 ? "elevated" : "default"}>
          <Container>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
              <ScrollReveal>
                <div className="relative aspect-[4/3] bg-bg-subtle sticky top-28 overflow-hidden">
                  {image?.asset ? (
                    <Image
                      src={urlFor(image).width(1200).height(900).url()}
                      alt={`${training.title} — The Movement Club`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      // Eerste card is LCP-kandidaat op /aanbod
                      priority={i === 0}
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="tmc-eyebrow text-text-muted">
                        Foto {training.title}
                      </span>
                    </div>
                  )}
                </div>
              </ScrollReveal>

              <ScrollReveal delay={0.15}>
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  {String(i + 1).padStart(2, "0")} · {training.subtitle}
                </span>
                <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-8 leading-[1.05] tracking-[-0.02em]">
                  {training.title}
                </h2>
                <p className="text-text-muted text-lg leading-relaxed mb-10">
                  {training.description}
                </p>

                <div className="space-y-8">
                  <div>
                    <span className="tmc-eyebrow block mb-3">Voor wie</span>
                    <p className="text-text text-sm leading-relaxed">
                      {training.forWhom}
                    </p>
                  </div>

                  <div>
                    <span className="tmc-eyebrow block mb-4">
                      Wat kun je verwachten
                    </span>
                    <ul className="border-y border-bg-subtle divide-y divide-bg-subtle">
                      {training.expect.map((item, j) => (
                        <li
                          key={item}
                          className="py-3.5 flex items-baseline gap-5"
                        >
                          <span className="tmc-eyebrow text-text-muted/70 shrink-0">
                            {String(j + 1).padStart(2, "0")}
                          </span>
                          <span className="text-text text-sm leading-relaxed">
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="tmc-eyebrow block mb-3">Frequentie</span>
                    <p className="text-text text-sm">{training.frequency}</p>
                  </div>
                </div>

                <div className="mt-10">
                  <Button href="/proefles">Probeer het zelf</Button>
                </div>
              </ScrollReveal>
            </div>
          </Container>
        </Section>
        );
      })}

      {/* Mobility Reset CTA */}
      <Section bg="elevated">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Gratis programma
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Benieuwd hoe mobiel je bent?
            </h2>
            <p className="text-text-muted text-lg mb-8 max-w-xl mx-auto">
              Probeer de gratis zeven-dagen mobility reset. Elke dag een korte
              video van Marlon.
            </p>
            <Button href="/mobility-reset">Start de reset</Button>
          </ScrollReveal>
        </Container>
      </Section>

      {/* FAQ */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <SectionHeading
              label="Veelgestelde vragen"
              heading="Nog vragen?"
            />
          </ScrollReveal>
          <div className="border-t border-bg-subtle">
            {faqs.map((faq, i) => (
              <ScrollReveal key={faq.q} delay={i * 0.06}>
                <div className="py-6 border-b border-bg-subtle flex gap-8">
                  <span className="tmc-eyebrow text-text-muted/70 shrink-0 pt-1">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-text font-medium text-base mb-2 tracking-[-0.01em]">
                      {faq.q}
                    </h3>
                    <p className="text-text-muted text-sm leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section bg="elevated">
        <Container className="text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Kom langs
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Klaar om te beginnen?
            </h2>
            <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">
              Plan een vrijblijvende proefles en ontdek welke training bij jou
              past.
            </p>
            <Button href="/proefles">Plan je proefles</Button>
            <p className="text-text-muted text-sm mt-8">
              Nog niet klaar om te starten?{" "}
              <QuietLink href="/beweeg-beter" className="inline">
                Download de Beweeg Beter guide
              </QuietLink>
            </p>
          </ScrollReveal>
        </Container>
      </Section>
    </>
  );
}
