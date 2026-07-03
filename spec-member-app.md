# Spec: Member App (iOS & Android) — The Movement Club

Status: concept, ter bespreking
Scope: app voor het lid (klant), niet de staff/kiosk-interfaces (die lopen via aparte tracks: Android kiosk per zone, iPad voor Marlon)

## 1. Doel en scope

Een mobiele app waarmee een TMC-lid: zijn rooster en boekingen beheert, zijn lidmaatschap en betalingen inziet, en straks de studio-deur opent via Akiles. Geen aparte codebase: de app is een schil rond de bestaande Next.js member-omgeving, niet een losse React Native-app. Dat sluit aan bij het punt dat al op de roadmap stond: PWA-laag met eventueel een Capacitor-wrapper.

Buiten scope van dit document: het admin-panel voor Marlon, de kiosk-tablets in de studio, en The Movement Method / Movement Profile (aparte productlijn, apart te behandelen).

## 2. Platformstrategie

**Aanbeveling: PWA-first, daarna Capacitor-wrapper voor de stores.**

| Optie | Voor | Tegen |
|---|---|---|
| **Capacitor rond bestaande Next.js app** (aanbevolen) | Eén codebase, hergebruikt alle bestaande Supabase-auth, RLS, server actions en boekingslogica; snelste pad naar App Store/Play Store aanwezigheid | Native modules (zoals Akiles) moeten via een plugin-brug; niet elke webfeature voelt 100% native |
| Losse React Native-app | Betere native feel, en Akiles heeft een officiële React Native SDK | Volledig aparte codebase, dubbel onderhoud, dubbele auth/booking-logica; niet realistisch voor een solo-ontwikkelaar naast de rest van de roadmap |
| Losse native apps (Swift/Kotlin) | Beste performance en native integratie | Twee volledig gescheiden codebases; buiten proportie voor deze schaal |

Capacitor kan de live Next.js-app laden via een remote URL (server mode) zodat de webcontent gewoon vanaf Vercel blijft draaien, met alleen de native plugins (push, Akiles, biometrie) lokaal in de shell-app. Dat past bij "single Next.js repo, single Vercel project" als uitgangspunt.

**Belangrijk aandachtspunt:** Akiles publiceert een officiële Cordova-plugin en losse iOS/Android SDK's, maar geen officiële Capacitor-plugin. Capacitor is doorgaans compatibel met Cordova-plugins, maar dit moet vroeg bevestigd worden met een kleine spike (zie fasering), niet pas aan het einde.

## 3. Functionaliteiten voor het lid

| Categorie | Functionaliteit | Fase |
|---|---|---|
| **Account** | Inloggen via magic link (MailerSend), profiel bewerken, taalkeuze indien relevant | 1 |
| **Rooster & boekingen** | Lesrooster per pijler (vrij trainen, yoga/mobility, kettlebell, kids, senior), les boeken/annuleren, wachtlijst, boekingshistorie | 1 |
| **Lidmaatschap** | Huidig abonnement inzien, check-in-historie, lidmaatschap opzeggen, pauzeren | 1* |
| **Betalingen** | Overzicht afschrijvingen (Mollie, per 4 weken), mislukte betaling herstellen, SEPA-mandaat beheren | 1 |
| **Toegang (Akiles)** | Studio-deur openen via app (BT/NFC/internet) | 3 |
| **Notificaties** | Push: les binnenkort, plek vrij op wachtlijst, betaling mislukt, opzegging is ingegaan, nieuws van Marlon | 2 |
| **Content** | Instructeursbio's, uitleg per pijler, kettlebell-contentcluster | 4 |
| **Voortgang** | Aanwezigheidsstreak, persoonlijke records (kettlebell) | 4 |
| **Support** | Contact, veelgestelde vragen, algemene voorwaarden | 1 |

\* De opzeg-flow in de app mag pas live zolang de lifecycle-fix (status → `cancelled` en Mollie-abonnement stoppen op de effectieve datum) nog niet gebouwd is; nu zet de app alleen `cancellation_requested`, zonder dat er iets automatisch stopt. Dit moet eerst gefixed zijn voordat dit stuk in de member app komt, anders erft de app een bekende bug.

