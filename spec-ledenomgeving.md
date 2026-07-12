# Spec: Ledenomgeving (volledige inventarisatie + build-plan)

## Status

**IN OPBOUW — inventarisatie compleet, enkele besluiten genomen, nav-landing en discovery-punten open.**
Datum: 2026-07-10.

UPDATE 2026-07-12: de GEDEELDE LIFECYCLE-PRIMITIEVEN-LAAG IS COMPLEET (klantbeheer-workstream,
discovery `discovery-klantbeheer-lifecycle.md`): fase 1 pauze/hervat (PR #88, `688b5ba`), fase 2A
admin-stop (PR #89, `893106f`) en fase 2B change-requests plus e-mailcorrectie (branch
`feat/lifecycle-change-requests-email`). Alle beleid leeft in SECURITY DEFINER RPC's
(`admin_pause_membership`, `admin_resume_membership`, `admin_cancel_membership`,
`request_membership_change`, `cancel_membership_change_request`, `admin_correct_customer_email`)
met TS-orkestratie in `src/lib/admin/membership-lifecycle.ts`. De latere Sonnet-voorkanten
(admin-UI en de lid-facing Stap 2 hieronder) zijn dunne aanroepers van die laag en nemen zelf
geen lifecycle-beslissingen.

Doel van dit document: de *hele* member-omgeving (`/app`) in kaart brengen voordat we losse
pagina's bouwen, zodat we niet per feature vastlopen op aannames die elders al anders besloten zijn.
Dit document is de koepel. Bestaande specs blijven leidend voor hun eigen onderdeel
(`spec-member-app.md` voor fasering/Akiles, `spec-community-growth.md` voor trial/milestone/social,
`spec-membership-flow.md` voor WS-4/checkout, `spec-trainingsprotocol.md` voor schema's).

Werkwijze-afspraak (2026-07-10): eerst HTML-mockups, door Ilja approven, dan pas CC/productie.
Prijzen en regels uitsluitend uit `tmc.catalogue` (DB is single source of truth). Mockups zijn puur
layout/UX en wijzigen nooit prijzen of regels. Geen em dashes. User-facing Dutch copy gemarkeerd
`// COPY: confirm met Marlon`.

---

## 1. Volledige inventarisatie van ledenfunctionaliteit

Onderverdeeld naar status: BESTAAT (live), SCHEMA-LIVE (DB klaar, app-laag mist), NIEUW (nog te
ontwerpen), en ELDERS (leeft in andere spec, raakt het lid).

### 1.1 Boeken en aanwezigheid
- **Rooster** (`/app/rooster`) — BESTAAT. Week-view, boeken, filter-chips per pillar. Landing page.
- **Mijn lessen** (`/app/boekingen`) — BESTAAT. Komend, historie, wachtlijst-status.
- **Vrij Trainen** (`/app/vrij-trainen`) — BESTAAT. Conditioneel nav-item (alleen als membership
  `covered_pillars` vrij_trainen bevat). Eigen dagselector, eligibility-states.
- **Wachtlijst** — BESTAAT (volledig: `waitlist_entries`, promote-cron, email+push, UI in rooster
  en boekingen). Geen werk nodig.
- **Check-in / aanwezigheid** — BESTAAT (model: `bookings.attended_at` + `check_ins`. Let op:
  status `attended` bestaat NIET als geldige booking-status).

### 1.2 Lidmaatschap, bezit en status
- **Lidmaatschap** (`/app/abonnement`) — BESTAAT. Abbo-overzicht, facturen als subpagina.
- **Tegoed / rittenkaarten** — NIEUW (app-laag). PT- en Duo-saldo, "koop bij". Of het credits-model
  al in de DB bestaat is een DISCOVERY-punt (zie §4).
- **Kopen / losse producten** — NIEUW. Drop-in, 10-rittenkaart, PT-kaart, Duo-kaart. One-off Mollie
  (crowdfunding-checkout-patroon, niet de SEPA-mandate flow).
- **Lidmaatschap-status** — NIEUW (weergave). Actief tot / gepauzeerd tot / loopt af op.
  Pauze-flow bestaat al in admin.
- **Betalingen / facturen** — BESTAAT. Subpagina onder Lidmaatschap.
- **Abonnement wisselen** — NIEUW (app-laag). ALLEEN UPGRADEN via self-service (bijv. 2x naar
  Onbeperkt, of All Access toevoegen). DOWNGRADEN kan NIET via het lid: geen self-service pad omlaag.
  Binnen een jaar-commitment kan sowieso niet naar flex gewisseld worden (bestaande regel). Overgang
  loopt via `membership_change_requests` op de volgende factuurdatum, geen proratie. Leeft op de
  Lidmaatschap-pagina. UPDATE 2026-07-12: de backend bestaat (lifecycle fase 2B): tabel plus
  `request_membership_change` (eigenaar of admin, alleen-upgrade, catalogusprijs) en verwerking op
  de factuurdatum; de UI is een dunne aanroeper van `requestMembershipChangeCore`.
- **Opzeggen / pauzeren (lid-facing)** — NIEUW (app-laag). Gevoeligste moment van de hele omgeving
  (jaar-commitment, geen restitutie bij 24 maanden). UPDATE 2026-07-12: de gedeelde
  lifecycle-primitieven-laag (Stap 3-fundament) is live (PR #88, merge `688b5ba`): pauze/hervat-
  RPC's met Mollie-stop op cyclus-einde en mandaat-check bij hervatten; lid-opzeggen
  (`request_membership_cancellation` + process-cancellations cron) was al live. De blokkade uit
  §5.8 is daarmee opgeheven; de lid-voorkant bouwt als dunne aanroeper op deze RPC-laag. Pauze
  blijft beleidsmatig admin-only (het lid doet een aanvraag). Hoort op de Lidmaatschap-pagina,
  met dezelfde zorg als de koop-flow.

### 1.3 Training en voortgang
- **Trainingsschema** (`/app/schema` of onder een schema-route) — SCHEMA-LIVE. Volledige
  trainingsprotocol-stack bestaat in DB (tabellen + RPCs: activate/duplicate_training_program,
  start_workout_session, log_set, complete_workout_session). App-laag (read-path, log-UI,
  admin-schermen) nog te bouwen. Conditioneel nav-item.

### 1.4 Account
- **Onboarding / eerste-keer-staat** — NIEUW. Eerste login van een nieuw lid, gemigreerde
  crowdfunding-backer of geconverteerde proefles-bezoeker: lege omgeving, geen historie, intake
  mogelijk nog niet af. Bepaalt of iemand het snapt of afhaakt. Geen aparte pagina per se, maar een
  expliciete eerste-keer-staat (o.a. op de landing) die ontworpen moet worden.
- **Profiel** (`/app/profiel`) — BESTAAT. Gegevens, health intake, marketing opt-in, account
  verwijderen (soft delete + grace).
- **Health intake** — BESTAAT. Let op: kan boeken blokkeren tot compleet (DISCOVERY: geldt die gate
  nog?).
- **Support** — BESTAAT (vermeld in fase 1 member-app).

### 1.5 Elders belegd, raakt het lid (uit spec-community-growth.md)
- **Proefles-conversie** — trial-bezoeker zonder account converteert naar lid. DISCOVERY: komt
  proefles-historie mee?
- **Milestone-notificaties** — 10/25/50/100 lessen + jubilea. Gated op Firebase-project
  (`tmc-member-app`, bestaat nog niet; push is silent no-op tot dan).
- **Sociale zichtbaarheid** ("wie komt er") — opt-in, default off, contextueel gepresenteerd.

### 1.6 Toegang (fysiek)
- **Verlengde toegang 06:00-23:00** — via Akiles. Entitlement bij All Access Onbeperkt (gratis) of
  €10 add-on. KRITISCH: de app-weergave en de Akiles-group moeten dezelfde bron delen, anders
  belooft de app toegang die de deur niet geeft.

### 1.7 Bekend, maar bewust NIET nu (scope-bewaking)
- **Notificatie-voorkeuren** — zodra push live gaat (milestones, reminders, waitlist) wil een lid
  kunnen kiezen wat het krijgt, anders zet iemand bij irritatie alles uit via het OS en mist ook de
  belangrijke meldingen. Hoort later bij Profiel. Klein, niet nu.
- **Introducé / referral** — genoemd in `spec-member-app.md` fase 4 ("eventueel referral"). Raakt de
  Kopen- en lidmaatschap-laag als het komt. Nu alleen markeren zodat het datamodel er niet tegenaan
  botst; niet bouwen.

---

## 2. Functionaliteit per lidmaatschap (audit-tabel)

Abonnementsrecht vs losse kaarten. All Access = Groepslessen + 30 euro add-on voor altijd-onbeperkt
Vrij Trainen (niet frequentie-gebonden). Alle prijzen/frequenties uit `tmc.catalogue`.

| Functionaliteit            | Groepslessen 2x/3x/onbep. | All Access        | PT-kaart | Duo-kaart | 12-weken programma        |
|----------------------------|---------------------------|-------------------|----------|-----------|---------------------------|
| Groepslessen boeken        | ja (naar frequentie)      | ja                | nee      | nee       | ja (tijdens)              |
| Vrij Trainen               | los erbij                 | ja onbeperkt      | nee      | nee       | bonus per spoor           |
| Verlengde toegang          | 10 euro add-on            | gratis bij Onbep. | nee      | nee       | nee                       |
| Personal Training          | nee                       | nee               | ja saldo | nee       | ja (2x/week in programma) |
| Duo Training               | nee                       | nee               | nee      | ja saldo  | nee                       |
| Trainingsschema            | nee                       | nee               | ja       | ja        | ja                        |
| Rooster / Mijn lessen      | ja                        | ja                | ja       | ja        | ja                        |
| Lidmaatschap / facturen    | ja                        | ja                | ja       | ja        | ja                        |

Kernregel: een schema hangt aan een actief trainingsprotocol (PT of 12-weken), niet aan het abonnement.

Wisselen: alleen upgraden via self-service; downgraden kan niet via het lid. Binnen jaar-commitment
geen wissel naar flex. Opzeggen/pauzeren lid-facing is geblokkeerd tot de lifecycle-fix live is.

---

## 3. Navigatie-structuur

Bestaande member-shell (`MemberNav.tsx`): top-nav desktop, bottom tab bar mobiel. Vandaag 4 vaste
items plus 1 conditioneel (Vrij Trainen). Elke pagina hieronder leeft BINNEN deze shell en brengt
geen eigen chrome mee.

### 3.1 Vaste items
- Rooster (`/app/rooster`) — landing. BESLOTEN: Rooster blijft de landing.
- Mijn lessen (`/app/boekingen`)
- Lidmaatschap (`/app/abonnement`)
- Profiel (`/app/profiel`)

### 3.2 Conditionele items (zelfde patroon als Vrij Trainen)
- Vrij Trainen — zichtbaar bij vrij_trainen-entitlement.
- Schema — zichtbaar zodra lid ooit een protocol had en nog lid is. BESLOTEN.

### 3.3 BESLOTEN, maar HEROPEND (zie §8 punt 1): het "overzicht" wordt de uitgebreide Lidmaatschap-pagina (optie A)
Rooster blijft de landing. Het overzicht (tegoed + status + entitlements + schema-teaser) is geen
dagelijkse actie maar een "hoe sta ik ervoor"-laag, en wordt daarom de uitgebreide Lidmaatschap-
pagina (`/app/abonnement`): abbo + status + tegoed + entitlements + schema-teaser + facturen-subpagina.
Geen vijfde vast nav-item. Schema blijft een apart conditioneel item omdat het een werkplek is
(loggen), niet alleen overzicht.

Reden voor A boven een los "Overzicht"-item: op mobiel is 5 items de bovengrens in de bottom tab
bar, en Vrij Trainen + Schema zijn al conditionele items die om die ruimte concurreren. A houdt de
nav op 4 vaste items.

---

## 4. Besluiten (2026-07-10)

1. **Schema-historie:** blijft zichtbaar; Schema-tab verdwijnt pas bij opzegging lidmaatschap.
   Menu-conditie = "ooit protocol gehad EN nog lid". Log-functie alleen bij actief protocol; na
   afloop historie read-only.
2. **Lege/verlopen kaart:** tegoed-blok blijft altijd staan, nudge vanaf de laatste rit, lege staat
   bij 0. Ruimte voor "geldig tot"-regel voorzien in de UI.
3. **Lidmaatschap-status:** één dynamische regel op het overzicht (actief tot / gepauzeerd tot /
   loopt af op). Volledige voorwaarden + knoppen op de Lidmaatschap-pagina.
4. **Duo = PT met introducé.** Zelfde mechaniek als PT (tegoed-blok, saldo, koop bij). De introducé
   is een boek-detail, niet iets wat het overzicht oplost. Bewust simpel gehouden.
5. **Rooster blijft landing page.**
6. **Entitlement-weergave:** actief + maximaal 1 relevante upsell (Duo), rest in Kopen. Geen volle
   locked-lijst. Typografische lijst, geen iconen.
7. **Nav-landing (optie A):** overzicht wordt de uitgebreide Lidmaatschap-pagina, geen vijfde
   nav-item. Rooster blijft landing. HEROPEND bij de mockup-review van 2026-07-12 (zie §8 punt 1).

---

## 5. Discovery-punten (CC verifieert vóór bouw)

Geen aannames; dit moet CC uitzoeken tegen de live DB en bestaande specs:

1. **Credits/tegoed-model:** bestaat er al een saldo-administratie per lid per rittenkaart die
   afboekt bij gebruik (`book_pt_credits`, `pt_package`-activatie uit WS-2 zijn genoemd)? Of moet
   dit gebouwd worden? Impact op of "Mijn tegoed" een read is of nieuw model.
2. **WS-4 volgorde:** raakt dit lopende werk in `spec-membership-flow.md`? Moeten openstaande WS-4/
   WS-5-taken eerst af? Dit is HIGH IMPACT en kan eerder werk overschrijven.
3. **Kaart-houdbaarheid:** verlopen rittenkaart-credits (houdbaarheidsdatum) ja/nee?
4. **Akiles-bron:** deelt de entitlement-weergave dezelfde bron als de Akiles-group/schema, zodat
   app-belofte en deur-gedrag niet uiteenlopen?
5. **Proefles-conversie:** komt trial-historie mee bij conversie naar lid?
6. **Health-intake-gate:** blokkeert onvoltooide intake nog steeds boeken? Zo ja, prominenter tonen
   dan een overzicht-regel.
7. **Duo-boeken:** loopt het "koop Duo-kaart"-pad door naar het meenemen van een tweede persoon
   (guest_bookings-patroon), of stopt het bij het saldo?
8. **Lifecycle-fix status:** is de fix (booking/membership status naar `cancelled` + Mollie-stop)
   al live? Dit blokkeert het lid-facing opzeggen/pauzeren. Zo niet, moet dat eerst.

---

## 6. Build-plan (voorstel, volgorde na discovery)

Model-allocatie: Fable voor security/RPC/migratie/Mollie-mandate/pricing-correctness; Sonnet voor
implementatie zodra designs locked. Elke stap: eerst mockup approven (afspraak 2026-07-10).

**Stap 0 — Discovery (Fable).** Beantwoord alle §5-punten tegen de live DB. Expliciete STOP na
discovery. Bepaalt of credits gebouwd moeten worden en of WS-4 eerst af moet. Geen code.

**Stap 1 — Nav-landing besluit + shell.** Beslis §3.3 (A of B). Voeg conditioneel Schema-item toe
volgens het Vrij-Trainen-patroon. Klein, Sonnet.

**Stap 2 — Overzicht/Lidmaatschap-pagina (Sonnet, na mockup-approval).** Status-regel, entitlement-
lijst, schema-teaser (conditioneel), tegoed-blok (read-only als model bestaat). Deze pagina is de
thuisbasis (optie A), dus in één keer goed ontwerpen: naast weergave ook de acties wisselen (alleen
upgrade), pauzeren en opzeggen. Opzeggen/pauzeren lid-facing pas activeren als de lifecycle-fix live
is; tot dan de UI voorbereiden maar de actie gated houden. Koop-mechaniek voor losse producten hoort
niet hier (dat is Stap 3), alleen abbo-wijziging.

**Stap 3 — Tegoed + Kopen (Fable waar Mollie/afboeking geraakt wordt).** Alleen ná discovery-
uitkomst. One-off Mollie voor losse producten. Saldo-weergave + koop-bij. Nudge/lege-staat logica.

**Stap 4 — Schema app-laag (Sonnet, apart traject).** Read-path + log-UI op de bestaande RPC's.
Historie read-only na afloop. Eigen mockup-ronde; dit is groter dan de overige stappen.

**Stap 5 — Milestone-push (gated).** Pas na Firebase-project (`tmc-member-app`, europe-west4).
Detectie mag eerder gebouwd, maar produceert stil niets tot het project bestaat. Expliciet vermelden.

**Buiten dit plan (eigen sporen):** proefles-booking en social-visibility uit
`spec-community-growth.md`; Akiles-integratie uit `spec-member-app.md` fase 3.

---

## 7. Open vragen voor Ilja

1. AKKOORD (2026-07-10): discovery-first volgorde met Stap 0 als harde STOP voordat er iets gebouwd
   wordt.
2. Inventarisatie (§1) aangevuld met onboarding, abonnement-wisselen (alleen upgrade, geen
   downgrade) en opzeggen/pauzeren lid-facing. Notificatie-voorkeuren en referral als "bekend, niet
   nu" (§1.7). Nog te bevestigen of dit nu compleet is.

---

## 8. Open UI-besluiten (te behandelen voor de lid-facing Stap 2 bouw)

Verzameld bij de mockup-review (2026-07-12); lijst is nog OPEN en kan groeien bij de UI-doorloop.

1. **Landing vs Lidmaatschap-pagina (heropent §3.3):** is het overzicht (begroeting, eerstvolgende
   les, tegoed, schema-teaser, entitlements) de uitgebreide Lidmaatschap-pagina onder
   `/app/abonnement` (huidig besluit optie A, Rooster blijft landing), of wordt het een
   home-dashboard als nieuwe landing? De mockup toont overzicht-inhoud met Rooster als actief
   nav-item, wat A tegenspreekt. Keuze raakt de nav-highlight en mogelijk de nav-structuur.
2. **Entitlement-model in "In jouw lidmaatschap":** tonen we PT en Trainingsschema als
   entitlement-regel ("Actief"), of eruit conform de kernregel §2 (schema hangt aan een actief
   protocol, PT loopt via credits, geen van beide is een abonnementsrecht)? PT staat in de mockup
   dubbel: als tegoed-blok en als entitlement-regel.
3. **Nav mobiele cap:** 4 vaste items + 2 conditionele (Vrij Trainen EN Schema) = 6, over de 5-cap
   in de bottom tab bar. Hoort bij het uitgestelde navigatie-project. De overzichtspagina blijft
   binnen de bestaande shell en behandelt de nav als out-of-scope; geen stil vijfde/zesde item
   toevoegen.
4. **Kleiner:** tijd-van-dag-dynamische begroeting; avatar-initialen afgeleid van de echte naam
   (mockup toont MJ bij Mila).

Uit de lifecycle-primitieven (fase 1, PR #88 merge `688b5ba`), mee te nemen in de UI-fase:

5. **Pauze terugdraaien voor ingang:** geannuleerde venster-boekingen komen niet automatisch terug,
   het lid moet opnieuw boeken. Vereist een expliciete waarschuwing op het admin-scherm. Geen
   backend-werk.
6. **Geen hervat-cron (per beleid handmatig):** een open pauze blijft staan tot admin hervat. Later
   een admin-overzicht "gepauzeerde leden en sinds wanneer" zodat langlopende, niet-incasserende
   pauzes zichtbaar worden. Parkeren, niet nu bouwen.
