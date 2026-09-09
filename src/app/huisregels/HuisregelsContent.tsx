"use client";

/**
 * // COPY: confirm met Marlon — dit is een CONCEPT van de huisregels. Nog
 * niet juridisch getoetst, al mag dit document qua toon het dichtst bij
 * Marlon blijven — het is minder juridisch dan de algemene voorwaarden.
 *
 * Bron: legal-source/huisregels.md (niet gecommit, zie .gitignore). Alle
 * placeholders tussen vierkante haken zijn bewust niet ingevuld — zie de
 * PLACEHOLDER-comments hieronder. Eerst met Marlon langslopen.
 */

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { LEGAL_DOCUMENT_VERSIONS } from "@/lib/legal/versions";

const VERSION = LEGAL_DOCUMENT_VERSIONS.huisregels;

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

export function HuisregelsContent() {
  return (
    <>
      {/* Header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Huisregels"
              heading="Huisregels"
              subtext="De studio is klein en dat is precies de bedoeling. Deze regels zorgen ervoor dat het voor iedereen prettig blijft."
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Body */}
      <Section bg="elevated">
        <Container>
          <div className="space-y-20">
            <PolicySection
              eyebrow="01 · Voor je binnenkomt"
              heading="Voor je binnenkomt"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>Boek je les vooraf in de app. Vol is vol.</li>
                <li>
                  Kun je niet, annuleer dan op tijd. Dan kan iemand van de
                  wachtlijst jouw plek nemen.
                </li>
                <li>
                  Kom op tijd. Meer dan{" "}
                  {/* PLACEHOLDER: aantal minuten — waarde nog te bepalen. */}
                  [10] minuten te laat en de trainer kan je de les weigeren,
                  omdat meedoen zonder warming-up niet veilig is.
                </li>
              </ul>
            </PolicySection>

            <PolicySection eyebrow="02 · In de studio" heading="In de studio">
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Binnenschoenen op de trainingsvloer. Niet de schoenen
                  waar je mee buiten liep.
                </li>
                <li>
                  Neem een handdoek mee. Leg die op het materiaal waar je
                  op zit of ligt.
                </li>
                <li>
                  Ruim je materiaal op. Kettlebells terug op de rek,
                  matjes terug op de plek, gewichten van de stang.
                </li>
                <li>
                  Veeg af wat je zweterig achterlaat. De doekjes en spray
                  staan klaar.
                </li>
                <li>
                  Telefoons op stil. Filmen of fotograferen mag alleen als
                  iedereen die in beeld komt daar oké mee is. Vraag het
                  gewoon even.
                </li>
                <li>
                  Eten doe je buiten de trainingsvloer. Water en een
                  bidon zijn prima.
                </li>
                <li>
                  Geen buitenschoenen, geen sterke parfums, geen harde
                  eigen muziek. Klein pand, iedereen merkt het.
                </li>
              </ul>
            </PolicySection>

            <PolicySection eyebrow="03 · Materiaal" heading="Materiaal">
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Ga netjes om met het materiaal. Laat kettlebells niet
                  vallen als het niet nodig is.
                </li>
                <li>
                  Zie je iets kapots of iets dat los zit, meld het meteen
                  bij de trainer of via de app. Ook als jij het niet
                  gebroken hebt.
                </li>
                <li>
                  Beschadig je expres of door duidelijke onvoorzichtigheid
                  iets, dan kunnen we de kosten in rekening brengen.
                </li>
              </ul>
            </PolicySection>

            <PolicySection eyebrow="04 · Elkaar" heading="Elkaar">
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Iedereen traint hier op zijn eigen niveau. Ongevraagd
                  advies geven aan een ander laten we aan de trainers over.
                </li>
                <li>
                  Ongewenst gedrag, intimidatie of discriminatie wordt
                  niet getolereerd. Eén gesprek, en daarna de deur.
                </li>
                <li>
                  Merk je iets wat niet in orde is, bij jezelf of bij een
                  ander, zeg het tegen Marlon of tegen de trainer. Dat mag
                  ook later en dat mag ook per mail.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="05 · Je gezondheid"
              heading="Je gezondheid"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Meld blessures, medicatie, zwangerschap of andere
                  klachten bij de trainer, ook als je ze al in de app hebt
                  ingevuld. De trainer voor de klas weet niet automatisch
                  alles.
                </li>
                <li>
                  Voel je je niet goed, stop dan. Duizelig, misselijk,
                  pijn op een plek die geen spierpijn is: stoppen en
                  melden.
                </li>
                <li>Ziek of koorts: blijf thuis.</li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="06 · Kleedkamers en spullen"
              heading="Kleedkamers en spullen"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Er hangen geen camera&apos;s in de kleedkamers, de
                  toiletten of de doucheruimte. Nergens anders in het pand
                  ook niet waar je je omkleedt.
                </li>
                <li>
                  Laat waardevolle spullen thuis. De kluisjes zijn er voor
                  je gemak, maar we zijn niet aansprakelijk voor wat er in
                  ligt.
                </li>
                <li>
                  Neem je spullen mee als je weggaat. Wat blijft liggen
                  bewaren we{" "}
                  {/* PLACEHOLDER: bewaartermijn — waarde nog te bepalen. */}
                  [vier weken], daarna geven we het weg.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="07 · Cameratoezicht"
              heading="Cameratoezicht"
            >
              <p>
                Bij de entree, op de trainingsvloer en bij de achteringang
                hangen camera&apos;s. Dat is er vooral voor de uren dat er
                geen trainer aanwezig is. We nemen geen geluid op en we
                bewaren de beelden maximaal 28 dagen. Meer daarover staat
                in onze privacyverklaring, en je kunt altijd opvragen of er
                beelden van jou zijn.
              </p>
            </PolicySection>

            <PolicySection eyebrow="08 · Introducés" heading="Introducés">
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Neem je iemand mee met een introducépas, boek die dan
                  vooraf in de app.
                </li>
                <li>
                  Je blijft zelf verantwoordelijk voor je gast: dat die de
                  huisregels kent en dat blessures of klachten bij de
                  trainer gemeld worden.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="09 · Buiten de begeleide uren"
              heading="Buiten de begeleide uren"
            >
              <p>
                Train je met je eigen toegangscode buiten de uren dat er
                een trainer is, dan gelden er extra regels. Die staan in
                de Voorwaarden onbegeleide toegang. Kort gezegd: je code
                is van jou alleen, je laat niemand mee naar binnen, en je
                zorgt dat de deur achter je dicht is.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="10 · Als het misgaat"
              heading="Als het misgaat"
            >
              <p>
                Bij herhaald of ernstig overtreden van deze regels kunnen
                we je de toegang ontzeggen. We spreken je eerst, altijd.
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
