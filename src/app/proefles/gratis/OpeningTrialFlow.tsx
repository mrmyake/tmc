"use client";

import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { formatDateLong } from "@/lib/format-date";
import type { TrialSessionOption } from "@/lib/trial-sessions";
import type { VisitorSlotData } from "@/lib/trial-codes/vrij-trainen-query";
import { TrialBookingList } from "../boeken/TrialBookingList";
import { VisitorSlotPicker } from "../code/VisitorSlotPicker";

/**
 * De gratis openingsflow: kop, keuze tussen groepsles en vrij trainen (links,
 * zodat de dagstrip van de slotkiezer de keuze in de URL houdt), en daaronder
 * de hergebruikte sessielijst (mode "free") of slotkiezer (variant "opening").
 */
export function OpeningTrialFlow({
  soort,
  options,
  slotData,
  periodEndAt,
}: {
  soort: "les" | "vrij";
  options: TrialSessionOption[];
  slotData: VisitorSlotData | null;
  /** Einde van de gratis periode (ISO), voor de regel onder de kop. */
  periodEndAt: string | null;
}) {
  const tabClass = (active: boolean) =>
    `inline-flex items-center justify-center px-6 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 ${
      active
        ? "bg-accent text-bg border-accent"
        : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
    }`;

  return (
    <Section className="pt-32 md:pt-40 min-h-[80vh]">
      <Container className="max-w-3xl">
        <ScrollReveal>
          <span className="inline-flex items-center gap-4 text-accent text-[11px] font-medium uppercase tracking-[0.3em] mb-8">
            <span aria-hidden className="w-12 h-px bg-accent" />
            {/* COPY: confirm met Marlon */}
            Gratis · Openingsperiode
            <span aria-hidden className="w-12 h-px bg-accent" />
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
            {/* COPY: confirm met Marlon */}
            Je gratis proefles
          </h1>
          <p className="text-text-muted text-base leading-relaxed mb-8 max-w-2xl">
            {/* COPY: confirm met Marlon */}
            We zijn net open en trakteren: kies een groepsles uit het rooster of
            een uur vrij trainen terwijl Marlon er is. Gratis, zonder
            verplichtingen, een proefles per persoon
            {periodEndAt ? ` tot en met ${formatDateLong(new Date(periodEndAt))}` : ""}.
          </p>

          <nav aria-label="Soort proefles" className="flex flex-wrap gap-3 mb-10">
            <Link href="/proefles/gratis" className={tabClass(soort === "les")} aria-current={soort === "les" ? "page" : undefined}>
              {/* COPY: confirm met Marlon */}
              Groepsles
            </Link>
            <Link
              href="/proefles/gratis?soort=vrij"
              className={tabClass(soort === "vrij")}
              aria-current={soort === "vrij" ? "page" : undefined}
            >
              {/* COPY: confirm met Marlon */}
              Vrij trainen
            </Link>
          </nav>
        </ScrollReveal>

        {soort === "les" ? (
          <TrialBookingList key="free" options={options} mode="free" embedded />
        ) : slotData ? (
          <VisitorSlotPicker key="opening" data={slotData} variant="opening" />
        ) : null}

        <p className="mt-14 text-text-muted text-xs leading-relaxed max-w-2xl">
          {/* COPY: confirm met Marlon */}
          Al lid of eerder bij ons geweest? Dan is de gratis proefles niet voor jou
          bedoeld; log in om te boeken of neem contact met ons op. Kun je toch
          niet komen? Annuleren kan via de link in je bevestigingsmail. Niet
          komen zonder te annuleren telt als je gebruikte gratis proefles.
        </p>
      </Container>
    </Section>
  );
}
