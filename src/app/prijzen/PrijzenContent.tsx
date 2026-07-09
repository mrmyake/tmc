"use client";

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Button } from "@/components/ui/Button";
import { formatPriceEuro } from "@/lib/member/pt-pricing";

// Copy hieronder is een eerste voorstel voor een evergreen prijspagina,
// zonder actietaal of einddatum. Elke klantgerichte string draagt een
// eigen COPY-markering voor Marlon.

// Elk prijsveld is number | null: null betekent dat tmc.catalogue deze rij
// niet had toen de pagina rendere (de fetch als geheel lukte wel, anders
// gooit page.tsx en houdt ISR de laatst goede versie aan). Render dan een
// neutrale lege staat voor precies dat item, nooit een verzonnen bedrag.
export interface PrijzenPricing {
  groepslessen: { twoX: number | null; threeX: number | null; unl: number | null };
  allAccess: { twoX: number | null; threeX: number | null; unl: number | null };
  vrijTrainen: { twoX: number | null; threeX: number | null; unl: number | null };
  extendedAccessCents: number | null;
  signupFeeCents: number | null;
  commit24mDiscountPercent: number | null;
  dropInCents: number | null;
  tenRideCardCents: number | null;
  ptSingleCents: number | null;
  ptCardCents: number | null;
  ptCardCredits: number | null;
  duoSingleCents: number | null;
  duoCardCents: number | null;
  duoCardCredits: number | null;
  // Lead items (purchasable=false in tmc.catalogue): null renders "op
  // aanvraag" instead of a stale fallback price.
  programStudioCents: number | null;
  programOnlineCents: number | null;
  earlyMember: {
    active: boolean;
    allAccessUnlCents: number | null;
    signupFeeWaived: boolean;
  };
}

interface PrijzenContentProps {
  pricing: PrijzenPricing;
}

