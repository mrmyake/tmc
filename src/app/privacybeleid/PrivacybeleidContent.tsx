"use client";

/**
 * // COPY: confirm with Marlon — dit is een CONCEPT-privacyverklaring.
 *
 * Anders dan de meeste "COPY: confirm"-teksten in deze codebase (zie
 * bijv. src/app/app/support/page.tsx) is dit géén marketingcopy die met
 * een blik van Marlon klaar is. Dit is een juridisch document onder de
 * AVG/GDPR. Voordat dit gepubliceerd wordt als de officiële
 * privacyverklaring van The Movement Club moet het langs een jurist of
 * een AVG-gespecialiseerde dienst (niet alleen Marlons akkoord) — met
 * name de grondslag/bewaartermijn-secties en de bijzondere-
 * persoonsgegevens-paragraaf (health-intake) verdienen een formele
 * toetsing. Zie ook de PR-beschrijving.
 *
 * De inhoud hieronder is geverifieerd tegen de daadwerkelijke code
 * (Supabase-schema, mailer-integraties, Capacitor push-flow) op
 * 2 juli 2026 — geen aannames over wat er "waarschijnlijk" gebeurt.
 */

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";
import { SITE } from "@/lib/constants";

const LAST_UPDATED = "2 juli 2026";

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