Bewust **niet** in de member app: Sonos/verlichting-bediening (dat is staff-functionaliteit voor de iPad/kiosk's), en geen samenvoeging met TMM/Movement Profile totdat dat product zelf verder is uitgewerkt met Marlon.

## 4. Akiles-integratie (deur openen via de app)

Op basis van de actuele Akiles-documentatie:

- Akiles biedt twee integratiemodellen: **sync** (lid gebruikt de eigen Akiles-app/website via magic link) en **whitelabel** (volledig eigen ervaring in de TMC-app via de **Akiles Mobile SDK**). Voor "toegang tot het slot vanuit onze eigen app" is whitelabel de juiste keuze.
- De Mobile SDK ondersteunt ontgrendelen via internet, Bluetooth én NFC, en is nadrukkelijk de aanbevolen route boven het los aanroepen van de API vanaf een telefoon, voor betrouwbaarheid.
- Er bestaan officiële SDK's voor iOS, Android, React Native en Cordova. Voor de Capacitor-route is de Cordova-plugin het vermoedelijke aanknopingspunt (te verifiëren, zie fasering).
- Serverkant: de **Akiles API** (`api.akiles.app/v2`) beheert leden, groepen, rechten en toegangsmethodes via OAuth2 (Client ID/Secret via `support@akiles.app` of de contactpersoon `hello@akiles.app`). De Client Secret hoort alleen op de server (bijv. een Next.js server action of Supabase Edge Function), nooit in de app zelf.
- Rechten kunnen tijdgebonden ingesteld worden (`schedule_id`, `presence`) en per toegangsmethode aan/uit (online, bluetooth, mobiele NFC, pin, kaart). Dat maakt het technisch mogelijk om toegang te koppelen aan boekingen in plaats van aan altijd-open lidmaatschap.

**Open beslissing (met Marlon/Ilja af te stemmen):**
1. Toegangsbeleid: 24/7 toegang voor actieve leden binnen openingstijden, versus toegang die alleen actief is rond een geboekte les. Het tweede is veiliger en sluit beter aan bij het boekingssysteem, maar is complexer om te bouwen en te onderhouden.
2. Wie beheert het OAuth Client ID/Secret en de Akiles-organisatie: hangt samen met wie het Akiles-contract afsluit.
3. Bevestiging bij de verzekeraar dat de dekking standhoudt met een gemotoriseerd slot (staat al op de radar).

**Datamodel:** een koppeltabel `member_id` (TMC, Supabase) ↔ Akiles `member_id`, bijgewerkt via het bestaande `emitEvent()`-patroon zodra een lidmaatschap wordt aangemaakt, opgezegd of geannuleerd. Dat past in de bestaande event-driven aanpak in plaats van een losse synchronisatielaag ernaast.

## 5. Technische architectuur (hoofdlijnen)

```
Next.js 15 (App Router)
 └─ bestaande route group: member area (auth via Supabase, RLS)
     ├─ blijft de "single source of truth" voor UI en logica
     ├─ manifest.json + service worker → installeerbare PWA (fase 1-2)
     └─ Capacitor-shell (fase 2)
          ├─ laadt de live app via server.url (Vercel-deployment)
          ├─ Push Notifications plugin → Firebase Cloud Messaging (Android + iOS via APNs)
          │   (los van MailerLite/MailerSend, die blijven puur e-mail)
          └─ Akiles-plugin (Cordova-compat of eigen bridge) (fase 3)
               └─ praat met Akiles Mobile SDK, credentials via server-side proxy-endpoint
                   (Next.js server action of Supabase Edge Function met OAuth-token)
```

Belangrijkste nieuwe server-side stukken:
- Een "Akiles proxy"-laag die OAuth-tokens beheert en nooit de Client Secret aan de client blootgeeft
- Een koppeltabel in het `tmc`-schema tussen TMC-leden en Akiles-leden, bijgewerkt via bestaande events
- Een push-notificatieservice (device tokens opslaan, koppelen aan `member_id`, triggers vanuit bestaande boekings-/betalingsevents)

## 6. Fasering

**Fase 1 — PWA (na de lifecycle-fix en PR4-vervolg)**
Bestaande member-omgeving installeerbaar maken als PWA: rooster/boekingen, lidmaatschap-overzicht, betalingen-overzicht, support. Geen store-aanwezigheid nodig, wel al bruikbaar op telefoon.

**Fase 2 — Capacitor-wrapper en store-lancering — ✅ gebouwd, nog niet native geverifieerd**
Capacitor toegevoegd (PR #24-27, #28-30, #31), main bouwt en typecheckt schoon. Zie sectie 7 voor de punten die pas dichtgetimmerd zijn zodra er een machine met Xcode/Android Studio beschikbaar is; dit is nog geen "klaar voor livegang", wel "klaar om te verifiëren".

**Fase 3 — Akiles-toegang**
Kleine technische spike eerst: bevestigen of de Cordova-plugin werkt binnen Capacitor, of dat een eigen bridge nodig is. Pas daarna de volledige integratie bouwen: koppeltabel, server-side OAuth-proxy, toegangsbeleid implementeren zoals afgesproken in sectie 4.

**Fase 4 — Content, voortgang, community**
Instructeursbio's, contentcluster, aanwezigheidsstreak, eventueel referral.
Volledig uitgewerkt (UNDECIDED) in `spec-community-growth.md` — dat document vult deze
placeholder in, geen apart initiatief.

## 7. Open vragen & afhankelijkheden

- Lifecycle-fix (cancellation → cancelled + Mollie-stop) moet klaar zijn voordat opzeggen via de app live gaat
- Akiles: whitelabel-contract, Client ID/Secret eigenaarschap, toegangsbeleid (24/7 vs per boeking), verzekeraar-bevestiging
- Apple Developer Program (jaarlijks) en Google Play Console (eenmalig) accounts, eigenaarschap TMC B.V.
- Bevestigen of de Akiles Cordova-plugin daadwerkelijk binnen Capacitor werkt (spike vóór volledige bouw)
- Relatie met The Movement Method/Movement Profile: voorlopig bewust gescheiden houden
- Welke abonnementsvorm(en) recht geven op buiten-openingstijden-toegang (nog te bepalen, zie sectie 8)
- **Native compilatie/simulator-verificatie**: kon niet in de CC-sessie-omgeving; elke betrokken Fase 2-PR heeft een checklist klaarstaan voor een machine met Xcode/Android Studio, inclusief de Android-SW-bridge-check. Eerste concrete test zodra Xcode/Android Studio werken, niet iets om uit te stellen.
- **Webdir-laadscherm doet niets in server-mode**: PR #31 corrigeerde de PR1-aanname dat het handgeschreven laadscherm bij koude start getoond zou worden — in server-mode laadt de webview `server.url` direct, het laadscherm wordt nooit getoond. Het oorspronkelijke doel (merk-consistent scherm tonen, en het "blanco scherm bij geen netwerk"-probleem opvangen) is daarmee vermoedelijk onopgelost. Navragen bij CC of hier een andere oplossing voor is (bv. een `SplashScreen`-config die wél werkt in server-mode) voordat dit als afgerond geldt.
- **Mollie-betaalflows via `window.location.href`**: navigeert naar een ander origin; de huidige stopgap (`allowNavigation`) werkt, maar de robuuste fix (`@capacitor/browser`) is genoemd, niet gebouwd. Moet opgelost zijn vóór er met echte betalingen via de app gewerkt wordt.
- Firebase-project (`tmc-member-app`, `europe-west4`) bestaat nog niet, staat als `// COPY: confirm` in de code
- server.url-risicoprofiel (Apple-richtlijn 4.7.2) expliciet vastgelegd om te heroverwegen bij de start van Fase 3, want het risico wordt groter zodra Akiles' native BLE/NFC erbij komt

## 8. Buiten-openingstijden-toegang als abonnementskenmerk: taakverdeling Fable/Sonnet

Toegang buiten reguliere openingstijden wordt een kenmerk van bepaalde abonnementsvormen, nog te bepalen welke. Dat maakt dit twee soorten werk: een klein aantal beslissingen met echte consequenties (iemand krijgt 's nachts fysiek toegang tot het pand, of niet), en een grote hoeveelheid rechttoe-rechtaan implementatie zodra die beslissingen vastliggen.

Vuistregel voor de verdeling: het duurdere, meest capabele model (Fable) inzetten voor de kleine set beslissingen waar een denkfout duur is en waar het draait om afweging in plaats van volume; het workhorse-model (Sonnet, hetzelfde als in deze chat en in Claude Code) inzetten voor de bulk van de bouw zodra de spec eenduidig is. Dit is geen benchmark-claim, gewoon een kosten/batenverdeling naar type werk.

### Fase A — Beleid & risico-inventarisatie · **Fable**
- Kandidaat-tiers uitwerken die passen bij de vijf pijlers en de bestaande pricing ("per 4 weken"), bijvoorbeeld een split tussen een basisabonnement (alleen openingstijden) en een premium/unlimited-vorm (24/7)
- De aansprakelijkheids-/verzekeringsvraag expliciet maken: wie is verantwoordelijk als een lid zich 's avonds laat, alleen, zonder personeel, blesseert; dit is een vraag voor de verzekeraar en voor Marlon, niet iets wat in code wordt opgelost
- Het Akiles member_group-/schedule_id-model ontwerpen: welke groep krijgt een schedule dat buiten openingstijden geldig is, welke groep niet
- De revocatie-regel vastleggen gekoppeld aan de bekende lifecycle-bug: toegang moet direct vervallen bij downgrade of opzegging, niet pas aan het einde van de betaalperiode, anders houdt iemand fysieke toegang terwijl er niet meer betaald wordt
- Output: een korte keuzenotitie voor Marlon, en een eenduidige aanvulling op dit spec-document zodra de keuze gemaakt is, klaar om als Claude Code-prompt te dienen

### Fase B — Datamodel & sync · **Sonnet**
- Migratie: attribuut voor toegangsniveau op de membership-tabel in het `tmc`-schema
- Sync-logica die het Akiles `member_group` van een lid bijwerkt via het bestaande `emitEvent()`-patroon, bij aanmaak, upgrade, downgrade en opzegging
- Server-side Akiles OAuth-proxy endpoint (token-beheer, nooit de Client Secret naar de client)

### Fase C — App-UI · **Sonnet**
- "Deur openen"-knop tonen/verbergen op basis van het abonnement van het ingelogde lid
- Offline/BLE-fallback-UX
- Tests: check-in per tier, toegang direct weg na opzegging, toegang direct weg na downgrade

### Fase D — Beveiligingscheck vóór livegang · **Fable**
Eén gerichte reviewronde, geen doorlopende taak: bevestigen dat secrets nooit bij de client komen, dat revocatie daadwerkelijk de fysieke toegang intrekt en niet alleen de knop in de app verbergt, en dat de verzekeringsvraag uit Fase A daadwerkelijk beantwoord is voordat dit naar leden gaat.
