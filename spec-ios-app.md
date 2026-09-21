# Spec: iOS App launch-readiness (spec-ios-app.md)

## Status

**Concept, discovery afgerond (2026-09-19).** Dit is een cross-cutting launch-readiness document voor de iOS-wrapper (Capacitor). Het dupliceert bewust niet:

- `spec-member-app.md` blijft leidend voor platformstrategie, functionaliteit en fasering van de member-app als geheel.
- `spec-akiles-access.md` blijft leidend voor het bestaande Akiles-backendmodel (OAuth-tokenlaag, PIN- en magic-link-provisioning, nachtelijke sync, fail-closed `ends_at`-venster).

Dit document beschrijft alleen wat nog moet gebeuren om de iOS-wrapper daadwerkelijk in de App Store te krijgen en te houden, per workstream, met de status van vandaag inclusief bestandspaden en regelnummers uit de discovery op branch `chore/ios-app-discovery`.

---

## Ledger

Regel: elke PR die gedrag, schema of data raakt dat voor de iOS-wrapper relevant is, voegt hier in dezelfde PR een regel toe (PR-nummer, datum, wat er in één zin gewijzigd is, wat bewust niet is aangeraakt). Identificatie op PR-nummer, niet op squash-hash.

### Modeltoewijzing per workstream

Zelfde vuistregel als `spec-member-app.md` sectie 8: het duurdere, meest capabele model (Fable) voor de workstreams waar een denkfout duur is en het om afweging gaat in plaats van volume; het workhorse-model (Sonnet) voor de workstreams die vooral rechttoe-rechtaan bouwwerk zijn zodra de spec eenduidig is.

| Workstream | Model | Reden |
|---|---|---|
| A. Mollie in-app browser | Fable | Betaalflow; een denkfout in het return-to-app pad kan een mislukte of dubbele betaling opleveren. |
| B. Push pipeline | Sonnet | Vier concrete, onafhankelijk blokkerende bouwstappen (Firebase-project, native wiring, entitlement, env var), geen open beleidsvragen. |
| C. Build en signing | Sonnet | Accounts aanmaken en configureren, plus een concrete verificatiestap op een fysiek toestel; geen ontwerpbeslissing. |
| D. App Store compliance | Fable | Harde afwijzingsgronden bij de eerste review; de accountverwijderingsflow raakt drie systemen tegelijk (Akiles, Mollie, profiel) en een denkfout daar is duur. |
| E. Akiles app-toegang | Fable | Uitbreiding op een al bewust genomen besluit (2026-09-08); de open ontwerpvragen (tokenopslag, logout-gedrag, bridge-keuze) zijn afwegingen, geen bouwwerk. |
| F. Assets en versiebeheer | Sonnet | Niet-blokkerend bouwwerk zonder ontwerpvragen. |

`spec-ios-app.md` staat nog niet in de ledger-lijst in `CLAUDE.md` (die noemt op dit moment `spec-membership-flow.md`, `spec-ledenomgeving.md`, `spec-facturatie.md`, `spec-trainingsprotocol.md`, `spec-akiles-access.md` en `spec-community-growth.md`); dat toevoegen hoort bij een volgende PR.

**PR #190 (branch `docs/spec-ios-app`), 2026-09-19.** Naast het aanmaken van dit document bevat dezelfde PR een correctie in `spec-member-app.md` sectie 7: de verwijzing naar Apple-richtlijn 4.7.2 is vervangen door 4.2 (sub-guideline 4.2.2), met een voetnoot dat 4.7 over mini-apps en plug-ins gaat en hier niet van toepassing is. Reden: `spec-ios-app.md` workstream D.1 gebruikte al 4.2/4.2.2 als het correcte nummer voor het "remote URL/minimum functionality"-risico; twee verschillende richtlijnnummers voor hetzelfde risico in twee specs was verwarrend voor de volgende lezer. Bewust niet aangeraakt: verder niets in `spec-member-app.md`, geen code, geen migraties.