export function PrijzenContent({ pricing }: PrijzenContentProps) {
  // Enige prijsbron is tmc.catalogue; een ontbrekend veld is null, nooit
  // een verzonnen bedrag. fmt() is de standaard weergave daarvoor overal
  // op deze pagina.
  const fmt = (cents: number | null): string =>
    cents !== null ? formatPriceEuro(cents) : /* COPY: confirm met Marlon */ "Op aanvraag";

  // Live uit tmc.catalogue (server component in page.tsx), niet meer
  // hardcoded. De "+ toevoegen"-rij is
  // het verschil tussen All Access en Groepslessen per kolom, zodat dit
  // automatisch klopt als de onderliggende prijzen ooit niet meer een vlak
  // bedrag uit elkaar liggen. Bij een ontbrekend veld aan een van beide
  // kanten is het verschil ook niet te bepalen: null, niet een half
  // berekend bedrag.
  const diff = (a: number | null, b: number | null): number | null =>
    a !== null && b !== null ? a - b : null;
  const addOnDiffs = {
    twoX: diff(pricing.allAccess.twoX, pricing.groepslessen.twoX),
    threeX: diff(pricing.allAccess.threeX, pricing.groepslessen.threeX),
    unl: diff(pricing.allAccess.unl, pricing.groepslessen.unl),
  };
  const flatAddOn =
    addOnDiffs.twoX !== null &&
    addOnDiffs.twoX === addOnDiffs.threeX &&
    addOnDiffs.threeX === addOnDiffs.unl
      ? addOnDiffs.twoX
      : null;
  // 10-rittenkaart (losse lessen) is echt 10 ritten, blijft delen door 10.
  const tenRidePerSessionCents =
    pricing.tenRideCardCents !== null ? Math.round(pricing.tenRideCardCents / 10) : null;
  // Aantal ritten komt uit de catalogus (ptCardCredits/duoCardCredits),
  // nooit een vast getal: als het aantal ooit weer wijzigt, kloppen deze
  // berekeningen vanzelf mee. Beide kanten moeten aanwezig zijn, anders is
  // de per-sessie-prijs niet te bepalen.
  const ptCardPerSessionCents =
    pricing.ptCardCents !== null && pricing.ptCardCredits !== null
      ? Math.round(pricing.ptCardCents / pricing.ptCardCredits)
      : null;
  const duoCardPerSessionCents =
    pricing.duoCardCents !== null && pricing.duoCardCredits !== null
      ? Math.round(pricing.duoCardCents / pricing.duoCardCredits)
      : null;

  return (
    <>
      {/* Hero. Losse h1 (niet SectionHeading, die rendert altijd h2) om
          de ontbrekende h1 op deze pagina te voorkomen. */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <div className="text-center mb-12 md:mb-16">
              {/* COPY: confirm met Marlon */}
              <span className="text-accent text-xs font-medium uppercase tracking-[0.2em] mb-4 block">
                Prijzen
              </span>
              {/* COPY: confirm met Marlon */}
              <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text mb-4 leading-[1.05] tracking-[-0.02em]">
                Kies wat bij je past
              </h1>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-lg max-w-2xl mx-auto">
                Kleine groepen, persoonlijke aandacht. Van een losse les tot
                onbeperkt trainen, alles op een rij.
              </p>
              <div className="mt-8">
                <Button href="/abonnement">Boek je abonnement</Button>
              </div>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Early Member callout, alleen zichtbaar terwijl de campagnefase
          open is. Alle waarden komen uit de catalogus (pricing.earlyMember,
          server-side samengesteld in page.tsx uit tmc.catalogue +
          getCampaignPhase); bij een gesloten fase verdwijnt dit blok
          vanzelf, zonder codewijziging. */}
      {pricing.earlyMember.active && (
        <Section>
          <Container className="max-w-3xl">
            <ScrollReveal>
              <div className="border border-accent/30 bg-bg-elevated p-8 md:p-10">
                {/* COPY: confirm met Marlon */}
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                  Early Member actie loopt nu
                </span>
                {/* COPY: confirm met Marlon */}
                <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-4">
                  Nu lid worden, blijvend voordeel
                </h2>
                <ul className="text-text-muted text-sm leading-relaxed space-y-2 mb-6">
                  {pricing.earlyMember.signupFeeWaived && (
                    // COPY: confirm met Marlon
                    <li>Geen inschrijfkosten op Groepslessen en All Access.</li>
                  )}
                  {pricing.earlyMember.allAccessUnlCents !== null && (
                    <li>
                      {/* COPY: confirm met Marlon */}
                      All Access Onbeperkt voor{" "}
                      <span className="text-accent font-medium">
                        {formatPriceEuro(pricing.earlyMember.allAccessUnlCents)}
                      </span>{" "}
                      per 4 weken in plaats van{" "}
                      {fmt(pricing.allAccess.unl)}, blijvend
                      vastgezet zolang je lid blijft.
                    </li>
                  )}
                  {/* COPY: confirm met Marlon */}
                  <li>Per 4 weken opzegbaar in plaats van 1 jaar commitment.</li>
                </ul>
                <Button href="/early-member" variant="secondary">
                  Naar de Early Member actie
                </Button>
              </div>
            </ScrollReveal>
          </Container>
        </Section>
      )}

      {/* Lidmaatschappen. id="groepslessen" is het landingspunt vanuit de
          Aanbod-hub in de nav (AANBOD_DROPDOWN); scroll-margin via de
          globale `section[id]`-regel in globals.css. */}
      <Section id="groepslessen" bg="elevated">
        <Container className="max-w-3xl">
          <ScrollReveal>
            <div className="mb-10">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Lidmaatschappen
              </span>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text mb-3">
                Groepslessen, vrij trainen, of allebei
              </h2>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm max-w-lg">
                All Access is Groepslessen met vrij trainen erbij, voor een
                vast bedrag extra op elk niveau.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle" />
                    <th className="text-center font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle">
                      2x / week
                    </th>
                    <th className="text-center font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle">
                      3x / week
                    </th>
                    <th className="text-center font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle">
                      Onbeperkt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-5 border-b border-bg-subtle">
                      {/* COPY: confirm met Marlon */}
                      <span className="font-medium text-text">
                        Groepslessen
                      </span>
                      <span className="block text-text-muted text-xs mt-0.5">
                        yoga, mobility, kettlebell
                      </span>
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-text">
                      {fmt(pricing.groepslessen.twoX)}
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-text">
                      {fmt(pricing.groepslessen.threeX)}
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-text">
                      {fmt(pricing.groepslessen.unl)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 border-b border-bg-subtle">
                      {/* COPY: confirm met Marlon */}
                      <span className="italic text-text-muted text-xs">
                        + Onbeperkt vrij trainen toevoegen
                      </span>
                    </td>
                    <td className="text-center py-4 border-b border-bg-subtle italic text-text-muted text-xs">
                      {addOnDiffs.twoX !== null ? `+${formatPriceEuro(addOnDiffs.twoX)}` : fmt(null)}
                    </td>
                    <td className="text-center py-4 border-b border-bg-subtle italic text-text-muted text-xs">
                      {addOnDiffs.threeX !== null ? `+${formatPriceEuro(addOnDiffs.threeX)}` : fmt(null)}
                    </td>
                    <td className="text-center py-4 border-b border-bg-subtle italic text-text-muted text-xs">
                      {addOnDiffs.unl !== null ? `+${formatPriceEuro(addOnDiffs.unl)}` : fmt(null)}
                    </td>
                  </tr>
                  <tr id="all-access" className="bg-accent/5 scroll-mt-36">
                    <td className="py-5 border-b border-bg-subtle pl-2">
                      {/* COPY: confirm met Marlon */}
                      <span className="font-medium text-accent">
                        = All Access
                      </span>
                      <span className="block text-text-muted text-xs mt-0.5">
                        groepslessen + vrij trainen
                      </span>
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-accent">
                      {fmt(pricing.allAccess.twoX)}
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-accent">
                      {fmt(pricing.allAccess.threeX)}
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-accent">
                      {fmt(pricing.allAccess.unl)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Toelichting op de +€30-toevoeging. Expliciet omdat dit
                eerder een bron van verwarring is gebleken: de toevoeging
                geeft altijd onbeperkt vrij trainen, ongeacht de
                Groepslessen-frequentie. */}
            <div className="border border-accent/20 bg-bg px-5 py-4 mt-6">
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm leading-relaxed">
                {flatAddOn !== null ? (
                  <>
                    De toevoeging geeft altijd onbeperkt vrij trainen,
                    ongeacht of Groepslessen op 2x, 3x of onbeperkt staat.
                    Bij 2x Groepslessen betaal je dus{" "}
                    {formatPriceEuro(flatAddOn)} voor onbeperkt vrij trainen
                    erbij, niet voor 2x vrij trainen.
                  </>
                ) : (
                  <>
                    De toevoeging geeft altijd onbeperkt vrij trainen,
                    ongeacht of Groepslessen op 2x, 3x of onbeperkt staat.
                    De meerprijs verschilt momenteel per kolom, zie de
                    tabel hierboven voor het exacte bedrag per niveau.
                  </>
                )}
              </p>
            </div>

            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-xs mt-6">
              Alle bedragen per 4 weken. Klassengrootte: Yoga &amp;
              Mobility max. 8 personen, Kettlebell geen maximum.
            </p>

            {/* Los Vrij Trainen, zonder Groepslessen */}
            <div
              id="vrij-trainen"
              className="border border-text-muted/15 bg-bg p-6 md:p-7 mt-10 scroll-mt-36"
            >
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow block mb-3">
                Los vrij trainen
              </span>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-text-muted text-xs uppercase tracking-[0.1em] mb-2">
                    2x / week
                  </p>
                  <p className="font-[family-name:var(--font-playfair)] text-lg text-text">
                    {fmt(pricing.vrijTrainen.twoX)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-text-muted text-xs uppercase tracking-[0.1em] mb-2">
                    3x / week
                  </p>
                  <p className="font-[family-name:var(--font-playfair)] text-lg text-text">
                    {fmt(pricing.vrijTrainen.threeX)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-text-muted text-xs uppercase tracking-[0.1em] mb-2">
                    Onbeperkt
                  </p>
                  <p className="font-[family-name:var(--font-playfair)] text-lg text-text">
                    {fmt(pricing.vrijTrainen.unl)}
                  </p>
                </div>
              </div>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-xs leading-relaxed">
                {flatAddOn !== null ? (
                  <>
                    Dit is een ander tarief dan de{" "}
                    {formatPriceEuro(flatAddOn)}-toevoeging hierboven. Die
                    toevoeging is een meerprijs voor wie al Groepslessen
                    heeft; dit is de prijs voor wie alleen vrij wil trainen.
                  </>
                ) : (
                  <>
                    Dit is een ander tarief dan de toevoeging hierboven. Die
                    toevoeging is een meerprijs voor wie al Groepslessen
                    heeft; dit is de prijs voor wie alleen vrij wil trainen.
                  </>
                )}
              </p>
            </div>

            {/* Verlengde toegang. Prijs uit de catalogus (addon-rij
                extended_access); de inbegrepen-vs-betaald-regel staat al
                hierboven per kolom (All Access Onbeperkt heeft het gratis
                inbegrepen, op elke andere kolom is het deze meerprijs). */}
            <div className="border border-text-muted/15 bg-bg px-5 py-4 mt-6">
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm leading-relaxed">
                <span className="text-text font-medium">
                  Verlengde toegang (06:00-23:00)
                </span>{" "}
                is {fmt(pricing.extendedAccessCents)} per 4 weken
                extra op All Access 2x/3x en op Vrij Trainen, en gratis
                inbegrepen bij All Access Onbeperkt. Niet beschikbaar op
                Groepslessen-only.
              </p>
            </div>

            <div className="mt-8">
              <Button href="/abonnement">Kies je abonnement</Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Personal training */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <div className="mb-10">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Personal training
              </span>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                1-op-1 of duo
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle" />
                    <th className="text-center font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle">
                      Losse sessie
                    </th>
                    {/* COPY: confirm met Marlon */}
                    <th className="text-center font-medium text-xs uppercase tracking-[0.1em] text-text-muted pb-4 border-b border-bg-subtle">
                      {pricing.ptCardCredits !== null
                        ? `${pricing.ptCardCredits}-rittenkaart`
                        : /* COPY: confirm met Marlon */ "Rittenkaart"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-5 border-b border-bg-subtle font-medium text-text">
                      1-op-1
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-text">
                      {fmt(pricing.ptSingleCents)}
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle">
                      <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
                        {fmt(pricing.ptCardCents)}
                      </span>
                      {ptCardPerSessionCents !== null && (
                        <span className="block text-text-muted text-xs mt-0.5">
                          {formatPriceEuro(ptCardPerSessionCents)}/sessie
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-5 border-b border-bg-subtle font-medium text-text">
                      {/* COPY: confirm met Marlon */}
                      Duo (totaal)
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle font-[family-name:var(--font-playfair)] text-lg text-text">
                      {fmt(pricing.duoSingleCents)}
                    </td>
                    <td className="text-center py-5 border-b border-bg-subtle">
                      <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
                        {fmt(pricing.duoCardCents)}
                      </span>
                      {duoCardPerSessionCents !== null && (
                        <span className="block text-text-muted text-xs mt-0.5">
                          {formatPriceEuro(duoCardPerSessionCents)}/sessie
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-8">
              <Button href="/abonnement">Boek personal training</Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Programma's */}
      <Section bg="elevated">
        <Container className="max-w-3xl">
          <ScrollReveal>
            <div className="mb-10">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Programma&apos;s
              </span>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                Gerichte begeleiding in 12 weken
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ScrollReveal>
              <div className="border border-text-muted/15 bg-bg p-6 md:p-7 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                <h3 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
                  12 weken transformatie
                </h3>
                <p className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
                  {pricing.programStudioCents !== null
                    ? formatPriceEuro(pricing.programStudioCents)
                    : /* COPY: confirm met Marlon */ "Op aanvraag"}
                </p>
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm leading-relaxed mb-6">
                  Persoonlijke training, meting en trainingsprotocol, plus
                  voedings-, supplementen- en maagzuuradvies.
                </p>
                <div className="mt-auto">
                  <Button href="/12-weken-programma/intake" variant="secondary">
                    Plan je intake
                  </Button>
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <div className="border border-text-muted/15 bg-bg p-6 md:p-7 h-full flex flex-col">
                {/* COPY: confirm met Marlon */}
                <h3 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
                  12 weken online
                </h3>
                <p className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
                  {pricing.programOnlineCents !== null
                    ? formatPriceEuro(pricing.programOnlineCents)
                    : /* COPY: confirm met Marlon */ "Op aanvraag"}
                </p>
                {/* COPY: confirm met Marlon */}
                <p className="text-text-muted text-sm leading-relaxed mb-6">
                  Hormonaal profiel, trainingsschema op maat, voedings- en
                  supplementenadvies, wekelijkse check-in.
                </p>
                <div className="mt-auto">
                  <Button href="/12-weken-programma/intake" variant="secondary">
                    Plan je intake
                  </Button>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </Section>

      {/* Losse bezoeken */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <div className="mb-10">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Losse bezoeken
              </span>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                Nog geen abonnement? Kom eerst kijken
              </h2>
            </div>
            <ul className="divide-y divide-bg-subtle border-t border-b border-bg-subtle">
              <li className="flex items-center justify-between py-4">
                {/* COPY: confirm met Marlon */}
                <span className="text-text">Losse les (drop-in)</span>
                <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
                  {fmt(pricing.dropInCents)}
                </span>
              </li>
              <li className="flex items-center justify-between py-4">
                {/* COPY: confirm met Marlon */}
                <span className="text-text">
                  10-rittenkaart
                  <span className="block text-text-muted text-xs mt-0.5">
                    4 maanden geldig
                  </span>
                </span>
                <span className="text-right">
                  <span className="font-[family-name:var(--font-playfair)] text-lg text-text">
                    {fmt(pricing.tenRideCardCents)}
                  </span>
                  {tenRidePerSessionCents !== null && (
                    <span className="block text-text-muted text-xs mt-0.5">
                      {formatPriceEuro(tenRidePerSessionCents)} per les
                    </span>
                  )}
                </span>
              </li>
            </ul>
            <div className="mt-8">
              <Button href="/abonnement">Koop een rittenkaart</Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Commitment en voorwaarden */}
      <Section bg="elevated">
        <Container className="max-w-3xl">
          <ScrollReveal>
            <div className="mb-10">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Goed om te weten
              </span>
              {/* COPY: confirm met Marlon */}
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text">
                Commitment en voorwaarden
              </h2>
            </div>
            <ul className="divide-y divide-bg-subtle border-t border-b border-bg-subtle">
              <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 py-4">
                {/* COPY: confirm met Marlon */}
                <span className="text-text-muted text-sm">
                  Standaard commitment
                </span>
                <span className="text-text text-sm font-medium sm:text-right sm:max-w-[60%]">
                  1 jaar, daarna maandelijks (per 4 weken) opzegbaar
                </span>
              </li>
              {pricing.commit24mDiscountPercent !== null && (
                <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 py-4">
                  {/* COPY: confirm met Marlon */}
                  <span className="text-text-muted text-sm">
                    24 maanden commitment
                  </span>
                  {/* COPY: confirm met Marlon */}
                  <span className="text-text text-sm font-medium sm:text-right sm:max-w-[60%]">
                    {pricing.commit24mDiscountPercent}% korting op de
                    abonnementsprijs
                  </span>
                </li>
              )}
              <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 py-4">
                {/* COPY: confirm met Marlon */}
                <span className="text-text-muted text-sm">
                  Inschrijfkosten
                </span>
                <span className="text-text text-sm font-medium sm:text-right sm:max-w-[60%]">
                  {fmt(pricing.signupFeeCents)} eenmalig bij
                  nieuwe inschrijving
                </span>
              </li>
            </ul>
          </ScrollReveal>
        </Container>
      </Section>

      {/* Crosslink naar Early Member */}
      <Section>
        <Container className="max-w-3xl">
          <ScrollReveal>
            <div className="border border-accent/30 bg-bg-elevated p-8 md:p-10 text-center">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Nieuw hier?
              </span>
              {/* COPY: confirm met Marlon */}
              <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-text mb-3">
                Bekijk de Early Member actie
              </h3>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm mb-6 max-w-md mx-auto">
                Als een van de eerste leden krijg je voorwaarden die na
                deze periode niet meer terugkomen.
              </p>
              <Button href="/early-member">
                Naar de Early Member actie
              </Button>
            </div>
          </ScrollReveal>
        </Container>
      </Section>
    </>
  );
}
