"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

export function OverContent() {
  return (
    <>
      {/* Page header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Over ons"
              heading="Het verhaal achter The Movement Club"
              subtext="Geen standaard sportschool. Een plek waar beweging, kracht en persoonlijke groei samenkomen."
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Origin story */}
      <Section bg="elevated">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <ScrollReveal>
              <div className="aspect-[4/3] bg-bg-subtle flex items-center justify-center">
                {/* {FOTO: Marlon in de studio, actie of portret} */}
                <span className="text-text-muted text-sm uppercase tracking-widest">
                  Foto {SITE.trainer.name}
                </span>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
                Waarom The Movement Club
              </span>
              <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-6">
                Ontstaan uit overtuiging
              </h2>
              <div className="space-y-4 text-text-muted leading-relaxed">
                <p>
                  The Movement Club is geboren uit de overtuiging dat fitness
                  persoonlijk moet zijn. Na jaren werken in grote sportscholen
                  zag {SITE.trainer.name} hoe leden verdwalen in drukte, slechte
                  begeleiding en one-size-fits-all schema&apos;s.
                </p>
                <p>
                  De visie was helder: een intieme studio waar elk lid gekend
                  wordt. Waar de training niet draait om trends, maar om jouw
                  lichaam, jouw doelen en jouw tempo.
                </p>
                <p>
                  In 2024 werd die visie werkelijkheid. Op de Industrieweg in
                  Loosdrecht opende The Movement Club de deuren — 160m² puur
                  gericht op kwalitatieve training in een omgeving die inspireert.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Visie */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <SectionHeading
              label="Onze visie"
              heading="Functioneel. Holistisch. Duurzaam."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <div className="space-y-6 text-text-muted leading-relaxed text-lg">
              <p>
                Wij geloven dat goed bewegen de basis is van alles. Niet alleen
                voor sportprestaties, maar voor je dagelijks leven. Hoe je
                loopt, bukt, tilt, draait — het begint allemaal bij
                beweegkwaliteit.
              </p>
              <p>
                Onze aanpak combineert drie disciplines: <em>movement</em> voor
                natuurlijke bewegingspatronen, <em>mobility</em> voor
                flexibiliteit en herstel, en <em>strength</em> voor kracht die
                functioneel en overdraagbaar is.
              </p>
              <p>
                We trainen niet voor de spiegel. We trainen voor het leven
                daarbuiten.
              </p>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Studio galerij */}
      <Section bg="elevated">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="De studio"
              heading="Een ruimte die inspireert"
              subtext="Elk detail is doordacht — van de apparatuur tot de verlichting."
            />
          </ScrollReveal>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              "Studio overzicht — apparatuur en ruimte",
              "Detail — premium apparatuur close-up",
              "Sfeer — verlichting en materialen",
              "Training in actie — small group",
              "Mobility area — stretching zone",
              "Entree en ontvangst",
            ].map((desc, i) => (
              <ScrollReveal key={desc} delay={i * 0.08}>
                <div className="aspect-square bg-bg-subtle flex items-center justify-center p-4">
                  {/* {FOTO: ${desc}} */}
                  <span className="text-text-muted text-xs text-center uppercase tracking-widest">
                    {desc}
                  </span>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section>
        <Container className="text-center">
          <ScrollReveal>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-4">
              Benieuwd geworden?
            </h2>
            <p className="text-text-muted text-lg mb-8 max-w-xl mx-auto">
              Kom langs voor een vrijblijvende proefles en ervaar zelf wat The
              Movement Club anders maakt.
            </p>
            <Button href="/proefles">Boek een proefles</Button>
          </ScrollReveal>
        </Container>
      </Section>
    </>
  );
}