**PR #190, tweede commit, 2026-09-19: naamcorrectie Firebase-project.** Workstream B en `PushNotificationRegister.tsx:18-36` noemden `tmc-member-app` in regio `europe-west4` als voorgesteld Firebase-project; dat is gecorrigeerd naar `themovementclub`, zonder regio-eis. Reden: `europe-west4` was hier nooit een eis, de default Cloud-resource-locatie die je bij het aanmaken van een Firebase-project kiest, geldt alleen voor Firestore, Cloud Storage en App Engine, niet voor FCM (wereldwijde dienst zonder regiokeuze); die aanname stond fout in de oorspronkelijke discovery en is nu uit beide plekken gehaald. Workstream B kreeg er daarnaast twee expliciete stappen bij die in de eerdere versie ontbraken: de iOS-app in Firebase registreren met bundle id `nl.themovementclub.app` (moet exact gelijk zijn aan `capacitor.config.ts:20`), en `GoogleService-Info.plist` expliciet aan het Xcode-target toevoegen in plaats van alleen in `ios/App/App/` te plaatsen. Bewust niet aangeraakt: de logica in `PushNotificationRegister.tsx`, alleen de comment; geen code, geen migraties.

**PR #191 (branch `docs/ios-dsa-trader-status`), 2026-09-19.** Workstream D uitgebreid met D.3 (DSA trader status, in te vullen onder de organisatie, geblokkeerd op de organisatie-inschrijving in C) en D.4 (Mollie als verplichte betaalmethode onder guideline 3.1.3(e) en 3.1.3(d), geen in-app purchase, abonnementsflow blijft in de app); de C-regel in de sectie Afhankelijkheden noemt nu ook de identifier-migratie, het App Store Connect-record en DSA trader status, en het beslissingenlog kreeg twee regels. Dezelfde PR bevat een read-only discovery van de Mollie-terugkeerflow voor workstream A; de bevindingen staan in de PR-body, niet in dit document. Bewust niet aangeraakt: workstream A t/m C, E en F, geen code, geen migraties.

**PR #196 (branch `feat/mollie-return-flow`), 2026-09-20.** Workstream A gebouwd, alleen de terugkeerflow. `@capacitor/app` en `@capacitor/browser` toegevoegd (`cap sync` heeft `Package.swift`, `capacitor.build.gradle` en `capacitor.settings.gradle` bijgewerkt); custom scheme `nl.themovementclub.app` in `CFBundleURLTypes` (`ios/App/App/Info.plist`) en als VIEW-intent-filter in `AndroidManifest.xml`; geen universal links. De vijf call sites openen de checkout via `openCheckout()` (`src/lib/native/checkout.ts`): `Browser.open()` op native, `window.location.href` op web. De drie plekken die een redirectUrl bouwen krijgen een `returnTarget` ("web" of "app", een enum, nooit een URL) van de client en bouwen via `buildReturnUrl()` (`src/lib/native/return-url.ts`) op het custom scheme of https; de productflow draagt nu `&order=<id>`. `DeepLinkHandler` (root layout) vangt `appUrlOpen` en `getLaunchUrl()`, sluit de in-app browser en navigeert naar het pad uit de URL, dus ook na een koude start zonder state. `StatusPoller` pollt op de vier returnpagina's de databasestatus via server actions in `status-actions.ts` (3 s interval, 90 s timeout met melding en knop), en ververst de pagina zodra de status terminaal is. Bewust niet aangeraakt: `server.url` in `capacitor.config.ts`, de webhook en de activatieketen, schema en migraties, universal links (workstream C).