export function PrivacybeleidContent() {
  return (
    <>
      {/* Header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            <SectionHeading
              label="Privacy"
              heading="Privacyverklaring"
              subtext={`Hoe The Movement Club omgaat met jouw persoonsgegevens — op deze website, in de member-app en in de studio. Laatst bijgewerkt op ${LAST_UPDATED}.`}
            />
          </ScrollReveal>
        </Container>
      </Section>

      {/* Body */}
      <Section bg="elevated">
        <Container>
          <div className="space-y-20">
            <PolicySection
              eyebrow="01 · Wie is verantwoordelijk"
              heading="Verwerkingsverantwoordelijke"
            >
              <p>
                The Movement Club, gevestigd aan {SITE.address.street},{" "}
                {SITE.address.zip} {SITE.address.city} (KvK {SITE.kvk}), is
                verwerkingsverantwoordelijke voor de persoonsgegevens die via
                deze website, de member-app en in de studio worden verzameld.
              </p>
              <p>
                Voor alle vragen over deze verklaring of over hoe we met je
                gegevens omgaan, kun je terecht bij{" "}
                <QuietLink href={`mailto:${SITE.email}`}>
                  {SITE.email}
                </QuietLink>
                .
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="02 · Welke gegevens"
              heading="Welke persoonsgegevens verzamelen we"
            >
              <p>Afhankelijk van hoe je met ons in aanraking komt, verwerken we:</p>
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  <strong className="text-text">Profielgegevens</strong>{" "}
                  —
                  voornaam, achternaam, e-mailadres, telefoonnummer,
                  geboortedatum en adresgegevens, zodra je lid wordt of een
                  account aanmaakt in de member-app.
                </li>
                <li>
                  <strong className="text-text">Noodcontactgegevens</strong>{" "}
                  —
                  naam en telefoonnummer van een contactpersoon die we alleen
                  in een noodsituatie tijdens een sessie benaderen.
                </li>
                <li>
                  <strong className="text-text">Boekingsgeschiedenis</strong>{" "}
                  — welke lessen, personal trainingen of proeflessen je hebt
                  geboekt, gevolgd of geannuleerd.
                </li>
                <li>
                  <strong className="text-text">Betaalgegevens</strong>{" "}
                  —
                  welk bedrag, voor welk abonnement of welke sessie, en de
                  status van die betaling. We slaan zelf geen
                  creditcard- of bankgegevens op; het betaalproces zelf loopt
                  via onze betaalverwerker Mollie (zie hieronder).
                </li>
                <li>
                  <strong className="text-text">Device-pushtoken</strong>{" "}
                  —
                  als je de native app op je telefoon gebruikt en
                  meldingen toestaat, slaan we een technisch token op
                  (gekoppeld aan jouw account en het type toestel, ios of
                  android) om je een pushmelding te kunnen sturen. Geen
                  locatiegegevens, geen toegang tot de rest van je toestel.
                </li>
              </ul>
              <p>
                Op de website (buiten de member-app om) verzamelen we daarnaast
                voor- en achternaam, e-mailadres, telefoonnummer en je
                bericht als je een formulier invult — bijvoorbeeld voor een
                proefles, de gratis Mobility Check, de Beweeg Beter guide of
                het contactformulier.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="03 · Bijzondere persoonsgegevens"
              heading="Gezondheidsgegevens uit de intake"
            >
              <p>
                Als lid vul je bij aanmelding een intake in over blessures,
                klachten, medicatiegebruik en eventuele zwangerschap. Dit
                zijn <strong className="text-text">bijzondere
                persoonsgegevens</strong>{" "}
                in de zin van de AVG — gegevens over
                je gezondheid — waar we extra zorgvuldig mee omgaan.
              </p>
              <p>
                We vragen hiervoor je uitdrukkelijke toestemming bij het
                invullen van de intake. Deze gegevens gebruiken we uitsluitend
                om je training veilig en verantwoord op jou af te stemmen, en
                zijn alleen zichtbaar voor trainers die daar door ons
                nadrukkelijk toegang toe hebben gekregen — niet standaard
                voor iedere trainer. Je kunt je toestemming voor het delen
                van deze gegevens op elk moment intrekken door contact met
                ons op te nemen; zie sectie 11 hieronder.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="04 · Waarvoor"
              heading="Waarvoor gebruiken we je gegevens"
            >
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  Om je lidmaatschap, boekingen en betalingen te kunnen
                  uitvoeren (uitvoering van de overeenkomst).
                </li>
                <li>
                  Om je training veilig en persoonlijk te kunnen begeleiden,
                  op basis van je intake (met jouw uitdrukkelijke
                  toestemming).
                </li>
                <li>
                  Om je een pushmelding of e-mail te sturen over je boeking,
                  abonnement of — als je daarvoor gekozen hebt — over onze
                  content en aanbiedingen.
                </li>
                <li>
                  Om wettelijke verplichtingen na te komen, bijvoorbeeld onze
                  fiscale bewaarplicht voor betaalgegevens.
                </li>
              </ul>
            </PolicySection>

            <PolicySection
              eyebrow="05 · Delen met derden"
              heading="Met wie delen we je gegevens"
            >
              <p>
                We verkopen je gegevens nooit. We delen gegevens alleen met
                partijen die ze nodig hebben om de dienst te kunnen leveren:
              </p>
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>
                  <strong className="text-text">Supabase</strong>{" "}
                  — hosting
                  van onze database en het inlogsysteem (authenticatie) voor
                  de member-app. {/* COPY: confirm — Supabase-regio/infrastructuurlocatie bevestigen voor deze paragraaf. */}
                </li>
                <li>
                  <strong className="text-text">Mollie</strong>{" "}
                  — verwerkt
                  al onze betalingen. Mollie ontvangt de betaalgegevens die
                  nodig zijn om een betaling te verwerken; wij ontvangen
                  alleen het resultaat (gelukt/mislukt) en een transactie-ID.
                </li>
                <li>
                  <strong className="text-text">MailerLite</strong>{" "}
                  —
                  verstuurt e-mails waarvoor je je actief hebt aangemeld,
                  zoals de Beweeg Beter guide, de Mobility Reset e-mailreeks
                  en overige marketingcommunicatie.
                </li>
                <li>
                  <strong className="text-text">MailerSend</strong>{" "}
                  —
                  verstuurt transactionele e-mails die bij je account of
                  boeking horen, zoals bevestigingen en herinneringen.
                </li>
                <li>
                  <strong className="text-text">Firebase (Google)</strong>{" "}
                  —
                  voor pushmeldingen vanuit de native app. Dit onderdeel is
                  nog niet actief; het Firebase-project moet nog worden
                  aangemaakt.{" "}
                  {/* COPY: confirm with Marlon — voorgesteld project-id
                  "tmc-member-app", regio europe-west4. Zie de comment in
                  src/components/capacitor/PushNotificationRegister.tsx. */}
                </li>
                <li>
                  <strong className="text-text">Sanity</strong>{" "}
                  — ons
                  content-systeem voor de website (teksten, foto&apos;s,
                  openingstijden). Hier slaan we geen ledengegevens in op.
                </li>
                <li>
                  <strong className="text-text">Vercel</strong>{" "}
                  — host de
                  website en de member-app.
                </li>
              </ul>
              <p>
                Met elke partij die persoonsgegevens namens ons verwerkt,
                hebben we (of maken we) afspraken zoals de AVG die
                voorschrijft.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="06 · Bewaartermijn"
              heading="Hoe lang bewaren we je gegevens"
            >
              <p>
                We bewaren je gegevens niet langer dan nodig is voor het doel
                waarvoor we ze verzameld hebben, of zolang we daartoe
                wettelijk verplicht zijn (bijvoorbeeld de fiscale
                bewaarplicht voor betaalgegevens).{" "}
                {/* COPY: confirm — concrete bewaartermijnen per
                gegevenscategorie zijn nog niet formeel vastgesteld;
                voorstel is dit samen met de jurist/AVG-toetsing in sectie
                01 verder in te vullen. */}
                Zeg je je lidmaatschap op, dan verwijderen of anonimiseren
                we je gegevens zodra de wettelijke bewaartermijnen dat
                toelaten.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="07 · Cookies"
              heading="Cookies en vergelijkbare technieken"
            >
              <p>
                Deze website gebruikt alleen analytische cookies (Google
                Analytics) nadat je daar toestemming voor hebt gegeven via de
                cookiebanner onderaan de pagina. Zonder jouw toestemming
                meten we geanonimiseerd en zonder persoonsgegevens te
                koppelen. Je kunt je keuze op elk moment aanpassen via de
                cookie-instellingen.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="08 · Beveiliging"
              heading="Hoe beveiligen we je gegevens"
            >
              <p>
                We nemen passende technische en organisatorische maatregelen
                om je gegevens te beschermen tegen verlies of onrechtmatig
                gebruik. Toegang tot je gegevens in onze database is
                afgeschermd per gebruiker: als lid kun jij alleen bij je
                eigen gegevens, en gevoelige gezondheidsinformatie is
                extra afgeschermd en alleen zichtbaar voor trainers die
                daar expliciet toegang toe hebben gekregen. Onze
                systeembeheerders werken volgens het principe van minimale
                toegang.
              </p>
            </PolicySection>

            {/*
              // COPY: confirm met Marlon
              Aangeleverd via legal-source/privacyverklaring-aanvulling-camera-en-toegang.md
              (niet gecommit, zie .gitignore). Deze twee secties zijn geen
              losse pagina — ze horen bij dit document, zoals aangeleverd.
              De CHECKLIST die bij deze secties hoorde is voor Ilja, niet voor
              de pagina; die staat bewust alleen hier als comment, niet
              gepubliceerd:
              1. Bordje bij de entree en bij de achteringang: "Dit pand staat
                 onder cameratoezicht". Vermeld TMC als verantwoordelijke en
                 verwijs naar de privacyverklaring.
              2. Belangenafweging in twee alinea's op papier zetten en
                 bewaren.
              3. Camera's en toegangslogs opnemen in het verwerkingsregister,
                 samen met de andere verwerkers.
              4. Audio-opname uitzetten in de NVR-instellingen, standaard
                 staat die vaak aan.
              5. Automatische overschrijving instellen op 28 dagen.
              6. Verwerkersovereenkomst met Akiles opvragen en de
                 bewaartermijn van hun logs navragen.
              7. Cameratoezicht opnemen in de overeenkomst of het reglement
                 voor trainers.
            */}
            <PolicySection eyebrow="09 · Cameratoezicht" heading="Cameratoezicht">
              <p>
                <strong className="text-text">Waar hangen camera&apos;s.</strong>{" "}
                Bij de entree, op de trainingsvloer en bij de achteringang.
                Nergens anders.
              </p>
              <p>
                <strong className="text-text">Waar hangen ze niet.</strong>{" "}
                Niet in de kleedkamers, niet in de toiletten, niet in de
                doucheruimte. Nergens waar je je omkleedt of waar je privacy
                vanzelfsprekend is. Er zijn geen verborgen camera&apos;s.
              </p>
              <p>
                <strong className="text-text">Waarom.</strong>{" "}
                Om de
                veiligheid van mensen en spullen te beschermen, vooral op de
                uren dat er geen trainer aanwezig is en leden met hun eigen
                toegangscode binnenkomen. Zonder toezicht zouden we bij een
                ongeval, diefstal of schade buiten de begeleide uren geen
                enkel beeld hebben van wat er gebeurd is.
              </p>
              <p>
                <strong className="text-text">Grondslag.</strong>{" "}
                Gerechtvaardigd belang. We hebben de afweging tussen jouw
                privacy en onze veiligheidsbelangen schriftelijk vastgelegd
                en kunnen die op verzoek toelichten.
              </p>
              <p>
                <strong className="text-text">Geen geluid.</strong>{" "}
                De
                camera&apos;s nemen geen geluid op.
              </p>
              <p>
                <strong className="text-text">Hoe lang.</strong>{" "}
                Maximaal 28
                dagen. Daarna worden de beelden automatisch overschreven. Is
                er een incident, dan bewaren we alleen het fragment dat
                daarop betrekking heeft, en niet langer dan nodig om het af
                te handelen.
              </p>
              <p>
                <strong className="text-text">
                  Waar staan de beelden.
                </strong>{" "}
                Op een recorder in de studio zelf, niet in de cloud. Alleen
                Marlon heeft toegang tot de beelden.
              </p>
              <p>
                <strong className="text-text">Wie krijgt ze te zien.</strong>{" "}
                Niemand, tenzij het nodig is bij een incident. Bij een
                aangifte kunnen we beelden delen met de politie. We delen
                nooit beelden met andere leden.
              </p>
              <p>
                <strong className="text-text">Jouw rechten.</strong>{" "}
                Je kunt
                opvragen of er beelden van jou zijn en die inzien. Stuur een
                verzoek naar{" "}
                {/* PLACEHOLDER: e-mailadres — staat ook in Sanity siteSettings, bewust niet overgenomen. */}
                [e-mailadres] met de datum en het tijdstip erbij, zo precies
                mogelijk. Omdat er meestal ook anderen op de beelden staan,
                laten we je de beelden ter plaatse zien of maken we andere
                personen onherkenbaar. We reageren binnen een maand.
              </p>
              <p>
                <strong className="text-text">Trainers.</strong>{" "}
                Onze
                trainers werken onder cameratoezicht. Dat is met hen apart
                besproken en vastgelegd in hun overeenkomst.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="10 · Toegangsgegevens"
              heading="Toegangsgegevens"
            >
              <p>
                <strong className="text-text">Wat we vastleggen.</strong>{" "}
                Als
                je een persoonlijke toegangscode hebt, registreren we per
                keer welke code welke deur op welk moment heeft geopend.
              </p>
              <p>
                <strong className="text-text">Waarom.</strong>{" "}
                Om te kunnen
                zien wie er in het pand is geweest, om misbruik van codes op
                te merken, en om bij een incident te kunnen nagaan wat er
                gebeurd is.
              </p>
              <p>
                <strong className="text-text">Grondslag.</strong>{" "}
                Uitvoering
                van de overeenkomst en gerechtvaardigd belang.
              </p>
              <p>
                <strong className="text-text">Waar.</strong>{" "}
                De
                toegangslogs worden bijgehouden in het systeem van Akiles,
                onze leverancier van het slotsysteem. In ons eigen
                ledensysteem bewaren we alleen of je toegang hebt en tot
                wanneer, niet de afzonderlijke deuropeningen.
              </p>
              <p>
                <strong className="text-text">Hoe lang.</strong>{" "}
                {/* PLACEHOLDER: bewaartermijn toegangslogs — nog vast te stellen in overleg met Akiles. Streef naar niet langer dan strikt nodig. */}
                [Bewaartermijn nog vast te stellen, in overleg met Akiles.
                Streef naar niet langer dan strikt nodig.]
              </p>
              <p>
                <strong className="text-text">Verwerker.</strong>{" "}
                Akiles is
                verwerker voor deze gegevens. Met hen is een
                verwerkersovereenkomst gesloten.
              </p>
            </PolicySection>

            <PolicySection eyebrow="11 · Jouw rechten" heading="Jouw rechten onder de AVG">
              <p>Je hebt altijd het recht op:</p>
              <ul className="list-disc list-inside space-y-2 marker:text-accent">
                <li>Inzage in de gegevens die we van je hebben.</li>
                <li>Rectificatie van onjuiste of onvolledige gegevens.</li>
                <li>Verwijdering van je gegevens.</li>
                <li>Beperking van de verwerking van je gegevens.</li>
                <li>Bezwaar tegen de verwerking van je gegevens.</li>
                <li>
                  Dataportabiliteit — je gegevens in een overdraagbaar
                  formaat ontvangen.
                </li>
                <li>
                  Het intrekken van eerder gegeven toestemming, bijvoorbeeld
                  voor het delen van je health-intake met een trainer of
                  voor marketing-e-mails. Intrekken heeft geen invloed op de
                  rechtmatigheid van de verwerking vóór het intrekken.
                </li>
              </ul>
              <p>
                Wil je een van deze rechten uitoefenen? Stuur een e-mail naar{" "}
                <QuietLink href={`mailto:${SITE.email}`}>
                  {SITE.email}
                </QuietLink>
                . We reageren zo snel mogelijk, uiterlijk binnen vier weken.
              </p>
              <p>
                Ben je niet tevreden over hoe we met je gegevens omgaan? Dan
                kun je een klacht indienen bij de Autoriteit Persoonsgegevens.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="12 · Wijzigingen"
              heading="Wijzigingen in deze verklaring"
            >
              <p>
                We kunnen deze privacyverklaring van tijd tot tijd aanpassen,
                bijvoorbeeld als we nieuwe functionaliteit toevoegen. De
                datum bovenaan deze pagina geeft aan wanneer de verklaring
                voor het laatst is bijgewerkt.
              </p>
            </PolicySection>

            <PolicySection eyebrow="13 · Contact" heading="Vragen?">
              <p>
                Neem gerust contact op via{" "}
                <QuietLink href={`mailto:${SITE.email}`}>
                  {SITE.email}
                </QuietLink>{" "}
                of per post naar {SITE.address.street}, {SITE.address.zip}{" "}
                {SITE.address.city}.
              </p>
            </PolicySection>
          </div>
        </Container>
      </Section>
    </>
  );
}
