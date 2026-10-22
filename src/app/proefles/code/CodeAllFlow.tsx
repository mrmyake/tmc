"use client";

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import type { TrialSessionOption } from "@/lib/trial-sessions";
import type { VisitorSlotData } from "@/lib/trial-codes/vrij-trainen-query";
import { withAttribution, type AttributionParams } from "@/lib/attribution/params";
import { CodeInfoBanner } from "../_components/CodeInfoBanner";
import { TrialBookingList } from "../boeken/TrialBookingList";
import { VisitorSlotPicker } from "./VisitorSlotPicker";
import type { CodeSoort } from "./CodeFlow";

/**
 * Stap 2 van de codeflow voor een code met scope all: de bezoeker kiest zelf
 * een groepsles of een uur vrij trainen. Zonder keuze (geen of een onbekende
 * ?soort=) twee gelijkwaardige kaarten, geen stille default (zelfde principe
 * als ProeflesChoice). Na de keuze dezelfde tab-nav als OpeningTrialFlow om
 * te wisselen, en daaronder de hergebruikte sessielijst (mode "code",
 * embedded) of slotkiezer (variant "code", embedded). De keuze staat in de
 * URL, zodat de dagstrip van de slotkiezer hem vasthoudt en de server de
 * juiste data laadt. Alles is weergave; tmc.redeem_trial_code beslist bij het
 * boeken opnieuw, per sessie-pillar.
 */
export function CodeAllFlow({
  code,
  soort,
  options,
  slotData,
  onChangeCode,
  onCodeInvalid,
  attribution = {},
}: {
  code: string;
  soort: CodeSoort | null;
  options: TrialSessionOption[];
  slotData: VisitorSlotData | null;
  onChangeCode: () => void;
  onCodeInvalid: (message: string) => void;
  /** Advertentie- en campagneparameters uit de URL; reizen mee in de kaarten, tabs en de boeking. */
  attribution?: AttributionParams;
}) {
  const hrefLes = withAttribution("/proefles/code?soort=les", attribution);
  const hrefVrij = withAttribution("/proefles/code?soort=vrij", attribution);

  const tabClass = (active: boolean) =>
    `inline-flex items-center justify-center px-6 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 ${
      active
        ? "bg-accent text-bg border-accent"
        : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
    }`;

  const header = (
    <>
      <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
        <span aria-hidden className="w-12 h-px bg-accent" />
        {/* COPY: confirm met Marlon */}
        Gratis · Met proefcode
        <span aria-hidden className="w-12 h-px bg-accent" />
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
        {/* COPY: confirm met Marlon */}
        {soort === null ? "Wat wil je doen?" : soort === "les" ? "Kies je sessie" : "Kies je moment"}
      </h1>
      <CodeInfoBanner code={code} scope="all" onChangeCode={onChangeCode} />
    </>
  );

  if (soort === null) {
    return (
      <Section className="pt-32 md:pt-40 min-h-[80vh]">
        <Container className="max-w-3xl">
          <ScrollReveal>{header}</ScrollReveal>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ScrollReveal delay={0.05}>
              <Link
                href={hrefLes}
                className="group block h-full bg-bg-elevated p-8 md:p-10 relative transition-colors duration-300 hover:bg-bg-elevated/80"
              >
                <div
                  aria-hidden
                  className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                />
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                  {/* COPY: confirm met Marlon */}
                  Uit het rooster
                </span>
                <h2 className="text-2xl font-medium text-text mb-4 tracking-[-0.01em]">
                  {/* COPY: confirm met Marlon */}
                  Groepsles
                </h2>
                <p className="text-text-muted text-sm leading-relaxed mb-6">
                  {/* COPY: confirm met Marlon */}
                  Kies een les uit het rooster: yoga, mobility of kettlebell, in
                  een kleine groep met een trainer.
                </p>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent group-hover:underline">
                  {/* COPY: confirm met Marlon */}
                  Bekijk de lessen
                </span>
              </Link>
            </ScrollReveal>
            <ScrollReveal delay={0.075}>
              <Link
                href={hrefVrij}
                className="group block h-full bg-bg-elevated p-8 md:p-10 relative transition-colors duration-300 hover:bg-bg-elevated/80"
              >
                <div
                  aria-hidden
                  className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                />
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                  {/* COPY: confirm met Marlon */}
                  Op eigen tempo
                </span>
                <h2 className="text-2xl font-medium text-text mb-4 tracking-[-0.01em]">
                  {/* COPY: confirm met Marlon */}
                  Vrij trainen
                </h2>
                <p className="text-text-muted text-sm leading-relaxed mb-6">
                  {/* COPY: confirm met Marlon */}
                  Een vast uur in de studio, op een moment dat Marlon er is. Jij
                  bepaalt wat je doet.
                </p>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent group-hover:underline">
                  {/* COPY: confirm met Marlon */}
                  Kies een uur
                </span>
              </Link>
            </ScrollReveal>
          </div>
        </Container>
      </Section>
    );
  }

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh]">
      <Container className="max-w-3xl">
        <ScrollReveal>
          {header}
          <nav aria-label="Soort proefles" className="flex flex-wrap gap-3 mb-10">
            <Link
              href={hrefLes}
              className={tabClass(soort === "les")}
              aria-current={soort === "les" ? "page" : undefined}
            >
              {/* COPY: confirm met Marlon */}
              Groepsles
            </Link>
            <Link
              href={hrefVrij}
              className={tabClass(soort === "vrij")}
              aria-current={soort === "vrij" ? "page" : undefined}
            >
              {/* COPY: confirm met Marlon */}
              Vrij trainen
            </Link>
          </nav>
        </ScrollReveal>

        {soort === "les" ? (
          <TrialBookingList
            key={`${code}:all:les`}
            options={options}
            mode="code"
            embedded
            codeInfo={{ code, scope: "all", onChangeCode }}
            onCodeInvalid={onCodeInvalid}
            attribution={attribution}
          />
        ) : slotData ? (
          <VisitorSlotPicker
            key={`${code}:all:vrij`}
            data={slotData}
            code={code}
            scope="all"
            embedded
            onChangeCode={onChangeCode}
            onCodeInvalid={onCodeInvalid}
            attribution={attribution}
          />
        ) : null}
      </Container>
    </Section>
  );
}