**PR #197 (branch `feat/ios-push-wiring`), 2026-09-20.** Workstream B gebouwd, de vier onafhankelijk blokkerende stappen. `GoogleService-Info.plist` toegevoegd aan `ios/App/App/` en expliciet aan het Xcode-target gekoppeld via de Resources build phase; `BUNDLE_ID` (`nl.themovementclub.app`) en `PROJECT_ID` (`themovementclub`) in het bestand geverifieerd tegen `capacitor.config.ts:20` en de spec, geen afwijking. `App.entitlements` aangemaakt met `aps-environment` op `development`, `CODE_SIGN_ENTITLEMENTS` in `project.pbxproj` wijst daarnaar in Debug en Release, Push Notifications-capability toegevoegd aan het target. FirebaseCore en FirebaseMessaging toegevoegd als remote Swift Package rechtstreeks op het App-target, los van `CapApp-SPM` (die staat onder Capacitor CLI-beheer en zou een handmatige toevoeging daar bij de volgende `cap sync` overschrijven). `AppDelegate.swift` initialiseert Firebase bij launch en geeft het ruwe APNs-devicetoken door aan `Messaging.messaging().apnsToken`; de FCM-registratietoken die daarna terugkomt via `MessagingDelegate` wordt doorgezet naar de Capacitor-bridge via `NotificationCenter` (`.capacitorDidRegisterForRemoteNotifications`), zodat `PushNotificationRegister.tsx` hem als `"registration"`-event ontvangt. Bewust de FCM-token, niet het ruwe APNs-token: `sendPushToProfile()` in `src/lib/push.ts` verstuurt via `firebase-admin/messaging`, dat FCM-tokens verwacht. De bestaande url/userActivity-forwarding in `AppDelegate.swift` is ongewijzigd. `.gitignore` blokkeert voortaan `*.p8`. Bewust niet aangeraakt: `FIREBASE_SERVICE_ACCOUNT_KEY` is niet in productie-omgevingsvariabelen gezet (live Vercel-wijziging, buiten scope), de zes server-side aanroeppunten in `src/lib/push.ts` zijn ongewijzigd, geen migraties, geen `db push`, het uploaden van de `.p8`-sleutel naar de Firebase Console is een handmatige stap die niet vanuit deze PR is gedaan.

**PR #198 (branch `feat/push-test-script`), 2026-09-20.** Verificatiehulpmiddel toegevoegd voor workstream B: `scripts/push/send-test.mts`, aan te roepen via `npm run push:test [email]` (default `me@ilja.com`). Laadt `.env.local`, stopt met een duidelijke melding als `FIREBASE_SERVICE_ACCOUNT_KEY` daar ontbreekt (los van de waarde in Vercel), zoekt het profiel en zijn device-tokens op in `tmc.device_push_tokens`, en verstuurt een testpush via de bestaande `sendPushToProfile()` uit `src/lib/push.ts`. Geen eigen Firebase-aanroep: het doel is `sendPushToProfile()` zelf testen. Per-token foutdetail (key/token/APNs) komt uit de bestaande `console.error()`-logging in `sendPushToProfile()` zelf, dit script herhaalt die niet. Bewust niet aangeraakt: `src/lib/push.ts` en de zes bestaande aanroeppunten, geen migraties, geen `db push`, geen env-bestanden.

**PR #206 (branch `feat/account-deletion-schema`), 2026-09-21.** Workstream D.2, PR 1 van de accountverwijdering: alleen schema en RPC. Tabel `tmc.account_deletions` (een rij per verwijderverzoek, status, `purge_after`, snapshot van Akiles-, Mollie- en MailerLite-ids plus het adres voor de afsluitmail, `step_status`/`last_error` per stap; RLS self-read en admin-all, schrijven alleen via service-role). `orders.created_by_profile_id` en `invoices.created_by_profile_id` (de aanmaker, niet de klant) naar ON DELETE SET NULL, met de provenance-check op orders verhuisd naar een insert-trigger en de onveranderlijkheidstrigger op facturen die de aanmaker van waarde naar null laat gaan. `admin_audit_log` kreeg een onveranderlijk `actor_label` (staf: naam en rol, lid: `lid <member_code>`) en pas daarna `admin_id` nullable met SET NULL. RPC `tmc.anonymise_profile(uuid)` (SECURITY DEFINER, alleen service_role) anonimiseert `profiles`, `auth.users` en `auth.identities` in een transactie, trekt sessies in, is idempotent via een deterministisch placeholder-adres en weigert bij open order, niet-ingetrokken toegang, actief device-token, lopend abonnement, conceptfactuur of staf-rol; raakt bewust het auth-schema. Bewust niet aangeraakt: `orders.profile_id` en `invoices.profile_id` (klant, bewaarplicht), `tmc.events`, `requestAccountDeletion` en `deleteMember` (PR 2), geen UI, geen `db push`, migratie-entry `20260503`.

---

## A. Mollie in-app browser

**Wat bestaat vandaag:**

