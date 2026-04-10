"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";

const trainings = [
  {
    id: "personal-training",
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
    id: "small-group",
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
    id: "mobility",
    title: "Mobility Sessions",
    subtitle: "Het fundament van goed bewegen",
    description:
      "Mobility is geen nice-to-have — het is de basis. In deze sessies werken we gericht aan je beweeglijkheid, flexibiliteit en lichaamsbewustzijn. Ideaal als aanvulling op je training of als zelfstandig traject.",
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
    id: "strength",
    title: "Strength Programs",
    subtitle: "Gestructureerd sterker worden",
    description:
      "Een doordacht krachtprogramma dat periodisatie, progressieve overload en herstelbeheer combineert. Geen random workouts, maar een plan dat je meetbaar sterker maakt — week na week.",
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
    a: "Nee. Of je nu beginner bent of gevorderd — we passen elke training aan op jouw niveau. Tijdens de intake brengen we je huidige staat in kaart.",
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

export function AanbodContent() {
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
      {trainings.map((training, i) => (
        <Section key={training.id} id={training.id} bg={i % 2 === 0 ? "elevated" : "default"}>
          <Container>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
              <ScrollReveal>
                <div className="aspect-[4/3] bg-bg-subtle flex items-center justify-center sticky top-28">
                  {/* {FOTO: ${training.title} in actie} */}
                  <span className="text-text-muted text-sm uppercase tracking-widest">
                    Foto {training.title}
                  </span>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={0.15}>
                <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-3 block">
                  {training.subtitle}
                </span>
                <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6">
                  {training.title}
                </h2>
                <p className="text-text-muted leading-relaxed mb-6">
                  {training.description}
                </p>

                <div className="space-y-6">
                  <div>
                    <h4 className="text-text font-medium text-sm uppercase tracking-widest mb-2">
                      Voor wie
                    </h4>
                    <p className="text-text-muted text-sm leading-relaxed">
                      {training.forWhom}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-text font-medium text-sm uppercase tracking-widest mb-2">
                      Wat kun je verwachten
                    </h4>
                    <ul className="space-y-2">
                      {training.expect.map((item) => (
                        <li
                          key={item}
                          className="text-text-muted text-sm flex items-start gap-2"
                        >
                          <span className="text-accent mt-1">—</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-text font-medium text-sm uppercase tracking-widest mb-2">
                      Frequentie
                    </h4>
                    <p className="text-text-muted text-sm">{training.frequency}</p>
                  </div>
                </div>

                <div className="mt-8">
                  <Button href="/proefles">Probeer het zelf</Button>
                </div>
              </ScrollReveal>
            </div>
          </Container>
        </Section>
      ))}

      {/* FAQ */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <SectionHeading
              label="Veelgestelde vragen"
              heading="Nog vragen?"
            />
          </ScrollReveal>
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <ScrollReveal key={faq.q} delay={i * 0.08}>
                <div className="border-b border-bg-subtle pb-6">
                  <h3 className="text-text font-medium mb-2">{faq.q}</h3>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {faq.a}
                  </p>
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
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4">
              Klaar om te beginnen?
            </h2>
            <p className="text-text-muted text-lg mb-8 max-w-xl mx-auto">
              Boek een vrijblijvende proefles en ontdek welke training bij jou past.
            </p>
            <Button href="/proefles">Boek een proefles</Button>
          </ScrollReveal>
        </Container>
      </Section>
    </>
  );
}
