"use client";

import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { SITE } from "@/lib/constants";
import { urlFor } from "../../../sanity/lib/client";
import type { SanityImage, SanityGalleryImage } from "../../../sanity/lib/fetch";

interface OverContentProps {
  marlonImage?: SanityImage;
  hormoonprofielImage?: SanityImage;
  gallery?: SanityGalleryImage[];
}

export function OverContent({ marlonImage, hormoonprofielImage, gallery }: OverContentProps) {
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
              {marlonImage?.asset ? (
                <div className="relative w-full aspect-[4/3]">
                  <Image
                    src={urlFor(marlonImage).width(1200).height(900).url()}
                    alt={`${SITE.trainer.name} in de studio`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] bg-bg-subtle flex items-center justify-center">
                  <span className="text-text-muted text-sm uppercase tracking-widest">
                    Foto {SITE.trainer.name}
                  </span>
                </div>
              )}
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                01 · Waarom
              </span>
              <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-8 leading-[1.05] tracking-[-0.02em]">
                Ontstaan uit overtuiging
              </h2>
              <div className="space-y-4 text-text-muted leading-relaxed">
                <p>
                  The Movement Club is geboren uit de overtuiging dat fitness
                  persoonlijk moet zijn. Als oprichtster van PT Loosdrecht
                  begeleidde {SITE.trainer.name} jarenlang klanten met dezelfde
                  toewijding die haar kenmerkt. Maar ze wilde meer: een eigen
                  studio waar elk lid écht gekend wordt.
                </p>
                <p>
                  Haar visie was helder: een intieme plek waar de training niet
                  draait om trends, maar om jouw lichaam, jouw doelen en jouw
                  tempo. Geen anonieme sportschool, maar persoonlijke begeleiding
                  op het hoogste niveau.
                </p>
                <p>
                  Met de ervaring en reputatie opgebouwd bij PT Loosdrecht werd
                  die visie werkelijkheid. Op de Industrieweg in Loosdrecht
                  opende The Movement Club de deuren. 160m² puur gericht op
                  kwalitatieve training in een omgeving die inspireert.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Mobility Check CTA */}
      <Section>
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Gratis screening
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Ontdek hoe je beweegt
            </h2>
            <p className="text-text-muted text-lg mb-8 max-w-xl mx-auto">
              Boek een gratis Mobility Check en krijg een persoonlijk
              bewegingsprofiel van Marlon.
            </p>
            <Button href="/mobility-check">Plan mijn Mobility Check</Button>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Visie */}
      <Section bg="elevated">
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
                loopt, bukt, tilt, draait: het begint allemaal bij
                beweegkwaliteit.
              </p>
              <p>
                Onze aanpak combineert drie disciplines:{" "}
                <em className="not-italic text-text font-medium">movement</em>{" "}
                voor natuurlijke bewegingspatronen,{" "}
                <em className="not-italic text-text font-medium">mobility</em>{" "}
                voor flexibiliteit en herstel, en{" "}
                <em className="not-italic text-text font-medium">strength</em>{" "}
                voor kracht die functioneel en overdraagbaar is.
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
              subtext="Elk detail is doordacht, van de apparatuur tot de verlichting."
            />
          </ScrollReveal>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {gallery && gallery.length > 0
              ? gallery.map((img, i) => (
                  <ScrollReveal key={i} delay={i * 0.08}>
                    <div className="relative w-full aspect-square">
                      <Image
                        src={urlFor(img).width(800).height(800).url()}
                        alt={img.caption || `Studio foto ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  </ScrollReveal>
                ))
              : [
                  "Studio overzicht",
                  "Premium apparatuur",
                  "Sfeer en verlichting",
                  "Small group training",
                  "Mobility area",
                  "Entree en ontvangst",
                ].map((desc, i) => (
                  <ScrollReveal key={desc} delay={i * 0.08}>
                    <div className="aspect-square bg-bg-subtle flex items-center justify-center p-4">
                      <span className="text-text-muted text-xs text-center uppercase tracking-widest">
                        {desc}
                      </span>
                    </div>
                  </ScrollReveal>
                ))}
          </div>
        </Container>
      </Section>

      {/* Hormoonprofiel cross-link */}
      <Section>
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <ScrollReveal>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                02 · Holistisch
              </span>
              <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-8 leading-[1.05] tracking-[-0.02em]">
                Meer dan alleen training
              </h2>
              <div className="space-y-4 text-text-muted leading-relaxed">
                <p>
                  Marlon kijkt verder dan de training alleen. Via{" "}
                  <QuietLink
                    href="https://hormoonprofiel.com"
                    external
                    className="inline"
                  >
                    Hormoonprofiel.com
                  </QuietLink>{" "}
                  biedt zij inzicht in hoe hormonen invloed hebben op je energie,
                  herstel en resultaat.
                </p>
                <p>
                  Door training, voeding en hormoonbalans samen te brengen
                  ontstaat een compleet beeld, en een aanpak die écht werkt.
                  Voor vrouwen én mannen.
                </p>
              </div>
              <div className="mt-8">
                <Button
                  href="https://hormoonprofiel.com"
                  variant="secondary"
                >
                  Ontdek Hormoonprofiel
                </Button>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              {hormoonprofielImage?.asset ? (
                <div className="relative w-full aspect-[4/3]">
                  <Image
                    src={urlFor(hormoonprofielImage).width(1200).height(900).url()}
                    alt="Hormoonprofiel, holistisch trainen"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-[4/3] bg-bg-elevated flex items-center justify-center">
                  <span className="text-text-muted text-sm uppercase tracking-widest">
                    Hormoonprofiel
                  </span>
                </div>
              )}
            </ScrollReveal>
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
              Benieuwd geworden?
            </h2>
            <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">
              Kom langs voor een vrijblijvende proefles en ervaar zelf wat The
              Movement Club anders maakt.
            </p>
            <Button href="/proefles">Plan je proefles</Button>
          </ScrollReveal>
        </Container>
      </Section>
    </>
  );
}