- `capacitor.config.ts:46` bevat `allowNavigation: ['*.mollie.com', 'www.themovementclub.nl']`, met een in-code toelichting op regels 8-18 dat dit een stopgap is voor de cross-origin redirect naar Mollie (bank- en 3-D-Secure-domeinen zijn niet op te sommen). Regels 24-33 documenteren een aparte, ongerelateerde reden voor de eigen domeinnaam in dezelfde lijst (iOS-navigatiematch op het volledige pad van `server.url`).
- `@capacitor/browser` staat niet in `package.json`, is dus niet geinstalleerd.
- Vijf call sites doen nog rechtstreeks `window.location.href` of `window.location.assign()` naar de Mollie checkout-URL:
  - `src/app/app/producten/_components/BuyButton.tsx:36`
  - `src/app/betaal/[token]/PayButton.tsx:33`
  - `src/app/proefles/boeken/TrialBookingList.tsx:61`
  - `src/components/checkout/PayStage.tsx:106`
  - `src/components/checkout/PayStage.tsx:250`

**Gebouwd in PR #196 (2026-09-20), zie ledger.** De drie punten hieronder zijn daarmee gedaan: `@capacitor/browser` (plus `@capacitor/app` voor de terugkeer) is toegevoegd, de vijf call sites gaan via `openCheckout()`, en het return-to-app pad loopt via het custom scheme `nl.themovementclub.app` met `DeepLinkHandler` en `StatusPoller`. De regels "Wat bestaat vandaag" hierboven beschrijven de toestand van de discovery (PR #191), niet de huidige code. Open na deze PR: device-verificatie op een fysiek toestel (workstream C), en universal links als opvolger van het custom scheme zodra het associated-domains-entitlement er is.

**Te doen (oorspronkelijke lijst, ter historie):**

1. `@capacitor/browser` toevoegen als dependency.
2. De vijf call sites migreren van `window.location.href`/`.assign()` naar `Browser.open()` (in-app browser in plaats van volledige webview-navigatie).
3. Return-to-app pad ontwerpen: hoe komt de gebruiker na een geslaagde of mislukte Mollie-betaling terug in de native app in plaats van in de losse in-app browser te blijven hangen. Dit raakt de bestaande Mollie-webhook-flow (`order.activated`) niet, alleen de client-side navigatie.

Niet blokkerend voor B of C; blokkeert wel echte betalingen via de gepubliceerde app.

---

## B. Push pipeline

**Wat bestaat vandaag:**

- `src/lib/push.ts`: `isPushConfigured()` (regels 22-24) is uitsluitend waar bij een gezette `FIREBASE_SERVICE_ACCOUNT_KEY`; die env var bestaat nu niet, dus het hele kanaal is een stille no-op. `sendPushToProfile()` (regels 50-102) leest tokens uit `tmc.device_push_tokens` en verstuurt via `firebase-admin/messaging`.
- Zes aanroeppunten, allemaal cron- of webhook-getriggerd, momenteel allemaal no-ops:
  - `src/app/api/mollie/webhook/route.ts:57` (mislukte incasso)
  - `src/app/api/cron/waitlist-promote/route.ts:194` (wachtlijstplek vrij)
  - `src/app/api/cron/check-milestones/route.ts:157` en `:192` (aanwezigheids- en lidmaatschapsmijlpaal)
  - `src/app/api/cron/send-reminders/route.ts:166` en `:263` (les- en PT-herinnering)
- `src/components/capacitor/PushNotificationRegister.tsx` is al native-aware: gebruikt `@capacitor/push-notifications`, gate op `Capacitor.isNativePlatform()`, luistert op het `"registration"`-event en geeft het token plus platform door aan `registerPushToken()` (`src/lib/member/push-actions.ts:14-36`), die upsert in `tmc.device_push_tokens` (kolommen `profile_id`, `token` uniek, `platform` check `ios`/`android`; tabel in `supabase/migrations/20260706000000_tmc_baseline.sql:1582-1590`, RLS-policies `profile_id = auth.uid()` origineel in `supabase/migrations_archive/20260702120000_device_push_tokens.sql:34-46`). De client-side iOS-registratie bestaat dus al.
- `ios/App/App/AppDelegate.swift` is nog het ongewijzigde Capacitor-template: geen `FirebaseMessaging`-import, geen `didRegisterForRemoteNotificationsWithDeviceToken`-override om het ruwe APNs-devicetoken naar een FCM-token te bridgen.
- Er is geen `.entitlements`-bestand onder `ios/App/App/`: de Push Notifications-capability is nooit in Xcode toegevoegd.
- Geen Firebase-project, geen `GoogleService-Info.plist`. De placeholder `// COPY: confirm` in `PushNotificationRegister.tsx:18-36` noemt het voorgestelde project `themovementclub`, nog niet aangemaakt. De default Cloud-resource-locatie die je bij het aanmaken van een Firebase-project kiest, geldt alleen voor Firestore, Cloud Storage en App Engine, niet voor FCM: dat is een wereldwijde dienst zonder regiokeuze, dus er is hier geen regio-eis.
- `firebase-admin ^14.1.0` staat wel in `package.json` (server-SDK, alleen voor verzenden, niet voor de native ontvangstkant).

