"use client";

import { Smartphone, ClipboardList, BellRing, Users } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { EarlyMemberOptInForm } from "./EarlyMemberOptInForm";

const FEATURES = [
  {
    icon: Smartphone,
    // COPY: confirm met Marlon
    title: "Boek in twee tikken",
    text: "Rooster, boeken en annuleren vanaf je telefoon.",
  },
  {
    icon: ClipboardList,
    // COPY: confirm met Marlon
    title: "Jouw trainingsschema",
    text: "Een persoonlijk schema van Marlon dat meegroeit met je voortgang.",
  },
  {
    icon: BellRing,
    // COPY: confirm met Marlon
    title: "Automatische herinneringen",
    text: "Nooit meer een les vergeten, inclusief automatische wachtlijst.",
  },
  {
    icon: Users,
    // COPY: confirm met Marlon
    title: "Neem gratis een vriend mee",
    text: "Elke maand een gastenles, zonder aparte betaling.",
  },
];

export interface PoolAvailability {
  pool: "groepslessen" | "all_access";
  cap: number;
  occupied: number;
  remaining: number;
  closes_at: string;
  is_open: boolean;
}

const POOL_LABELS: Record<PoolAvailability["pool"], string> = {
  groepslessen: "Groepslessen",
  all_access: "All Access",
};

function PoolCounter({ availability }: { availability?: PoolAvailability }) {
  if (!availability) return null;
  const label = POOL_LABELS[availability.pool];

  return (
    <div className="border border-accent/20 bg-bg-elevated px-8 py-8 text-center">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">{label}</span>
      {availability.is_open ? (
        <>
          <p className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-none">
            {availability.remaining}
          </p>
          <p className="text-text-muted text-sm mt-3 uppercase tracking-[0.18em]">
            van {availability.cap} plekken vrij
          </p>
        </>
      ) : (
        <p className="text-text-muted text-sm mt-2 uppercase tracking-[0.18em]">
          Alle plekken zijn vergeven
        </p>
      )}
    </div>
  );
}

interface EarlyMemberContentProps {
  availability: PoolAvailability[] | null;
}

