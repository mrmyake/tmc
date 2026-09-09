"use client";

/**
 * // COPY: confirm met Marlon — dit is een CONCEPT van de voorwaarden
 * onbegeleide toegang. Nog niet juridisch getoetst.
 *
 * OPEN: de verzekeraar moet nog bevestigen dat de AVB onbegeleide toegang
 * dekt (I-08 in docs/spec-functional-design.md). Niet activeren voordat die
 * bevestiging er is.
 *
 * Dit document hoort apart geaccepteerd te worden bij het activeren van
 * extended access, niet meeliften op het akkoord voor de algemene
 * voorwaarden — dat acceptatiemechanisme is een volgende PR.
 *
 * Bron: legal-source/voorwaarden-onbegeleide-toegang.md (niet gecommit, zie
 * .gitignore). Alle placeholders tussen vierkante haken zijn bewust niet
 * ingevuld — zie de PLACEHOLDER-comments hieronder. Eerst met Marlon
 * langslopen.
 */

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";
import { LEGAL_DOCUMENT_VERSIONS } from "@/lib/legal/versions";

const VERSION = LEGAL_DOCUMENT_VERSIONS.onbegeleide_toegang;

interface PolicySectionProps {
  eyebrow: string;
  heading: string;
  children: React.ReactNode;
}

function PolicySection({ eyebrow, heading, children }: PolicySectionProps) {
  return (
    <ScrollReveal className="max-w-3xl">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {eyebrow}
      </span>
      <h2 className="text-2xl md:text-3xl font-medium text-text mb-6 tracking-[-0.01em] leading-[1.15]">
        {heading}
      </h2>
      <div className="space-y-4 text-text-muted text-base leading-relaxed">
        {children}
      </div>
    </ScrollReveal>
  );
}

