"use client";

/**
 * // COPY: confirm met Marlon — dit is een CONCEPT van de algemene
 * voorwaarden. Nog niet juridisch getoetst. Laat in elk geval artikel 11
 * (aansprakelijkheid) en artikel 3 (looptijd en opzeggen) nakijken voordat
 * dit langer dan een paar weken live staat.
 *
 * Bron: legal-source/algemene-voorwaarden.md (niet gecommit, zie .gitignore).
 * Alle placeholders tussen vierkante haken zijn bewust niet ingevuld — zie
 * de PLACEHOLDER-comments hieronder, ook waar de waarde al in Sanity
 * siteSettings staat (adres, KvK, btw, e-mail). Eerst met Marlon langslopen.
 */

import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { QuietLink } from "@/components/ui/QuietLink";
import { LEGAL_DOCUMENT_VERSIONS } from "@/lib/legal/versions";

const VERSION = LEGAL_DOCUMENT_VERSIONS.algemene_voorwaarden;

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

export function VoorwaardenContent() {
  return (
    <>
      {/* Header */}
      <Section className="pt-32 md:pt-40">
        <Container>
          <ScrollReveal>
            {/* PLACEHOLDER: [datum] hieronder nog invullen — hoort bij src/lib/legal/versions.ts, niet los invullen. */}
            <SectionHeading
              label="Voorwaarden"
              heading="Algemene voorwaarden"
              subtext="Laatst bijgewerkt: [datum]."
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
                Deze voorwaarden gelden voor iedereen die traint bij The
                Movement Club. Ze horen bij onze{" "}
                <QuietLink href="/huisregels">huisregels</QuietLink> en onze{" "}
                <QuietLink href="/privacybeleid">privacyverklaring</QuietLink>
                . We hebben geprobeerd ze leesbaar te houden. Kom je er niet
                uit, vraag het gewoon.
              </p>
            </ScrollReveal>

            <PolicySection eyebrow="01 · Wie we zijn" heading="Wie we zijn">
              <p>
                The Movement Club, Industrieweg 14P,{" "}
                {/* PLACEHOLDER: postcode — staat ook in Sanity siteSettings, bewust niet overgenomen. Eerst met Marlon langslopen. */}
                [postcode] Loosdrecht.
              </p>
              <p>
                KvK{" "}
                {/* PLACEHOLDER: KvK-nummer — staat ook in Sanity siteSettings, bewust niet overgenomen. */}
                [nummer], btw{" "}
                {/* PLACEHOLDER: btw-nummer — staat ook in Sanity siteSettings, bewust niet overgenomen. */}
                [nummer].
              </p>
              <p>
                Bereikbaar via{" "}
                {/* PLACEHOLDER: e-mailadres — staat ook in Sanity siteSettings, bewust niet overgenomen. */}
                [e-mailadres] en via de app.
              </p>
              <p>
                In deze voorwaarden bedoelen we met &quot;wij&quot; en
                &quot;we&quot; The Movement Club, en met &quot;je&quot; het
                lid of de bezoeker.
              </p>
            </PolicySection>

            <PolicySection eyebrow="02 · Voor wie" heading="Voor wie">
              <p>
                Je kunt lid worden vanaf 16 jaar. Ben je 16 of 17, dan hebben
                we schriftelijke toestemming van je ouder of verzorger nodig
                voordat het lidmaatschap ingaat. Die toestemming vragen we
                bij de aanmelding.
              </p>
              <p>
                Voor onbegeleide toegang buiten de begeleide uren geldt een
                hogere leeftijdsgrens en gelden aanvullende voorwaarden. Zie
                het aparte document{" "}
                <QuietLink href="/onbegeleide-toegang">
                  Voorwaarden onbegeleide toegang
                </QuietLink>
                .
              </p>
              <p>
                Voor kinderlessen gelden aparte afspraken die we per les met
                je doornemen.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="03 · Je lidmaatschap"
              heading="Je lidmaatschap"
            >
              <p>
                <strong className="text-text">Ingang.</strong>{" "}
                Je
                lidmaatschap begint op de datum die je bij je aanmelding
                kiest. Vanaf die datum kun je boeken en betaal je.
              </p>
              <p>
                <strong className="text-text">Looptijd.</strong>{" "}
                De standaard
                looptijd is één jaar. Kies je voor de langere variant, dan is
                dat 24 maanden met de korting die op de tarievenpagina staat.
              </p>
              <p>
                <strong className="text-text">
                  Na de eerste looptijd.
                </strong>{" "}
                Daarna loopt je lidmaatschap door voor onbepaalde tijd en kun
                je elke maand opzeggen, met een opzegtermijn van{" "}
                {/* PLACEHOLDER: opzegtermijn — waarde nog te bepalen. */}
                [één kalendermaand].
              </p>
              <p>
                <strong className="text-text">Opzeggen.</strong>{" "}
                Dat doe je
                in de app, of per e-mail naar{" "}
                {/* PLACEHOLDER: e-mailadres — staat ook in Sanity siteSettings, bewust niet overgenomen. */}
                [e-mailadres]. Je krijgt altijd een bevestiging. Heb je die
                niet binnen een paar dagen, laat het ons weten, dan is er
                iets misgegaan.
              </p>
              <p>
                <strong className="text-text">Tussentijds opzeggen.</strong>{" "}
                Binnen de eerste looptijd kun je niet zomaar opzeggen.
                Verhuis je ver weg, of kun je door een medische reden
                langere tijd niet trainen, neem dan contact op. Dat lossen
                we in overleg op, met een bewijsstuk erbij.
              </p>
              <p>
                <strong className="text-text">Wijzigen.</strong>{" "}
                Overstappen
                naar een ander abonnement kan. Een upgrade gaat in op de
                eerstvolgende betaaldatum, een downgrade aan het einde van je
                huidige looptijd.
              </p>
            </PolicySection>

            <PolicySection eyebrow="04 · Betalen" heading="Betalen">
              <p>
                <strong className="text-text">Per vier weken.</strong>{" "}
                Alle
                abonnementsprijzen zijn per vier weken, niet per maand. Je
                betaalt dus dertien keer per jaar, niet twaalf. De actuele
                prijzen staan op de tarievenpagina.
              </p>
              <p>
                <strong className="text-text">Automatische incasso.</strong>{" "}
                Je betaalt via automatische incasso (SEPA). Bij je
                aanmelding geef je daar een machtiging voor. We schrijven
                het bedrag steeds af rond dezelfde dag van je vierwekelijkse
                cyclus.
              </p>
              <p>
                <strong className="text-text">
                  Als een incasso mislukt.
                </strong>{" "}
                Dan proberen we het opnieuw en laten we het je weten. Lukt
                het daarna nog niet, dan kunnen we je toegang tijdelijk
                stopzetten totdat de betaling rond is. De achterstand blijft
                gewoon openstaan. Bij aanhoudende betalingsachterstand
                kunnen wettelijke incassokosten en rente in rekening worden
                gebracht.
              </p>
              <p>
                <strong className="text-text">Storneren.</strong>{" "}
                Storneer
                je een incasso zonder overleg, dan geldt hetzelfde als
                hierboven.
              </p>
              <p>
                <strong className="text-text">Inschrijfkosten.</strong>{" "}
                Bij
                de start betaal je eenmalig inschrijfkosten, tenzij die in
                jouw geval zijn kwijtgescholden. Dat staat op je
                bevestiging.
              </p>
              <p>
                <strong className="text-text">Prijswijziging.</strong>{" "}
                We
                kunnen de tarieven aanpassen. Dat laten we minstens{" "}
                {/* PLACEHOLDER: aankondigingstermijn — waarde nog te bepalen. */}
                [één maand] van tevoren weten. Ben je het er niet mee eens,
                dan mag je je lidmaatschap opzeggen tegen de datum waarop de
                nieuwe prijs ingaat, ook als je nog in je eerste looptijd
                zit.
              </p>
            </PolicySection>

            <PolicySection eyebrow="05 · Pauzeren" heading="Pauzeren">
              <p>
                Kun je door blessure, ziekte of zwangerschap langere tijd
                niet trainen, dan kun je je lidmaatschap tijdelijk pauzeren.
                Neem daarvoor contact op. We vragen om een korte
                onderbouwing. Tijdens de pauze betaal je niet en schuift je
                einddatum mee op.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="06 · Boeken en annuleren"
              heading="Boeken, annuleren en niet komen opdagen"
            >
              <p>
                <strong className="text-text">Boeken.</strong>{" "}
                Lessen boek
                je via de app. Vol is vol. Zit een les vol, dan kun je op de
                wachtlijst. Komt er een plek vrij, dan krijg je bericht en
                heb je een beperkte tijd om te bevestigen.
              </p>
              <p>
                <strong className="text-text">Annuleren.</strong>{" "}
                Annuleren
                kan kosteloos tot{" "}
                {/* PLACEHOLDER: annuleertermijn — waarde nog te bepalen. */}
                [X uur] voor aanvang van de les. Daarna telt de les mee
                alsof je geweest bent: bij een abonnement met een vast
                aantal lessen gaat de les eraf, bij een rittenkaart gaat de
                rit eraf.
              </p>
              <p>
                <strong className="text-text">
                  Niet komen opdagen.
                </strong>{" "}
                Kom je zonder te annuleren niet opdagen, dan geldt hetzelfde
                als bij te laat annuleren. We rekenen geen boete, maar de
                plek was voor iemand anders bedoeld.
              </p>
              <p>
                <strong className="text-text">Te laat.</strong>{" "}
                Kom je meer
                dan{" "}
                {/* PLACEHOLDER: aantal minuten — waarde nog te bepalen. */}
                [10] minuten te laat, dan kan de trainer je de toegang tot
                de les weigeren. Dat is geen onwil, maar een kwestie van
                veiligheid: zonder warming-up meedoen is niet verstandig.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="07 · Rittenkaarten en proeflessen"
              heading="Rittenkaarten, losse lessen en proeflessen"
            >
              <p>
                Een rittenkaart is{" "}
                {/* PLACEHOLDER: geldigheidsduur — waarde nog te bepalen. */}
                [X] maanden geldig vanaf de aankoopdatum. Ongebruikte ritten
                vervallen daarna en worden niet terugbetaald. Losse lessen
                en proeflessen betaal je vooraf. Kom je niet opdagen bij een
                losse les of proefles, dan wordt het bedrag niet
                terugbetaald.
              </p>
            </PolicySection>

            <PolicySection eyebrow="08 · Introducés" heading="Introducés">
              <p>
                Bij sommige abonnementen krijg je per periode een of meer
                introducépassen, waarmee je iemand mee kunt nemen naar een
                groepsles. Hoeveel er bij jouw abonnement horen zie je in de
                app.
              </p>
              <p>
                Je bent zelf verantwoordelijk voor de persoon die je
                meeneemt. Je zorgt ervoor dat die persoon deze voorwaarden
                en de huisregels kent, en dat gezondheidsklachten of
                blessures vooraf bij de trainer gemeld worden.
                Introducépassen vervallen aan het einde van de periode en
                worden niet meegenomen naar de volgende.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="09 · Rooster en wijzigingen"
              heading="Rooster, openingstijden en wijzigingen"
            >
              <p>
                Het actuele rooster staat in de app. We kunnen lessen,
                tijden en trainers wijzigen. Vervalt een les die jij
                geboekt had, dan laten we dat zo snel mogelijk weten en
                telt de les niet mee.
              </p>
              <p>
                Rond feestdagen en in vakantieperiodes kan een aangepast
                rooster gelden. Dat kondigen we vooraf aan. Een aangepast
                rooster geeft geen recht op restitutie of verlenging.
              </p>
              <p>
                We kunnen de studio sluiten voor onderhoud, verbouwing of
                andere noodzakelijke redenen. Duurt zo&apos;n sluiting
                langer dan{" "}
                {/* PLACEHOLDER: termijn — waarde nog te bepalen. */}
                [een week], dan verlengen we je lidmaatschap met die
                periode.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="10 · Je gezondheid"
              heading="Je gezondheid"
            >
              <p>
                Bij je aanmelding vragen we naar blessures, medicatie,
                zwangerschap en andere dingen die van invloed zijn op je
                training. Vul dat eerlijk in en houd het bij als er iets
                verandert. Onze trainers kunnen alleen rekening houden met
                wat ze weten.
              </p>
              <p>
                Twijfel je of trainen verstandig is, overleg dan eerst met
                je huisarts of behandelaar. Wij geven geen medisch advies
                en stellen geen diagnoses.
              </p>
              <p>
                Voel je je tijdens een training niet goed, stop dan en meld
                het bij de trainer. Dat is geen zwakte, dat is precies de
                bedoeling.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="11 · Aansprakelijkheid"
              heading="Aansprakelijkheid"
            >
              {/* Dit artikel is het belangrijkste om juridisch te laten toetsen. Een volledige uitsluiting van aansprakelijkheid houdt tegen consumenten geen stand. */}
              <p>
                Trainen brengt risico&apos;s met zich mee. We doen wat
                redelijkerwijs van ons verwacht mag worden om die
                risico&apos;s klein te houden: goed onderhouden materiaal,
                gekwalificeerde trainers, groepen die klein genoeg zijn om
                je te zien.
              </p>
              <p>
                Gaat er toch iets mis en is dat aan ons te wijten, dan zijn
                we daarvoor aansprakelijk volgens de wet. Onze
                aansprakelijkheid is beperkt tot het bedrag dat onze
                aansprakelijkheidsverzekering in dat geval uitkeert. Keert
                de verzekering niet uit, dan is onze aansprakelijkheid
                beperkt tot het bedrag dat je in de voorafgaande{" "}
                {/* PLACEHOLDER: termijn — waarde nog te bepalen. */}
                [zes maanden] aan ons hebt betaald.
              </p>
              <p>
                We zijn niet aansprakelijk voor gevolgschade, zoals gemiste
                inkomsten of gemiste wedstrijden.
              </p>
              <p>
                Deze beperkingen gelden niet bij opzet of bewuste
                roekeloosheid van onze kant.
              </p>
              <p>
                <strong className="text-text">Je spullen.</strong>{" "}
                Neem geen
                waardevolle spullen mee die je niet bij je kunt houden. De
                kluisjes zijn er voor je gemak, maar we zijn niet
                aansprakelijk voor verlies, diefstal of beschadiging van je
                eigendommen, tenzij dat aan ons te wijten is.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="12 · Cameratoezicht"
              heading="Cameratoezicht"
            >
              <p>
                In en om de studio hangen camera&apos;s. Wat we opnemen,
                waarom, hoe lang we het bewaren en hoe je beelden van
                jezelf kunt opvragen, staat in onze{" "}
                <QuietLink href="/privacybeleid">privacyverklaring</QuietLink>
                .
              </p>
            </PolicySection>

            <PolicySection eyebrow="13 · Huisregels" heading="Huisregels">
              <p>
                Naast deze voorwaarden gelden onze{" "}
                <QuietLink href="/huisregels">huisregels</QuietLink>. Die
                gaan over hoe we met elkaar en met de ruimte omgaan. Bij
                herhaald of ernstig overtreden van de huisregels kunnen we
                je de toegang ontzeggen en het lidmaatschap beëindigen. Dat
                doen we niet lichtzinnig en nooit zonder je eerst te
                spreken.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="14 · Je persoonsgegevens"
              heading="Je persoonsgegevens"
            >
              <p>
                Hoe we met je gegevens omgaan staat in onze{" "}
                <QuietLink href="/privacybeleid">privacyverklaring</QuietLink>
                . Daar staat ook wat we doen met je gezondheidsgegevens en
                wie die kan inzien.
              </p>
            </PolicySection>

            <PolicySection eyebrow="15 · Klachten" heading="Klachten">
              <p>
                Loop je ergens tegenaan, zeg het tegen Marlon of mail naar{" "}
                {/* PLACEHOLDER: e-mailadres — staat ook in Sanity siteSettings, bewust niet overgenomen. */}
                [e-mailadres]. We reageren binnen{" "}
                {/* PLACEHOLDER: reactietermijn — waarde nog te bepalen. */}
                [twee weken]. Komen we er samen niet uit, dan kun je naar de
                rechter.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="16 · Wijziging van deze voorwaarden"
              heading="Wijziging van deze voorwaarden"
            >
              <p>
                We kunnen deze voorwaarden aanpassen. Bij inhoudelijke
                wijzigingen laten we het je minstens{" "}
                {/* PLACEHOLDER: aankondigingstermijn — waarde nog te bepalen. */}
                [één maand] van tevoren weten en vragen we je opnieuw
                akkoord. Ben je het niet eens met een wijziging die je
                nadelig raakt, dan mag je opzeggen tegen de ingangsdatum.
              </p>
            </PolicySection>

            <PolicySection
              eyebrow="17 · Toepasselijk recht"
              heading="Toepasselijk recht"
            >
              <p>Op deze voorwaarden is Nederlands recht van toepassing.</p>
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