// Copy hieronder is geaccordeerd voor launch. Bewust nergens
// kortingspercentages, nergens "crowdfunding" of "founding member" — de
// lijn is bonus/voorwaarden in plaats van korting.
export function EarlyMemberContent({ availability }: EarlyMemberContentProps) {
  const groepslessen = availability?.find((a) => a.pool === "groepslessen");
  const allAccess = availability?.find((a) => a.pool === "all_access");
  // availability === null (fetch mislukt) laat de knop gewoon naar de
  // signup-flow gaan; reserve_early_member_slot valideert daar sowieso
  // opnieuw atomair. Alleen een expliciet gesloten pool past het label aan.
  const groepslessenOpen = availability ? groepslessen?.is_open === true : true;
  const allAccessOpen = availability ? allAccess?.is_open === true : true;

  return (
    <>
      {/* Page header + tellers */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Early Member"
              heading="Er als eerste bij zijn heeft z'n voordelen"
              subtext="Op 1 augustus opent The Movement Club in Loosdrecht. De eerste 40 leden per membership starten als Early Member — met voorwaarden die daarna niet meer terugkomen."
            />
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <PoolCounter availability={groepslessen} />
              <PoolCounter availability={allAccess} />
            </div>
            {!availability && (
              <p className="text-text-muted text-center text-sm mt-2 uppercase tracking-[0.18em]">
                Maximaal 40 plekken per membership
              </p>
            )}
            <p className="text-text-muted text-center text-sm mt-8">
              Geldig t/m september 2026, of zolang er plekken zijn.
            </p>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Feature grid */}
      <Section>
        <Container>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delay={i * 0.1}>
                  <div className="text-center md:text-left">
                    <Icon className="text-accent mb-4 mx-auto md:mx-0" size={28} strokeWidth={1.5} />
                    <h3 className="font-[family-name:var(--font-playfair)] text-lg md:text-xl text-text mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-text-muted text-sm leading-relaxed">
                      {feature.text}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Wat is Early Member */}
      <Section bg="elevated">
        <Container className="max-w-3xl">
          <ScrollReveal>
            <SectionHeading
              label="Wat het inhoudt"
              heading="Geen korting. Wel betere voorwaarden."
              subtext="Je betaalt als Early Member hetzelfde als ieder ander lid. Het verschil zit in wat je ervoor terugkrijgt — en waar je níet aan vastzit."
            />
          </ScrollReveal>
        </Container>
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* "Geen inschrijfkosten" geldt voor beide pools — zo ook
                geïmplementeerd in startSignup (PR 2). */}
            <ScrollReveal>
              <div className="border border-text-muted/15 bg-bg p-8 md:p-10 h-full flex flex-col">
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  Groepslessen
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-6">
                  Vrijheid als voorwaarde
                </h3>
                <ul className="space-y-4 text-text-muted leading-relaxed mb-8 flex-1">
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Geen inschrijfkosten
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Per vier weken opzegbaar, in plaats van het standaard
                    jaarcommitment
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Train je nu per losse les? Stap over zonder ergens aan vast
                    te zitten
                  </li>
                </ul>
                <Button href="/app/abonnement/nieuw" className="w-full">
                  {groepslessenOpen ? "Reserveer je plek" : "Bekijk het reguliere abonnement"}
                </Button>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <div className="border border-accent/30 bg-bg p-8 md:p-10 h-full flex flex-col">
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  All Access · all inclusive
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-6">
                  Jouw tarief, voor altijd
                </h3>
                <ul className="space-y-4 text-text-muted leading-relaxed mb-8 flex-1">
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    {/* Lock-in-semantiek: vast zolang het lidmaatschap
                        onafgebroken doorloopt (lock_in_active vervalt bij
                        opzegging, zie de expire-on-cancel-trigger). Live
                        gezet als voorgestelde copy; scherpstellen als
                        Marlon een andere lezing wil. */}
                    Je tarief staat vast zolang je lid bent — prijsverhogingen
                    gaan aan jou voorbij
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Geen inschrijfkosten
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Inclusief verlengde toegang: train van 06:00 tot 23:00,
                    zeven dagen per week
                  </li>
                </ul>
                <Button href="/app/abonnement/nieuw" className="w-full">
                  {allAccessOpen ? "Reserveer je plek" : "Bekijk het reguliere abonnement"}
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* 12-weken programma's */}
      <Section>
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Ook zonder membership
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Start je een 12-weken programma?
            </h2>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-lg leading-relaxed mb-12 max-w-2xl mx-auto">
              Vaste prijs per programma, voor iedereen gelijk. Start je
              tijdens de Early Member-periode, dan train je er gratis bij.
            </p>
          </ScrollReveal>
        </Container>
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <ScrollReveal>
              <div className="border border-text-muted/15 bg-bg-elevated p-8 md:p-10 h-full flex flex-col">
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  In de studio
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-2">
                  12 Weken Transformatieprogramma
                </h3>
                <p className="font-[family-name:var(--font-playfair)] text-3xl text-text mb-6">
                  {/* COPY: confirm met Marlon */}
                  €2.400
                </p>
                <ul className="space-y-4 text-text-muted leading-relaxed mb-8 flex-1">
                  {/* COPY: confirm met Marlon */}
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Persoonlijke training, meting en trainingsprotocol
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Voedings-, supplementen- en maagzuuradvies
                  </li>
                  <li className="flex gap-3 border-t border-text-muted/15 pt-4 mt-2">
                    <span className="text-accent">—</span>
                    {/* COPY: confirm met Marlon, bonus mogelijk 1x yoga per
                        week i.p.v. onderstaande */}
                    Bonus tijdens Early Member: gratis 2x vrij trainen + 1x
                    kettlebell per week
                  </li>
                </ul>
                <Button href="/contact" variant="secondary" className="w-full">
                  Vraag het programma aan
                </Button>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <div className="border border-text-muted/15 bg-bg-elevated p-8 md:p-10 h-full flex flex-col">
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  Online
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-2">
                  12 Weken Online Programma
                </h3>
                <p className="font-[family-name:var(--font-playfair)] text-3xl text-text mb-6">
                  {/* COPY: confirm met Marlon */}
                  €1.250
                </p>
                <ul className="space-y-4 text-text-muted leading-relaxed mb-8 flex-1">
                  {/* COPY: confirm met Marlon */}
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Uitgebreide intake en volledig hormonaal profiel
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Trainingsschema op maat, persoonlijk voedings- en
                    supplementenadvies
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Voedingsoptimalisatie d.m.v. maagzuurtest
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Wekelijkse online check-in
                  </li>
                  <li className="flex gap-3 border-t border-text-muted/15 pt-4 mt-2">
                    <span className="text-accent">—</span>
                    Bonus tijdens Early Member: gratis 2x vrij trainen + 1x
                    kettlebell per week
                  </li>
                </ul>
                <Button href="/contact" variant="secondary" className="w-full">
                  Vraag het programma aan
                </Button>
              </div>
            </ScrollReveal>
          </div>
          <p className="text-text-muted text-sm text-center mt-8">
            Deze bonus is niet plek-gelimiteerd en telt niet mee in de 40
            plekken hierboven.
          </p>
          <div className="text-center mt-8">
            <Button href="/aanbod" variant="secondary">
              Bekijk het volledige aanbod
            </Button>
          </div>
        </Container>
      </Section>

      {/* Overstapaanbod, hetzelfde Groepslessen Early Member-aanbod
          (zie de kaart hierboven), voor wie nu al op losse basis traint.
          Copy hier volgt daarom groepslessenOpen: het is dezelfde pool. */}
      <Section bg="elevated">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Voor bestaande klanten
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Train je al mee met Marlon?
            </h2>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-lg leading-relaxed mb-8 max-w-xl mx-auto">
              {groepslessenOpen
                ? "Wie nu op losse basis traint, kan overstappen naar een abonnement zonder inschrijfkosten en zonder het gebruikelijke jaar-commitment: direct maandelijks opzegbaar, tegen hetzelfde instaptarief van €79 per 4 weken."
                : "Wie nu op losse basis traint, kan altijd overstappen naar een regulier abonnement. De Early Member-voorwaarden hierboven zijn niet meer beschikbaar voor Groepslessen."}
            </p>
            <Button href="/app/abonnement/nieuw">
              {groepslessenOpen
                ? "Vraag het overstapaanbod aan"
                : "Bekijk het reguliere abonnement"}
            </Button>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Hoe het werkt */}
      <Section bg="elevated">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Zo werkt het"
              heading="Drie stappen, dan staat je plek vast"
            />
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-4xl mx-auto">
            {[
              {
                step: "01",
                title: "Kies je membership",
                text: "Groepslessen of All Access — elk met een eigen pool van 40 Early Member-plekken.",
              },
              {
                step: "02",
                title: "Reserveer je plek",
                text: "Tijdens je aanmelding staat je plek drie kwartier voor je vast. Rond je 'm af, dan is hij van jou.",
              },
              {
                step: "03",
                title: "Train vanaf de opening",
                text: "Alle voordelen gaan in op 1 augustus 2026, zodra de studio opent.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.step} delay={i * 0.1}>
                <div className="text-center md:text-left">
                  <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                    {item.step}
                  </span>
                  <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-text mb-3">
                    {item.title}
                  </h3>
                  <p className="text-text-muted leading-relaxed">{item.text}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Slot CTA */}
      <Section>
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Eerst kennismaken?
            </span>
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Kom eerst een keer proeven
            </h2>
            <p className="text-text-muted text-lg mb-8 max-w-xl mx-auto">
              Boek een gratis proefles of stel je vraag — Marlon denkt graag met
              je mee welke vorm bij je past.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/proefles">Boek een proefles</Button>
              <Button href="/contact" variant="secondary">
                Stel je vraag
              </Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* E-mail opt-in */}
      <Section bg="elevated">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Nog niet klaar om te starten?
            </span>
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Laat je e-mailadres achter, dan houden we je persoonlijk op de
              hoogte.
            </h2>
            <EarlyMemberOptInForm />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Juridische afsluitregel, alleen op deze pagina. Niet in de
          site-brede Footer, want dat zou de regel op elke pagina tonen. */}
      <Container className="max-w-3xl pb-12">
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-xs text-center leading-relaxed">
          Early Member tarieven gelden t/m september 2026 voor de eerste 40
          leden, daarna gelden de reguliere tarieven. Bij vooruitbetalen
          ineens geldt geen recht op restitutie.
        </p>
      </Container>
    </>
  );
}