**Te doen, vier onafhankelijk blokkerende items:**

1. Firebase-project `themovementclub` aanmaken (geen regio-eis, zie hierboven: de default resource location geldt niet voor FCM). Binnen dat project een iOS-app registreren met bundle id `nl.themovementclub.app`, exact gelijk aan `capacitor.config.ts:20`. Daarna `GoogleService-Info.plist` genereren en expliciet toevoegen aan het Xcode-target, niet alleen in `ios/App/App/` plaatsen: zonder target membership wordt het bestand niet in de app-bundle meegenomen.
2. `AppDelegate.swift` native wiring: Firebase iOS-SDK toevoegen, APNs-devicetoken naar FCM-token bridgen.
3. Push Notifications-capability plus entitlement toevoegen in Xcode (`aps-environment`).
4. `FIREBASE_SERVICE_ACCOUNT_KEY` in de productie-omgevingsvariabelen zetten.

Geen van deze vier lost de push-keten alleen op: zolang er ook maar een van de vier ontbreekt, komt er niets aan op een fysiek toestel.

---

## C. Build en signing

**Wat bestaat vandaag:**

- `ios/` bestaat en is ingecheckt (`ios/App/App.xcodeproj`, `AppDelegate.swift`, `Info.plist`, `Assets.xcassets`), gegenereerd via `cap add ios` en minstens een keer gebouwd voor de simulator (build-artefacten onder `ios/App/build/`).
- Apple Developer Program-account, provisioning profiles, App Store Connect-record en TestFlight bestaan nog niet (bevestigd, ook al genoemd als open punt in `spec-member-app.md` sectie 7).
- Versienummer staat hardcoded in `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 2`), geen CI-automatisering.

**Te doen:**

1. Apple Developer Program-account op naam van TMC B.V., provisioning profiles, App Store Connect-app-record, TestFlight-configuratie.
2. **Plugin-bridge verifieren op een fysiek toestel met de remote `server.url`, voordat workstream B gebouwd wordt.** `capacitor.config.ts` laadt de live Next.js-app via `server.url` (server mode), niet vanuit de gebundelde `webDir`. Native plugins gedragen zich mogelijk anders in server mode dan in bundled mode; dit is ook precies waar het eerdere probleem uit `spec-member-app.md` sectie 7 vandaan komt (het handgeschreven laadscherm doet niets in server mode, omdat de webview direct naar `server.url` gaat). Voordat er tijd in de Firebase/APNs-wiring van workstream B gaat, moet op een echt toestel bevestigd zijn dat een Capacitor-plugin uberhaupt correct met de native laag praat terwijl de webview op afstand geladen wordt.

C is de voorwaarde voor device-verificatie van zowel A als B; zonder een signed build op een fysiek toestel is er geen betrouwbare manier om de Mollie-in-app-browser-fix of de push-keten te testen.

---

## D. App Store compliance

Vier punten. D.1 en D.2 zijn harde afwijzingsgronden bij de eerste review, geen van beide is iets om naar een update na livegang door te schuiven. D.3 is een distributievoorwaarde voor de EU-storefront die vooraf geregeld en geverifieerd moet zijn. D.4 is geen afwijzingsgrond maar een reviewpositie die vooraf vastligt, zodat een onterechte afwijzing direct weerlegd kan worden.

### D.1 Guideline 4.2 risico (remote URL)

De app laadt vandaag de volledige webcontent via `server.url` in plaats van native schermen (zie workstream C). Hoofdreferentie is Apple's guideline 4.2 (Minimum Functionality); in de praktijk komt een afwijzing op dit punt meestal binnen onder sub-guideline 4.2.2, "apps that are simply web wrappers".

