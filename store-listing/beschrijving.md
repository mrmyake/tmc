> **COPY: confirm with Marlon** — dit is marketing-copy (net als het
> support-scherm uit Fase 1). Geen juridische review nodig, wel een blik van
> Marlon voor toon en feitelijke juistheid vóór indiening.

# App-beschrijving — The Movement Club (member-app)

Alle copy hieronder beschrijft alleen wat de app daadwerkelijk doet: rooster
bekijken en boeken, boekingen inzien, lidmaatschap beheren, betalingen
inzien, support. Geen functionaliteit verzonnen die niet bestaat (geen
voedingstracker, geen social feed, geen wearable-koppeling — dat zit er niet
in).

## Tekenlimieten die hier gehanteerd zijn

Opgezocht juli 2026, zie bronnen onderaan dit bestand:

- **Apple — Promotional Text:** max. 170 tekens. Los van de app-versie
  aanpasbaar zonder nieuwe review.
- **Apple — Subtitle:** max. 30 tekens. Verschijnt direct onder de app-naam.
- **Apple — Keywords-veld:** max. 100 tekens totaal, komma-gescheiden, geen
  spatie ná een komma. Onzichtbaar voor gebruikers, alleen voor zoek-indexering.
- **Apple — Description:** max. 4.000 tekens. Wordt NIET geïndexeerd voor
  zoekresultaten (title + subtitle + keywords zijn dat wel).
- **Google Play — Short description:** max. 80 tekens.
- **Google Play — Full description:** max. 4.000 tekens.

---

## Korte beschrijving

### Apple — Subtitle (max. 30 tekens)

```
Boutique training, Loosdrecht
```
(29 tekens)

### Apple — Promotional Text (max. 170 tekens)

```
Jouw rooster, boekingen en lidmaatschap van The Movement Club — altijd bij de hand. Boek je sessie, check je boekingen en regel je abonnement, waar je ook bent.
```
(160 tekens)

### Google Play — Short description (max. 80 tekens)

```
Boek je training, beheer je lidmaatschap en boekingen bij The Movement Club.
```
(76 tekens)

---

## Lange beschrijving (Apple + Google, beide max. 4.000 tekens — zelfde tekst)

```
The Movement Club is een besloten boutique studio in Loosdrecht — personal
training, small group training (max. 6 personen) en mobility- en
krachtwerk onder begeleiding van head trainer Marlon. Deze app is het
persoonlijke portaal voor leden: alles wat je nodig hebt om je training te
plannen en je lidmaatschap te beheren, in één plek.

ROOSTER
Bekijk het volledige weekrooster, gefilterd op de pijler die jou past —
Vrij trainen, Yoga & mobility, Kettlebell, Kids of Senior. Boek een
sessie met één tik, zie direct de beschikbare capaciteit, en kom op de
wachtlijst terecht als een sessie vol zit.

BOEKINGEN
Een overzicht van je aankomende en afgelopen sessies, inclusief status
(geboekt, aanwezig geweest, no-show, geannuleerd). Zo weet je altijd waar
je aan toe bent, ook met terugwerkende kracht.

LIDMAATSCHAP
Bekijk je huidige abonnement, resterende ritten of PT-sessies, en je
gastenpassen. Vraag een pauze aan of zeg je lidmaatschap zelf op — direct
vanuit de app, zonder gedoe.

BETALINGEN
Volg de status van je betalingen en je machtiging, zodat je nooit voor
verrassingen komt te staan.

SUPPORT
Vraag over je boeking, lidmaatschap of iets anders? Bereik ons rechtstreeks
via WhatsApp, telefoon of e-mail, of raadpleeg de veelgestelde vragen.

Deze app is uitsluitend voor bestaande leden van The Movement Club
(Industrieweg 14P, Loosdrecht). Nog geen lid? Kijk op
themovementclub.nl voor meer informatie en een gratis Mobility Check.
```

(± 1.450 tekens — ruim binnen de 4.000-tekenlimiet van beide stores.)

---

## Keywords (Apple, max. 100 tekens, komma-gescheiden, geen spatie na komma)

```
personal training,boutique gym,Loosdrecht,yoga,mobility,kettlebell,small group,ledenapp,fitness
```

95 tekens. Gebaseerd op de daadwerkelijke pijlers uit
`src/lib/member/plan-coverage.ts` (`PILLAR_LABELS`: Vrij trainen, Yoga &
mobility, Kettlebell, Kids, Senior) en de positionering/locatie uit
`CLAUDE.md` ("boutique", "small group", Loosdrecht). Google Play heeft geen
apart keywords-veld — daar werkt alleen de short/full description mee voor
vindbaarheid, dus geen aparte lijst nodig voor die store.

---

**Bronnen (opgezocht juli 2026):**
- [App Store Connect Character Limits — Complete Reference (2026)](https://www.appconnecttranslate.com/tools/app-store-character-limits/)
- [App information — App Store Connect Help (Apple)](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)
- [App Store Promotional Text: The 170-Character Evergreen Field](https://pushmyapp.ai/blog/app-store-promotional-text-guide)
- [Best practices for your store listing — Play Console Help](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)
- [How to Write the Perfect Google Play Short Description](https://trysonar.app/blog/google-play-short-description)
