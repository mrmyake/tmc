# Spec: /kettlebell content-cluster (themovementclub.nl)

> Standalone spec. Bedoeld om los gedraaid te worden in Claude Code. Alle universele
> projectregels staan onderaan ingebed, zodat dit bestand zelfstandig bruikbaar is.

## 0. Doel in één zin

Bouw een SEO-gericht /kettlebell content-cluster op het hoofddomein dat lokale
zoekintentie ("kettlebell training Loosdrecht" en regio het Gooi) afvangt, Marlon's
Kettlebell Master-autoriteit etaleert, en bezoekers naar het lopende kettlebell-traject
leidt (meerdere groepslessen per week).

Strategische keuze (vastgelegd): kettlebell is kern, geen wedge. Daarom GEEN los
domein en GEEN semi-aparte identiteit zoals yoga, maar een cluster dicht tegen het
hoofdmerk aan, dat domeinautoriteit consolideert.

---

## 1. Verplichte discovery-stap (eerst doen, dan stoppen)

Schrijf nog geen code. Rapporteer eerst wat je vindt en wat je plan is, en wacht op go-ahead.

Verifieer concreet:

1. **Hoe is /yoga technisch opgebouwd?** Route-structuur, layout, metadata-aanpak,
   structured data, en hoe content (rooster, docenten) wordt ingeladen (hardcoded vs Sanity).
   Dit cluster spiegelt dat patroon waar logisch, met de afwijkingen uit deze spec.
2. **Bestaat er al een rooster/schedule-schema in Sanity** (project `hn9lkvte`, dataset
   production) dat lestijden bevat? Zo ja, hergebruik dat voor het kettlebell-rooster in
   plaats van een nieuw model. Zo nee, zie sectie 7.
3. **Welke CTA-flow gebruikt /yoga nu?** (MailerLite-waitlist, MailerSend, of iets anders.)
   De kettlebell-CTA spiegelt de yoga-aanpak tenzij sectie 8 anders zegt.
4. **Bestaat de design system skill** `~/.claude/skills/the-movement-club-design/` en welke
   componenten/tokens levert die voor hero, kaarten, secties en CTA-blokken?
5. **Bestaat er reeds een Service/LocalBusiness JSON-LD helper** in de codebase die je kunt
   uitbreiden in plaats van dupliceren?

Rapporteer per punt: gevonden / niet gevonden + voorgesteld pad. Dan stoppen.

---

## 2. URL-structuur en cluster-architectuur

```
/kettlebell                         → pillar page (het traject + commerciële intentie)
/kettlebell/wat-is-kettlebell-training  → informational (top-funnel, kennisautoriteit)
/kettlebell/voor-beginners          → informational/commercieel (drempel wegnemen)
```