Mitigatie, nog te ontwerpen: voldoende native functionaliteit (push, straks Akiles-toegang uit workstream E, mogelijk offline-gedrag) zodat de app niet louter als browserschil oogt bij review.

**Nette offline-state is onderdeel van D.1, geen losse polish.** Een reviewer test standaard met vliegtuigmodus aan. Een lege WebView of een kale WebKit-foutmelding op dat moment is een zelfstandige afwijzingsgrond, los van het 4.2.2-risico zelf. Er moet een herkenbaar, eigen offline-scherm zijn voordat de eerste submission de deur uit gaat.

**Reviewer notes moeten de native features expliciet benoemen.** Bij de submission zelf: noem in de reviewer notes welke native functionaliteit de app boven de webcontent uit tilt, push-notificaties nu, deurtoegang (workstream E) zodra die er is. Dit ondersteunt de 4.2.2-verdediging, het lost hem niet op; de mitigatie zelf moet in de app zitten, niet alleen in de tekst voor de reviewer.

### D.2 Verplichte in-app accountverwijdering

Apple vereist dat een gebruiker zijn account zelf, in de app, kan verwijderen, niet alleen via een supportverzoek. Dit raakt drie systemen tegelijk:

- **Akiles member en PIN**: intrekking loopt via de bestaande sync (`revokeInAkiles` in `src/lib/access/sync-core.ts`, regels 302-326; niet geëxporteerd, enige ingang is `syncMembershipAccess`), maar die wordt vandaag alleen getriggerd door de nachtcron, na `order.activated` en in `deleteMember`, niet door een self-service accountverwijdering.
- **Mollie-abonnement**: moet gestopt worden, niet alleen de lokale membership-rij.
- **Profielrij**: er bestaat vandaag een admin-side hard-delete (`deleteMember` in `src/lib/admin/member-actions.ts`, rond regel 822, roept rechtstreeks `.update()` op `memberships` aan buiten de RPC-laag om, zie ook de bevinding hierover in `spec-akiles-access.md`'s PR #168-regel). Die faalt sinds de order-pipeline voor elk lid dat ooit betaald heeft (FK's zonder cascade op `orders`, `invoices` en `admin_audit_log`). Er is wel een self-service ingang op `/app/profiel` (`AccountDeletionSection.tsx`, `requestAccountDeletion` in `src/lib/actions/profile.ts`), maar die registreert alleen een verzoek (auditrij plus ntfy); niets voert het uit.

Te ontwerpen: een self-service accountverwijderingsflow die achtereenvolgens het Mollie-abonnement stopt, de Akiles-toegang intrekt en de profielrij (of een soft-delete variant daarvan) verwerkt, met een duidelijke bevestigingsstap in de app.