export function OnbegeleideToegangContent() {
  return (
    <>
      {/* Header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Onbegeleide toegang"
              heading="Voorwaarden onbegeleide toegang"
              subtext="Met onbegeleide toegang kun je in de studio trainen op momenten dat er geen trainer aanwezig is. Je krijgt daarvoor een persoonlijke toegangscode. Dat is een stuk vrijheid, en daar horen een paar duidelijke afspraken bij."
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Body */}
      <Section bg="elevated">
        <Container>
          <div className="space-y-20">
            <ScrollReveal className="max-w-3xl">
              <p className="text-text-muted text-base leading-relaxed">
                Deze voorwaarden gelden naast de{" "}
                <QuietLink href="/voorwaarden">
                  algemene voorwaarden
                </QuietLink>{" "}
                en de huisregels.
              </p>
            </ScrollReveal>

            <PolicySection
              eyebrow="01 · Wie het kan krijgen"
              heading="Wie het kan krijgen"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>Je bent 18 jaar of ouder.</li>
                <li>Je hebt een abonnement waar vrij trainen bij zit.</li>
                <li>Je hebt je gezondheidsintake ingevuld.</li>
                <li>
                  Je hebt een korte introductie gehad waarin we het
                  materiaal, de deur en de noodprocedure doornemen.
                </li>
              </ul>
              <p>
                We kunnen onbegeleide toegang weigeren of intrekken als we
                dat om veiligheidsredenen verstandig vinden. Dat gebeurt
                zelden en we leggen altijd uit waarom.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="02 · Je toegangscode"
              heading="Je toegangscode"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Je code is persoonlijk. Deel hem met niemand, ook niet
                  met je partner, huisgenoot of een ander lid.
                </li>
                <li>
                  Laat niemand met je mee naar binnen. Ook niet iemand die
                  zegt dat hij lid is. Twijfel je, stuur hem naar de app
                  of naar Marlon.
                </li>
                <li>
                  Zorg dat de deur achter je dichtvalt als je binnenkomt
                  en als je weggaat.
                </li>
                <li>
                  Denk je dat iemand anders je code kent, meld het meteen.
                  We geven je dan een nieuwe.
                </li>
              </ul>
              <p>
                Wordt je code gedeeld of laat je iemand binnen, dan
                trekken we de onbegeleide toegang in. Ontstaat er schade
                doordat jij iemand hebt binnengelaten, dan kunnen we die op
                je verhalen.
              </p>
            </PolicySection>

            <PolicySection eyebrow="03 · Alleen trainen" heading="Alleen trainen">
              <p>
                Buiten de begeleide uren kan het zijn dat je alleen in de
                studio bent. Er is dan niemand die je ziet als er iets
                gebeurt.
              </p>
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Train binnen je eigen grenzen. Dit is niet het moment
                  voor een maximale poging of voor een oefening die je nog
                  niet beheerst.
                </li>
                <li>
                  Gebruik geen materiaal waarvoor je geen instructie hebt
                  gehad.
                </li>
                <li>
                  Voel je je niet goed, stop dan meteen en ga naar buiten
                  of bel iemand.
                </li>
                <li>Zorg dat je telefoon bij je is en opgeladen.</li>
              </ul>
              <p>
                Kies je ervoor om alleen te trainen, dan accepteer je dat
                er op dat moment geen direct toezicht is en dat je daar
                zelf een inschatting van maakt.
              </p>
            </PolicySection>

            <PolicySection eyebrow="04 · Noodgevallen" heading="Noodgevallen">
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  De AED hangt{" "}
                  {/* PLACEHOLDER: locatie — waarde nog te bepalen. */}
                  [locatie]. Tijdens je introductie laten we zien waar en
                  hoe.
                </li>
                <li>
                  Bel bij een ongeval altijd eerst 112, daarna{" "}
                  {/* PLACEHOLDER: noodnummer studio — waarde nog te bepalen. */}
                  [noodnummer studio].
                </li>
                <li>
                  De nooduitgang is{" "}
                  {/* PLACEHOLDER: locatie — waarde nog te bepalen. */}
                  [locatie]. Zet er nooit iets voor.
                </li>
                <li>
                  Meld elk incident, ook als het met een sisser afliep.
                  Ook als het buiten de begeleide uren was en niemand het
                  gezien heeft.
                </li>
              </ul>
              <p>
                We vragen je bij het activeren om een contactpersoon voor
                noodgevallen. Die gebruiken we alleen daarvoor.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="05 · Wat er geregistreerd wordt"
              heading="Wat er geregistreerd wordt"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Elk gebruik van je code wordt vastgelegd: welke code,
                  welke deur, welk tijdstip. Dat is nodig om te weten wie
                  er in het pand is en om misbruik te kunnen zien.
                </li>
                <li>
                  Er hangen camera&apos;s bij de entree, op de
                  trainingsvloer en bij de achteringang. Geen geluid, en
                  niet in de kleedkamers, toiletten of doucheruimte.
                </li>
                <li>
                  Beelden bewaren we maximaal 28 dagen. Hoe lang we
                  toegangsgegevens bewaren en hoe je die kunt opvragen
                  staat in onze privacyverklaring.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="06 · Wat je niet doet"
              heading="Wat je niet doet buiten de begeleide uren"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Geen introducés of gasten meenemen. Introducépassen
                  gelden alleen voor groepslessen met een trainer erbij.
                </li>
                <li>Geen anderen trainen of coachen, betaald of onbetaald.</li>
                <li>Geen video-opnames waar anderen op staan.</li>
                <li>
                  De muziekinstallatie en de verlichting mag je gebruiken,
                  maar laat ze achter zoals je ze aantrof.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="07 · Als je klaar bent"
              heading="Als je klaar bent"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>Materiaal terug op zijn plek.</li>
                <li>Licht uit, ramen dicht, deur op slot.</li>
                <li>Ben jij de laatste, kijk dan even of er niemand meer is.</li>
              </ul>
            </PolicySection>

            <PolicySection eyebrow="08 · Intrekken" heading="Intrekken">
              <p>
                We kunnen je onbegeleide toegang intrekken bij het delen
                van je code, bij het binnenlaten van anderen, bij herhaald
                slordig afsluiten, of bij een betalingsachterstand. Je
                gewone lidmaatschap loopt dan door, alleen de vrije
                toegang stopt.
              </p>
              <p>Je toegang stopt automatisch als je abonnement eindigt.</p>
            </PolicySection>

            <PolicySection
              eyebrow="09 · Aansprakelijkheid"
              heading="Aansprakelijkheid"
            >
              <p>
                Hiervoor geldt artikel 11 van de{" "}
                <QuietLink href="/voorwaarden">
                  algemene voorwaarden
                </QuietLink>
                . We nemen onze verantwoordelijkheid voor het pand en het
                materiaal. Voor de keuzes die je maakt tijdens het trainen
                zonder toezicht ben je zelf verantwoordelijk.
              </p>
            </PolicySection>

            {/* PLACEHOLDER: [datum] hieronder nog invullen — hoort bij src/lib/legal/versions.ts, niet los invullen. */}
            <p className="text-text-muted text-xs pt-8 border-t border-bg-subtle">
              Versie {VERSION.version} — {VERSION.date}
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
