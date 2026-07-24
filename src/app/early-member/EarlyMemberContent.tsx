"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { Countdown } from "@/components/ui/Countdown";
import { EarlyMemberCallout } from "@/components/ui/EarlyMemberCallout";
import { formatDateLong } from "@/lib/format-date";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import type { CampaignPhase } from "@/lib/campaign";
import { EarlyMemberOptInForm } from "./EarlyMemberOptInForm";
import { OverstapLeadForm } from "./OverstapLeadForm";

export interface EarlyMemberPricing {
  groepslessen: { twoX: number; threeX: number; unl: number };
  allAccessTwoXCents: number;
  allAccessThreeXCents: number;
  allAccessUnlCents: number;
  allAccessUnlEarlyMemberCents: number;
  signupFeeCents: number;
  // Lead items (purchasable=false in tmc.catalogue): null renders "op
  // aanvraag" instead of a stale fallback price.
  programStudioCents: number | null;
  programOnlineCents: number | null;
}

interface EarlyMemberContentProps {
  /** ISO deadline (closesAtIso), uit getCampaignWindow() (src/lib/campaign.ts). */
  deadline: string;
  pricing: EarlyMemberPricing;
  /** Eén fasebron (src/lib/campaign.ts), zelfde als de root layout en /prijzen. */
  campaignPhase: CampaignPhase;
}