**Discovery afgerond op 2026-09-21 (branch `docs/account-deletion-discovery`, rapport in die sessie; kern in de PR #206-ledgerregel).** Besluit uit de discovery: betalende leden worden geanonimiseerd, nooit hard verwijderd (facturen en orders vallen onder de bewaarplicht van zeven jaar, AWR art. 52, en `invoices.profile_id` is NOT NULL). Vier PR's: (1) schema en RPC, gebouwd in PR #206; (2) orchestratie met `account_deletions` als werklijst, in de volgorde lokaal bevriezen, Mollie, Akiles, mail en push, dan het profiel; (3) ledenkant met preflight, OTP-bevestiging en status; (4) admin en teksten. Open beslissingen voor Marlon staan in het discovery-rapport (commitment, betalingsachterstand, credits, opzegtermijn, bedenktijd, MailerLite forget, Mollie-retentie).

```
// COPY: confirm met Marlon, bevestigingstekst voor accountverwijdering
// (bijv. "Account verwijderen" knop + waarschuwingstekst over stopzetten
// abonnement en intrekken toegang)
```

### D.3 DSA trader status

Verplicht onder de EU Digital Services Act voor iedereen die via de App Store in de 27 EU-territoria distribueert. TMC verkoopt abonnementen en lessen aan consumenten, dus de trader status is niet optioneel en niet twijfelachtig: TMC is een trader.

**Twee plekken in App Store Connect:**

- Account-niveau: Business, Agreements, Compliance, Digital Services Act.
- App-niveau: App Information, App Store Regulations and Permits, Digital Services Act.

**Wat ingevuld wordt.** Voor een organisatie-account komt het adres automatisch uit het D-U-N-S-nummer (473930161). Zelf in te vullen: telefoonnummer, e-mailadres en betaalrekeninggegevens, plus een certificering dat het aanbod voldoet aan toepasselijk EU-recht.

**Verificatie.** E-mail en telefoon via two-factor, plus upload van documentatie die bedrijfsnaam en adres bewijst. Alleen de Account Holder of een Admin kan dit invullen.

**Afhankelijkheid, expliciet: dit moet onder de organisatie ingevuld worden, niet onder het persoonlijke team.** Twee redenen:

1. De trader-contactgegevens worden publiek getoond op de App Store-productpagina. Onder een persoonlijk account is dat een privé-woonadres.
2. Een adreswijziging kan niet zelf worden doorgevoerd; die vereist een support-verzoek bij Apple. Verkeerd invullen is dus niet triviaal terug te draaien.

**Gevolg voor de volgorde.** DSA trader status is geblokkeerd op de organisatie-inschrijving in workstream C, en de verificatie heeft eigen doorlooptijd door de documentupload. Zie de sectie Afhankelijkheden: C blokkeert nu de identifier-migratie, het App Store Connect-record en DSA trader status.

### D.4 Betaalmethode en IAP-positie

Mollie is de juiste en verplichte betaalmethode voor alles wat TMC verkoopt. Guideline 3.1.3(e): diensten die buiten de app worden geconsumeerd moeten een andere betaalmethode dan in-app purchase gebruiken. Abonnementen, rittenkaarten, drop-ins en losse producten vallen hieronder. PT valt daarnaast onder 3.1.3(d), een één-op-één real-time dienst. Apple neemt over geen van deze transacties provisie.

**Risico.** Niet de regel zelf, maar een onterechte 3.1.1-afwijzing bij review, omdat een reviewer een betaalknop ziet zonder in-app purchase.

**Mitigatie.** In de App Review notes bij de eerste submission expliciet vermelden dat alle aankopen lidmaatschappen en lessen betreffen voor een fysieke studio op Industrieweg 14P in Loosdrecht, ter plekke afgenomen, vallend onder 3.1.3(e), en 3.1.3(d) voor PT. Concepttekst voor die notes (reviewer-facing, Engels, geen ledencopy):

```
All purchases in this app are memberships, class passes and personal
training sessions for a physical fitness studio (The Movement Club,
Industrieweg 14P, Loosdrecht, The Netherlands). The services are
consumed in person at the studio, not inside the app. Payment runs via
Mollie, in line with guideline 3.1.3(e) (services consumed outside the
app) and 3.1.3(d) (one-to-one personal training).
```

**Besluit.** De abonnementsflow blijft om deze reden in de app en wordt niet uitgezet. Deze functionaliteit niet verwijderen ter voorkoming van IAP: dat vergroot juist het 4.2-risico op minimum functionality uit D.1.

---

## E. Akiles app-toegang (gepland na de eerste store-release)

Additief naast het bestaande PIN- en magic-link-model uit `spec-akiles-access.md`. Het besluit van 2026-09-08 in dat document (geen Mobile SDK, geen native bridge) wordt hier niet teruggedraaid, alleen aangevuld: het PIN- en magic-link-model blijft de fallback zodra het per-device member-token model er is.

**Doel:** member token per device via de Akiles Mobile SDK, met Bluetooth open-deur als primaire methode en NFC card emulation (HCE) als latere uitbreiding.

**Open ontwerpvragen, hier alleen benoemd, niet opgelost:**

1. **Waar leeft het per-device token.** Precedent in het schema: `tmc.device_push_tokens` (`profile_id` FK, `token` uniek, `platform` check `ios`/`android`, RLS volledig op `profile_id = auth.uid()`) is de enige bestaande tabel die een per-device, per-profiel credential modelleert. Of een Akiles member-token dezelfde vorm krijgt, een eigen tabel, of iets anders, is nog niet besloten.
2. **Token verwijderen bij logout**, inclusief de samenhang met het bestaande rollende `ends_at`-venster van zeven dagen (`ROLLING_ACCESS_WINDOW_DAYS` in `src/lib/access/constants.ts`, beschreven in `spec-akiles-access.md` sectie "Gewenste toestand per profiel"). Een uitgelogd device-token mag niet los komen te staan van dat fail-closed model.
3. **Bridge-keuze**: de officiele Akiles Cordova-plugin (compatibiliteit met Capacitor nog te verifieren, zie ook `spec-member-app.md` sectie 2 en 6) versus een eigen Capacitor-plugin rond de AkilesSDK-pod.

**Uitzondering op de fasering, direct te starten:** het Apple HCE-entitlementformulier moet per direct ingediend worden, los van de rest van workstream E, vanwege de bekende lange doorlooptijd bij Apple voor dit soort formulieren. Wachten tot na de eerste store-release kost hier onnodige tijd op het kritieke pad.

```
// COPY: confirm met Marlon, primaire actietekst voor "deur openen"
// in de app zodra workstream E gebouwd is
```

---

## F. Assets en versiebeheer

Niet blokkerend, laagste prioriteit.

**Wat bestaat vandaag:**

- Bronassets aanwezig (`assets/icon-*.png`, `assets/splash.png`), gegenereerde output staat al in `ios/App/App/Assets.xcassets/`, maar de generatie zelf is handmatig (`npx capacitor-assets generate`, geen npm-script).
- Versie- en buildnummer staan hardcoded in `ios/App/App.xcodeproj/project.pbxproj` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`), geen CI-automatisering.

**Te doen:** npm-script voor assetgeneratie, keuze tussen handmatige of geautomatiseerde versie/build-ophoging.

---

## Afhankelijkheden

- **C deblokkeert device-verificatie van A en B, en blokkeert de identifier-migratie, het App Store Connect-record en DSA trader status (D.3).** Zonder signed build op een fysiek toestel is er geen betrouwbare manier om de Mollie-fix of de push-keten te testen. Zonder organisatie-inschrijving kan geen van die drie starten, en de DSA-verificatie heeft daarna nog eigen doorlooptijd door de documentupload.
- **A en B blokkeren elkaar niet.** Los te bouwen en te verifiëren, wel allebei afhankelijk van C voor echte device-verificatie.
- **D loopt parallel aan A/B/C, maar moet af zijn voor de eerste submission.** D.1 en D.2 (4.2-risico, accountverwijdering) zijn harde afwijzingsgronden bij de eerste review. D.3 moet vóór de eerste submission geverifieerd zijn en hangt aan C. D.4 is een reviewpositie voor de notes bij die submission.
- **E start pas na de eerste release**, met uitzondering van het Apple HCE-entitlementformulier, dat vanwege doorlooptijd per direct ingediend wordt.
- **F is volledig onafhankelijk** en kan op elk moment tussendoor.

---

## Beslissingenlog

- **2026-09-19.** Zes workstreams vastgesteld (A t/m F) op basis van de discovery op branch `chore/ios-app-discovery`. Geen strikte lineaire fasering: C is voorwaarde voor device-verificatie van A en B, D moet af zijn voor de eerste store-submission, E start na de eerste release op het HCE-entitlementformulier na.
- **2026-09-19.** Workstream E is expliciet additief aan het bestaande Akiles-model. Het besluit van 2026-09-08 in `spec-akiles-access.md` (geen Mobile SDK, geen native bridge, PIN- en magic-link-model als primaire toegangsroute) wordt niet teruggedraaid; dat model blijft de fallback.
- **2026-09-19.** Het Apple HCE-entitlementformulier voor E wordt los van de rest van de fasering per direct ingediend, vanwege de bekende lange doorlooptijd bij Apple.
- **2026-09-19.** D.1 en D.2 gelden als harde blockers voor de eerste submission, niet als punten die naar een update na livegang mogen schuiven.
- **2026-09-19.** DSA trader status (D.3) wordt onder de organisatie-inschrijving ingevuld, niet onder een persoonlijk team: de contactgegevens staan publiek op de productpagina en een adreswijziging vereist een support-verzoek bij Apple. D.3 hangt daarmee aan de organisatie-inschrijving in C.
- **2026-09-19.** Mollie blijft de enige betaalmethode in de app (guideline 3.1.3(e), plus 3.1.3(d) voor PT), geen in-app purchase. De abonnementsflow wordt niet uit de app gehaald om een IAP-discussie te vermijden; dat zou het 4.2-risico uit D.1 vergroten.
