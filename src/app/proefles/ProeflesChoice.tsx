"use client";

import { useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GoogleReviewsBadge } from "@/components/ui/GoogleReviewsBadge";
import { ProeflesContent } from "./ProeflesContent";
import { trackCTA } from "@/lib/analytics";
import { withAttribution, type AttributionParams } from "@/lib/attribution/params";

/**
 * Drieweg-keuze vóór alles (spec-community-growth.md §1): direct boeken
 * (betaald, instant), een proefcode (gratis, eerst de code, dan de sessie)
 * en liever gebeld worden (gratis, bestaande /proefles-flow, ongewijzigd).
 * Drie gelijkwaardige kaarten, geen stille default.
 *
 * Altijd de drie kaarten, ook tijdens de gratis openingsperiode: die is alleen
 * bedoeld voor campagneverkeer en bereikbaar via /proefles/gratis, dat nergens
 * vanaf deze pagina wordt gelinkt.
 *
 * attribution: advertentie- en campagneparameters uit de URL van deze pagina
 * (spec-marketing-attribution.md). De kaarten dragen ze mee in hun links en
 * het terugbelformulier stuurt ze mee; zonder parameters blijven de links
 * precies zoals ze waren.
 */
export function ProeflesChoice({
  attribution = {},
}: {
  attribution?: AttributionParams;
}) {
  const [choice, setChoice] = useState<"none" | "call">("none");

  if (choice === "call") {
    return <ProeflesContent attribution={attribution} />;
  }

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh] flex items-center">
      <Container className="max-w-5xl">
        <ScrollReveal>
          <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
            <span aria-hidden className="w-12 h-px bg-accent" />
            Kennismaken
            <span aria-hidden className="w-12 h-px bg-accent" />
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
            {/* COPY: confirm with Marlon */}
            Hoe wil je kennismaken?
          </h1>
          <p className="text-text-muted text-lg leading-relaxed mb-14 max-w-2xl">
            {/* COPY: confirm met Marlon */}
            Drie manieren om The Movement Club te ervaren. Kies wat bij je
            past.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <ScrollReveal delay={0.05}>
            <Link
              href={withAttribution("/proefles/boeken", attribution)}
              onClick={() => trackCTA("Boek direct", "/proefles")}
              className="group block h-full bg-bg-elevated p-8 md:p-10 relative transition-colors duration-300 hover:bg-bg-elevated/80"
            >
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              />
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Direct een plek
              </span>
              <h2 className="text-2xl font-medium text-text mb-4 tracking-[-0.01em]">
                {/* COPY: confirm with Marlon */}
                Boek nu je proefles
              </h2>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                {/* COPY: confirm with Marlon */}
                Kies zelf een sessie uit het rooster en betaal meteen. Geen
                wachten op een belletje, gewoon inplannen.
              </p>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent group-hover:underline">
                Bekijk beschikbare sessies
              </span>
            </Link>
          </ScrollReveal>

          <ScrollReveal delay={0.075}>
            <Link
              href={withAttribution("/proefles/code", attribution)}
              onClick={() => trackCTA("Ik heb een proefcode", "/proefles")}
              className="group block h-full bg-bg-elevated p-8 md:p-10 relative transition-colors duration-300 hover:bg-bg-elevated/80"
            >
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              />
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                {/* COPY: confirm met Marlon */}
                Gratis · Uitgenodigd
              </span>
              <h2 className="text-2xl font-medium text-text mb-4 tracking-[-0.01em]">
                {/* COPY: confirm met Marlon */}
                Ik heb een proefcode
              </h2>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                {/* COPY: confirm met Marlon */}
                Heb je een proefcode gekregen? Vul die in, kies zelf een
                sessie en boek je gratis proefles.
              </p>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent group-hover:underline">
                {/* COPY: confirm met Marlon */}
                Code invoeren
              </span>
            </Link>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <button
              type="button"
              onClick={() => {
                trackCTA("Liever gebeld worden", "/proefles");
                setChoice("call");
              }}
              className="group block w-full h-full text-left bg-bg-elevated p-8 md:p-10 relative transition-colors duration-300 hover:bg-bg-elevated/80"
            >
              <div
                aria-hidden
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
              />
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                {/* COPY: confirm met Marlon */}
                Vrijblijvend
              </span>
              <h2 className="text-2xl font-medium text-text mb-4 tracking-[-0.01em]">
                {/* COPY: confirm with Marlon */}
                Liever gebeld worden
              </h2>
              <p className="text-text-muted text-sm leading-relaxed mb-6">
                {/* COPY: confirm with Marlon */}
                Laat je gegevens achter en Marlon belt je persoonlijk om een
                moment te plannen dat bij je past.
              </p>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent group-hover:underline">
                Meld je aan
              </span>
            </button>
          </ScrollReveal>
        </div>

        <div className="mt-14">
          <GoogleReviewsBadge />
        </div>
      </Container>
    </Section>
  );
}