Fasering:
- **Fase 1 (deze PR's):** pillar page + `/kettlebell/wat-is-kettlebell-training`.
- **Fase 2 (later, aparte PR):** `/kettlebell/voor-beginners`.

Eén PR per pagina, conform projectconventie.

Rationale clustermodel: de pillar vangt commerciële, lokale intentie; de informational pagina
vangt top-funnel kennisvragen ("wat is kettlebell training", "kettlebell oefeningen") en linkt
intern naar de pillar. Google leest dit als thematische autoriteit rond kettlebell, niet als losse
pagina's.

---

## 3. Doelzoektermen per pagina

Mijn inschatting komt uit SEO-principes, niet uit jullie volumecijfers. Valideer de
exacte termen tegen Search Console + Keyword Planner zodra er data is; dit is de
werkhypothese om mee te starten.

### Pillar /kettlebell
- Primair: `kettlebell training Loosdrecht`
- Secundair: `kettlebell les Loosdrecht`, `kettlebell groepstraining`, `kettlebell traject`
- Proximity (regio, zonder locatie te verdraaien): `kettlebell training regio Hilversum`,
  `kettlebell vlakbij Hilversum`, `kettlebell het Gooi`

### /kettlebell/wat-is-kettlebell-training
- Primair: `wat is kettlebell training`
- Secundair: `kettlebell oefeningen`, `voordelen kettlebell training`, `kettlebell voor kracht en mobiliteit`

### /kettlebell/voor-beginners (fase 2)
- Primair: `kettlebell voor beginners`
- Secundair: `beginnen met kettlebell`, `kettlebell les voor beginners Loosdrecht`

Regel: één primaire zoekterm per pagina, geen kannibalisatie tussen pagina's. De pillar
claimt de lokale + traject-intentie; informational pagina's claimen kennis-intentie.

---

## 4. Pagina-opbouw pillar /kettlebell

Secties van boven naar beneden. Copy is Dutch. Alle wervende/feitelijke copy die met Marlon
moet worden afgestemd krijgt een `// COPY: confirm with Marlon`-flag in de code.

1. **Hero**
   - H1 met primaire zoekterm natuurlijk verwerkt, bv. "Kettlebell training in Loosdrecht".
   - Subkop die het traject en de groepsvorm noemt + proximity ("regio Hilversum, het Gooi").
   - Primaire CTA-knop (zie sectie 8).
   - `// COPY: confirm with Marlon` op H1 + subkop.

2. **Het traject** (kern van de pagina)
   - Uitleg van het lopende traject: meerdere groepslessen per week, doorlopend, in de
     Kracht-zone.
   - Groepsgrootte, niveau-aanpak, wat een les inhoudt.
   - `// COPY: confirm with Marlon` op trajectbeschrijving, groepsgrootte, niveaus.

3. **Rooster**
   - Toon de kettlebell-lestijden. Bron: Sanity indien rooster-schema bestaat (zie sectie 7),
     anders een tijdelijke hardcoded array met duidelijke `// COPY: confirm with Marlon`-flag
     op elke dag/tijd.
   - Toon dag, tijd, zone (Kracht).

4. **Waarom kettlebell** (voordelen, ondersteunt zoekterm + conversie)
   - Kracht, mobiliteit, full-body, tijdsefficiënt. Sluit aan op Movement/Mobility/Strength.

5. **Marlon / autoriteit (E-E-A-T)**
   - Kort blok: Kettlebell Master-certificering, ervaring. Dit is je sterkste, niet te
     kopiëren SEO-troef; geef het ruimte.
   - Link naar een uitgebreidere over-pagina indien aanwezig.
   - `// COPY: confirm with Marlon` op certificering-claims (exacte titel/instituut).

6. **Prijs**
   - Conventie: "per 4 weken", niet "per maand".
   - `// COPY: confirm with Marlon` op het bedrag. Laat het bedrag niet raden; placeholder met
     duidelijke flag tot Marlon bevestigt.

7. **FAQ** (levert FAQPage structured data, sectie 6)
   - 4 tot 6 vragen, bv.: heb ik ervaring nodig, wat moet ik meenemen, hoe vaak per week,
     is er een proefles, voor wie is het geschikt.
   - `// COPY: confirm with Marlon` op antwoorden.

8. **CTA-blok** (herhaling onderaan, zie sectie 8).

Internal links binnen de pillar: naar `/kettlebell/wat-is-kettlebell-training`, naar
personal training en/of de kracht-/hoofdpagina, en naar de over-Marlon pagina.

---

## 5. Pagina-opbouw /kettlebell/wat-is-kettlebell-training

Doel: top-funnel kennis afvangen en doorlinken naar de pillar.

1. H1 met primaire zoekterm ("Wat is kettlebell training?").
2. Heldere uitleg (oorsprong, principe, waarom het werkt voor kracht en mobiliteit).
3. Sectie kettlebell-oefeningen (swing, clean, press, Turkish get-up, snatch) op
   begrijpelijk niveau. Geen instructieve veiligheidsclaims die misleiden; houd het
   informatief.
4. Sectie voordelen.
5. Afsluitende sectie die natuurlijk doorlinkt naar de pillar: "Kettlebell training volgen in
   Loosdrecht" met interne link naar /kettlebell.
6. FAQPage structured data op een paar kennisvragen.

`// COPY: confirm with Marlon` op vakinhoudelijke beschrijvingen (Marlon is de expert; laat
hem de oefening-uitleg valideren).

---

## 6. Technische implementatie

Stack (vast): Next.js 15 App Router, Tailwind 4, TypeScript, Framer Motion, shadcn/ui,
Sanity (`hn9lkvte`/production), Vercel, GA4 (`G-2VFCDM4KRZ`) met Consent Mode v2.

Per pagina:

- **Metadata API** (`generateMetadata` of `metadata` export): unieke title + description per
  pagina met de primaire zoekterm. Title-patroon: `Kettlebell training Loosdrecht | The Movement Club`.
- **Canonical** per pagina; voorkom dat varianten naar elkaar kannibaliseren.
- **OG/Twitter tags** met passende afbeelding (kracht-zone of kettlebell, geen yoga-beeld).
- **Structured data (JSON-LD):**
  - Pillar: `Service` (kettlebell-traject) gekoppeld aan de bestaande `LocalBusiness`/
    `SportsActivityLocation` entiteit, plus `FAQPage` voor de FAQ-sectie.
  - Informational pagina's: `FAQPage` op de kennisvragen.
  - Hergebruik een bestaande JSON-LD helper indien gevonden in discovery; anders maak één
    herbruikbare helper, niet per pagina dupliceren.
- **Headings:** exact één H1 per pagina, logische H2/H3-hiërarchie met zoektermen natuurlijk
  verwerkt (geen keyword stuffing).
- **Afbeeldingen:** `next/image`, betekenisvolle alt-teksten in het Nederlands met natuurlijke
  zoekterm-context. Hergebruik geen yoga-beeld; gebruik kracht-zone/kettlebell-beeld.
- **Sitemap:** voeg de nieuwe routes toe aan de bestaande sitemap-generatie zodat ze in
  `sitemap.xml` verschijnen (de sitemap moet sowieso nog naar Search Console; los van deze PR).

---

## 7. Content-bron (Sanity vs hardcoded)

Beslisregel:
- **SEO-tekstcontent** (uitleg, voordelen, FAQ): mag in de route hardcoded, net als een
  landingspagina. Het hoeft niet vaak te wijzigen en hoort bij de paginastructuur.
- **Rooster en prijs:** liefst uit Sanity zodat Marlon kan wijzigen zonder deploy.
  - Als discovery een bestaand rooster-schema vindt: hergebruik dat, filter op kettlebell/zone Kracht.
  - Als er geen rooster-schema is: bouw NU geen volledig nieuw CMS-model in deze PR. Gebruik een
    tijdelijke, duidelijk geflagde hardcoded array, en noteer "Sanity rooster-singleton" als
    aparte vervolg-PR. Niet scope creepen.

Rapporteer in discovery welk pad geldt.

---

## 8. CTA en conversie

Open beslissing (flag voor Ilja + Marlon): is kettlebell al **boekbaar** of nog **pre-launch**?

- Het member-/boekingssysteem staat nog op branch `pr3e-wip-slim-bookings-status`, niet
  gemerged. Tot dat live is, spiegelt de kettlebell-CTA de yoga-aanpak: een
  waitlist/aanmelding via MailerLite (interesse + e-mail), niet een directe boeking.
- Bouw de CTA-component zo dat de bestemming één configuratiepunt is (waitlist-form nu,
  directe boeking later), zodat omschakelen na merge triviaal is.

`// COPY: confirm with Marlon` op CTA-tekst. Default-aanname: waitlist. Bevestig of dat klopt.

---

## 9. Tracking (GA4)

- Pageview's lopen via bestaande GA4-setup; geen extra werk indien dat al automatisch gaat.
- Voeg een custom event toe op CTA-klik (bv. `kettlebell_cta_click`) met paginanaam als
  parameter, conform de manier waarop /yoga events stuurt (spiegel die implementatie).
- Respecteer Consent Mode v2; geen tracking voor consent.

---

## 10. Open vragen (afstemmen met Marlon voor publicatie)

1. Exacte lestijden van het kettlebell-traject (dagen + tijden).
2. Groepsgrootte (max aantal deelnemers per les).
3. Niveau-aanpak: gemengd niveau of aparte beginners-instroom?
4. Prijs per 4 weken (en of het los te boeken is of onderdeel van lidmaatschap).
5. Exacte certificering-titel + instituut voor het autoriteitsblok.
6. CTA-keuze: waitlist (pre-launch) of directe boeking (na PR3e-merge)?
7. Beeldmateriaal: bestaat er bruikbare kettlebell/kracht-fotografie, of is een shoot nodig?

---

## 11. Acceptatiecriteria

- [ ] Pillar `/kettlebell` en `/kettlebell/wat-is-kettlebell-training` renderen, build groen.
- [ ] Elke pagina heeft unieke title/description/canonical met de juiste primaire zoekterm.
- [ ] Valide JSON-LD (Service + FAQPage waar van toepassing), getest in Rich Results Test.
- [ ] Exact één H1 per pagina; logische heading-hiërarchie.
- [ ] Interne links tussen cluster en pillar aanwezig en wederkerig waar logisch.
- [ ] Nieuwe routes staan in `sitemap.xml`.
- [ ] Alle af te stemmen copy gemarkeerd met `// COPY: confirm with Marlon`.
- [ ] CTA-bestemming via één configuratiepunt schakelbaar.
- [ ] Geen em dashes in code of copy. Prijs als "per 4 weken".
- [ ] Geen yoga-beeld hergebruikt.

---

## Universele projectregels (ingebed, zodat deze spec standalone is)

- **Taal:** alle user-facing copy in het Nederlands.
- **Geen em dashes** (--) waar dan ook. Gebruik komma's, puntkomma's, dubbele punt, of
  herstructureer de zin. Geldt voor code, copy en documentatie.
- **Prijsconventie:** "per 4 weken", nooit "per maand".
- **Copy-afstemming:** alles wat Marlon moet bevestigen krijgt `// COPY: confirm with Marlon`.
- **Workflow:** verplichte discovery/verificatie-stap voor er code wordt geschreven; rapporteer
  bevindingen en plan, stop dan voor go-ahead.
- **Granulariteit:** één PR per scherm/feature.
- **Design system:** gebruik tokens uit `~/.claude/skills/the-movement-club-design/`.
  Warm black `#0E0C0B`, Stone 100 `#F4EFE6`, Champagne `#B9986A`. Fraunces (display),
  Inter (body).
- **Merkpositionering:** Movement / Mobility / Strength is kern. Kettlebell hoort bij die kern,
  dicht tegen het hoofdmerk; geen aparte merkidentiteit zoals yoga (dat is de wedge).
- **Geo-strategie:** "kettlebell Loosdrecht" volledig claimen; Hilversum via proximity
  ("vlakbij Hilversum", "regio Hilversum", "het Gooi"), locatie niet verdraaien.
- **Stack:** Next.js 15 App Router, Tailwind 4, TypeScript, Sanity (`hn9lkvte`/production),
  Supabase, Vercel, GA4 (`G-2VFCDM4KRZ`) Consent Mode v2, MailerLite (marketing), Mollie
  (4-weken billing).
- **Repo:** github.com/mrmyake/tmc.