// Copy hieronder volgt de zes-secties rebuild (zie PR-beschrijving). Bewust
// nergens plek-tellingen, reservering/hold-taal of "1 augustus" meer — de
// enige schaarste is de deadline-countdown, en de opening heet "medio
// augustus" tot de echte datum vaststaat.
export function EarlyMemberContent({
  deadline,
  pricing,
  campaignPhase,
}: EarlyMemberContentProps) {
  const deadlineLabel = formatDateLong(new Date(deadline));
  // hasOpened bepaalt alleen de hero-framing (voor/na de studio-opening);
  // emActive bepaalt of de Early Member voordelen getoond worden (voor/na
  // de campagnedeadline). Beide komen uit dezelfde getCampaignPhase()-fase,
  // dus er is nog maar één datumbron voor de hele pagina.
  const hasOpened = campaignPhase !== "pre-open";
  const emActive = campaignPhase === "open-em";

  // Live uit tmc.catalogue.early_member_price_cents (met coalesce naar de
  // reguliere prijs), zelfde kolom en dezelfde fallback als de RPC die de
  // daadwerkelijke checkout draait (tmc._compute_order_price /
  // create_order). Alleen getoond terwijl emActive; buiten de campagnefase
  // is dit bedrag niet van toepassing.
  const allAccessEarlyMemberCents = pricing.allAccessUnlEarlyMemberCents;

  // Meerprijs om vrij trainen aan Groepslessen toe te voegen (= het verschil
  // tussen All Access en Groepslessen op de Onbeperkt-kolom). Live afgeleid
  // i.p.v. hardcoded, zodat dit bedrag nooit los kan raken van de catalogus
  // als de tarieven ooit wijzigen. Zie /prijzen (PrijzenContent.tsx) voor
  // dezelfde berekening met een volledige gelijkheidscheck over alle kolommen.
  const vrijTrainenAddOnCents = Math.max(
    0,
    pricing.allAccessUnlCents - pricing.groepslessen.unl
  );

  return (
    <>
      {/* 1. Hero (donker) */}
      <Section className="pt-32 pb-20 md:pt-40 md:pb-28">
        <Container>
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center">
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
                Early Member
              </span>
              {/* COPY: confirm met Marlon */}
              <h1 className="font-[family-name:var(--font-playfair)] font-normal text-text text-[2.5rem] leading-[1.1] tracking-[-0.01em] md:text-6xl lg:text-7xl">
                De voorwaarden waarmee we{" "}
                <em className="not-italic text-accent font-normal">
                  nooit meer
                </em>{" "}
                openen.
              </h1>
              {hasOpened ? (
                // COPY: confirm met Marlon
                <p className="text-text-muted text-lg mt-7 max-w-2xl mx-auto leading-relaxed">
                  The Movement Club is open in Loosdrecht. Wie nu instapt,
                  traint zonder inschrijfkosten, zonder jaarcontract en met
                  een All Access-tarief dat daarna verdwijnt.
                </p>
              ) : (
                // COPY: confirm met Marlon
                <p className="text-text-muted text-lg mt-7 max-w-2xl mx-auto leading-relaxed">
                  Medio augustus opent The Movement Club in Loosdrecht. Wie nu
                  instapt, traint zonder inschrijfkosten, zonder
                  jaarcontract en met een All Access-tarief dat daarna
                  verdwijnt.
                </p>
              )}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.15}>
            <div className="max-w-2xl mx-auto mt-12 md:mt-16">
              <Countdown deadline={deadline} />
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-center text-sm mt-6">
                Early Member is beschikbaar tot{" "}
                <strong className="text-text font-medium">
                  {deadlineLabel}
                </strong>
                . Daarna gelden de reguliere voorwaarden.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.25}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
              <Button href="#aanbod">Word Early Member</Button>
              <Button href="#programmas" variant="secondary">
                Bekijk de programma&apos;s
              </Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* 2. Aanbod (licht) */}
      <Section bg="stone" id="aanbod">
        <Container>
          <ScrollReveal>
            <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                Het aanbod
              </span>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-on-light text-3xl md:text-4xl lg:text-5xl mb-4 leading-[1.05] tracking-[-0.02em]">
                Twee lidmaatschappen. Eén moment.
              </h2>
              {/* COPY: confirm met Marlon */}
              <p className="text-on-light-muted text-lg">
                {emActive ? (
                  <>
                    Alle prijzen per 4 weken. Als Early Member vervalt het
                    inschrijfgeld van {formatPriceEuro(pricing.signupFeeCents)}{" "}
                    en ben je vanaf dag één maandelijks opzegbaar.
                  </>
                ) : (
                  "Alle prijzen per 4 weken."
                )}
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* All Access — dark feature card op de lichte sectie, zelfde
                patroon als TwaalfWekenProgrammaContent.tsx's Studio-kaart. */}
            <ScrollReveal>
              <div className="bg-bg text-text p-8 md:p-10 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                {emActive && (
                  <span className="text-accent text-xs font-semibold uppercase tracking-[0.16em]">
                    Early Member voordeel
                  </span>
                )}
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl mt-3.5 mb-4">
                  All Access
                </h3>
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm mb-6">
                  Alle groepslessen plus onbeperkt vrij trainen, ongeacht je
                  lesfrequentie.
                </p>
                <div className="mb-6">
                  {emActive ? (
                    <>
                      <span className="text-text-muted text-lg line-through mr-2">
                        {formatPriceEuro(pricing.allAccessUnlCents)}
                      </span>
                      <span className="font-[family-name:var(--font-playfair)] text-3xl text-accent">
                        {formatPriceEuro(allAccessEarlyMemberCents)}
                      </span>
                      {/* COPY: confirm met Marlon */}
                      <span className="block text-text-muted text-xs mt-1">
                        per 4 weken, onbeperkt, blijvend tarief
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-[family-name:var(--font-playfair)] text-3xl text-text">
                        {formatPriceEuro(pricing.allAccessUnlCents)}
                      </span>
                      {/* COPY: confirm met Marlon */}
                      <span className="block text-text-muted text-xs mt-1">
                        per 4 weken, onbeperkt
                      </span>
                    </>
                  )}
                </div>
                <ul className="divide-y divide-bg-subtle border-y border-bg-subtle mb-6 text-sm">
                  <li className="flex items-center justify-between py-3">
                    <span className="text-text-muted">2x per week</span>
                    <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
                      {formatPriceEuro(pricing.allAccessTwoXCents)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-3">
                    <span className="text-text-muted">3x per week</span>
                    <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
                      {formatPriceEuro(pricing.allAccessThreeXCents)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-3">
                    <span className="text-text-muted">
                      Onbeperkt
                      {emActive && (
                        <span className="text-accent text-[10px] uppercase tracking-[var(--track-label)] ml-1">
                          Early Member
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-[family-name:var(--font-playfair)] text-lg ${emActive ? "text-accent" : "text-text"}`}
                    >
                      {formatPriceEuro(
                        emActive ? allAccessEarlyMemberCents : pricing.allAccessUnlCents,
                      )}
                    </span>
                  </li>
                </ul>
                <ul className="space-y-3 text-text-muted leading-relaxed mb-8 flex-1 text-sm">
                  {/* COPY: confirm met Marlon */}
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Yoga, mobility en kettlebell
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Altijd onbeperkt vrij trainen inbegrepen
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    {emActive
                      ? "Geen inschrijfkosten, direct maandelijks opzegbaar"
                      : "1 jaar commitment, daarna maandelijks opzegbaar"}
                  </li>
                </ul>
                <Button href="/abonnement" className="w-full">
                  {emActive ? "Word Early Member" : "Boek je abonnement"}
                </Button>
              </div>
            </ScrollReveal>

            {/* Groepslessen — plain light kaart */}
            <ScrollReveal delay={0.1}>
              <div className="bg-surface-light text-on-light border border-border-on-light p-8 md:p-10 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                {emActive && (
                  <span className="text-accent text-xs font-semibold uppercase tracking-[0.16em]">
                    Early Member voordeel
                  </span>
                )}
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl mt-3.5 mb-4">
                  Groepslessen
                </h3>
                {/* COPY: confirm met Marlon */}
                <p className="text-on-light-muted text-sm mb-6">
                  Yoga, mobility en kettlebell in kleine groepen, onder
                  begeleiding van Marlon.
                </p>
                <ul className="divide-y divide-border-on-light border-y border-border-on-light mb-6 text-sm">
                  <li className="flex items-center justify-between py-3">
                    <span className="text-on-light-muted">2x per week</span>
                    <span className="font-[family-name:var(--font-playfair)] text-lg text-on-light">
                      {formatPriceEuro(pricing.groepslessen.twoX)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-3">
                    <span className="text-on-light-muted">3x per week</span>
                    <span className="font-[family-name:var(--font-playfair)] text-lg text-on-light">
                      {formatPriceEuro(pricing.groepslessen.threeX)}
                    </span>
                  </li>
                  <li className="flex items-center justify-between py-3">
                    <span className="text-on-light-muted">Onbeperkt</span>
                    <span className="font-[family-name:var(--font-playfair)] text-lg text-on-light">
                      {formatPriceEuro(pricing.groepslessen.unl)}
                    </span>
                  </li>
                </ul>
                <ul className="space-y-3 text-on-light-muted leading-relaxed mb-8 flex-1 text-sm">
                  {/* COPY: confirm met Marlon */}
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    {emActive ? (
                      <>Geen inschrijfkosten ({formatPriceEuro(pricing.signupFeeCents)})</>
                    ) : (
                      <>Inschrijfkosten: {formatPriceEuro(pricing.signupFeeCents)} eenmalig</>
                    )}
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    {emActive
                      ? "Direct maandelijks opzegbaar, geen jaarcontract"
                      : "1 jaar commitment, daarna maandelijks opzegbaar"}
                  </li>
                  <li className="flex gap-3">
                    <span className="text-accent">—</span>
                    Vrij trainen toevoegen kan altijd, voor{" "}
                    {formatPriceEuro(vrijTrainenAddOnCents)} per 4 weken
                  </li>
                </ul>
                <Button href="/abonnement" variant="secondary-light" className="w-full">
                  {emActive ? "Word Early Member" : "Boek je abonnement"}
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* 3. Waarom nu (donker). Alleen zichtbaar terwijl emActive: deze hele
          sectie is de voor/na-vergelijking met de Early Member-voorwaarden,
          die na de campagnedeadline niet meer van toepassing is. Verdwijnt
          vanzelf zodra de fase omslaat, zonder codewijziging. */}
      {emActive && (
        <Section>
          <Container className="max-w-3xl">
            <ScrollReveal>
              <div className="mb-12 md:mb-14">
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  Waarom nu
                </span>
                {/* COPY: confirm met Marlon */}
                <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text leading-[1.05] tracking-[-0.02em]">
                  Dit aanbod komt niet terug.
                </h2>
              </div>
              <div className="divide-y divide-bg-subtle border-y border-bg-subtle">
                {/* COPY: confirm met Marlon */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-5">
                  <span className="text-text-muted">
                    {formatPriceEuro(pricing.signupFeeCents)} inschrijfkosten
                  </span>
                  <span aria-hidden className="text-accent hidden sm:inline">
                    →
                  </span>
                  <span className="text-text font-medium">
                    Geen inschrijfkosten
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-5">
                  <span className="text-text-muted">
                    Eerste jaar vast, daarna per 4 weken opzegbaar
                  </span>
                  <span aria-hidden className="text-accent hidden sm:inline">
                    →
                  </span>
                  <span className="text-text font-medium">
                    Vanaf dag één maandelijks opzegbaar
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-5">
                  <span className="text-text-muted">
                    All Access onbeperkt {formatPriceEuro(pricing.allAccessUnlCents)}{" "}
                    per 4 weken
                  </span>
                  <span aria-hidden className="text-accent hidden sm:inline">
                    →
                  </span>
                  <span className="text-text font-medium">
                    {formatPriceEuro(allAccessEarlyMemberCents)} per 4 weken,
                    blijvend
                  </span>
                </div>
              </div>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted leading-relaxed mt-10 max-w-2xl">
                Na de Early Member-periode gelden voor iedereen de reguliere
                voorwaarden. Wie nu instapt, houdt deze voorwaarden zolang het
                lidmaatschap doorloopt.
              </p>
            </ScrollReveal>
          </Container>
        </Section>
      )}

      {/* 4. Programma's (licht) */}
      <Section bg="stone" id="programmas">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Liever een traject
            </span>
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-on-light text-3xl md:text-4xl lg:text-5xl mb-4 leading-[1.05] tracking-[-0.02em]">
              De 12-weken programma&apos;s
            </h2>
            {/* COPY: confirm met Marlon */}
            <p className="text-on-light-muted text-lg max-w-2xl mx-auto mb-14 md:mb-16">
              Ook zonder lidmaatschap te volgen. De prijs is voor iedereen
              gelijk; Early Members krijgen er tijdens het programma extra
              training bij.
            </p>
          </ScrollReveal>
        </Container>
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <ScrollReveal>
              <div className="bg-surface-light text-on-light border border-border-on-light p-8 md:p-10 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                <span className="text-accent text-xs font-semibold uppercase tracking-[0.16em]">
                  In de studio
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl mt-3.5 mb-2">
                  12 weken met Marlon
                </h3>
                <p className="font-[family-name:var(--font-playfair)] text-3xl mb-4">
                  {pricing.programStudioCents !== null ? (
                    <>
                      {formatPriceEuro(pricing.programStudioCents)}{" "}
                      <span className="font-sans text-base text-on-light-muted align-top">
                        eenmalig
                      </span>
                    </>
                  ) : (
                    /* COPY: confirm met Marlon */ "Op aanvraag"
                  )}
                </p>
                {/* COPY: confirm met Marlon */}
                <p className="text-on-light-muted text-sm leading-relaxed mb-6">
                  Uitgebreide intake, 2x personal training per week met
                  Marlon, voedings- en supplementenadvies en dagelijkse
                  leefstijlbegeleiding.
                </p>
                {emActive && (
                  <EarlyMemberCallout label="Early Member bonus" className="mb-8">
                    {/* COPY: confirm met Marlon */}
                    <span className="text-on-light text-[15px] font-medium leading-snug">
                      Onbeperkt groepslessen tijdens het hele programma
                    </span>
                  </EarlyMemberCallout>
                )}
                <Button
                  href="/12-weken-programma"
                  variant="secondary-light"
                  className="w-full mt-auto"
                >
                  Meer over dit programma
                </Button>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <div className="bg-surface-light text-on-light border border-border-on-light p-8 md:p-10 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                <span className="text-accent text-xs font-semibold uppercase tracking-[0.16em]">
                  Online
                </span>
                <h3 className="font-[family-name:var(--font-playfair)] text-2xl mt-3.5 mb-2">
                  12 weken online coaching
                </h3>
                <p className="font-[family-name:var(--font-playfair)] text-3xl mb-4">
                  {pricing.programOnlineCents !== null ? (
                    <>
                      {formatPriceEuro(pricing.programOnlineCents)}{" "}
                      <span className="font-sans text-base text-on-light-muted align-top">
                        eenmalig
                      </span>
                    </>
                  ) : (
                    /* COPY: confirm met Marlon */ "Op aanvraag"
                  )}
                </p>
                {/* COPY: confirm met Marlon */}
                <p className="text-on-light-muted text-sm leading-relaxed mb-6">
                  Volledig begeleid trainings- en voedingstraject op
                  afstand, met wekelijkse check-ins.
                </p>
                {emActive && (
                  <EarlyMemberCallout label="Early Member bonus" className="mb-8">
                    {/* COPY: confirm met Marlon */}
                    <span className="text-on-light text-[15px] font-medium leading-snug">
                      2x per week vrij trainen en 1x per week kettlebell,
                      tijdens het programma
                    </span>
                  </EarlyMemberCallout>
                )}
                <Button
                  href="/12-weken-programma"
                  variant="secondary-light"
                  className="w-full mt-auto"
                >
                  Meer over dit programma
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* 5. Overstap + proefles (donker) */}
      <Section>
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Nog niet zeker
            </span>
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl lg:text-5xl text-text mb-4 leading-[1.05] tracking-[-0.02em]">
              Twee andere manieren om in te stappen.
            </h2>
          </ScrollReveal>
        </Container>
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-12">
            <ScrollReveal>
              <div className="border border-text-muted/15 bg-bg-elevated p-8 md:p-10 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-text mb-4">
                  Je traint nu ergens anders
                </h3>
                <p className="text-text-muted leading-relaxed mb-8 flex-1">
                  Stap over en betaal geen inschrijfkosten. We denken mee
                  over de overgang vanaf je huidige abonnement, zodat je
                  nergens dubbel voor betaalt.
                </p>
                <OverstapLeadForm />
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <div className="border border-text-muted/15 bg-bg-elevated p-8 md:p-10 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-text mb-4">
                  Eerst een keer meedoen
                </h3>
                <p className="text-text-muted leading-relaxed mb-8 flex-1">
                  Boek een proefles en ervaar hoe we trainen. Daarna beslis
                  je pas; het Early Member-voordeel blijft tot de einddatum
                  beschikbaar.
                </p>
                <Button href="/proefles" variant="secondary" className="w-full">
                  Boek een proefles
                </Button>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* 6. E-mail capture. Bewust bg="elevated" (donker) i.p.v. de lichte
          sectie uit de mockup: EarlyMemberOptInForm hergebruikt Field /
          fieldInputClasses, die tekstkleuren voor een donkere achtergrond
          hardcoden (text-text = bijna-wit). Op een lichte "stone"-sectie
          zou het invoerveld en label vrijwel onleesbaar worden zonder het
          formulier zelf te herbouwen — buiten scope van deze rebuild. */}
      <Section bg="elevated">
        <Container className="max-w-3xl text-center">
          <ScrollReveal>
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
              Nog even nadenken
            </span>
            {/* COPY: confirm met Marlon */}
            <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-6 leading-[1.05] tracking-[-0.02em]">
              Blijf op de hoogte
            </h2>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-lg mb-10 max-w-xl mx-auto">
              Laat je e-mailadres achter en ontvang alle informatie over
              Early Member, de opening en het rooster.
            </p>
            <EarlyMemberOptInForm />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Juridische afsluitregel, alleen op deze pagina. Niet in de
          site-brede Footer, want dat zou de regel op elke pagina tonen. */}
      <Container className="max-w-3xl pb-12">
        {/* COPY: confirm met Marlon. Slot-taal ("voor de eerste 40 leden")
            vervangen door de live deadline, geen plek-telling meer. */}
        <p className="text-text-muted text-xs text-center leading-relaxed">
          Early Member tarieven gelden tot {deadlineLabel}, daarna gelden de
          reguliere tarieven.
        </p>
      </Container>
    </>
  );
}
