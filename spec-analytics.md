# Spec: Analytics, de meetgrens

## Status

**Besloten en gebouwd.** De meetgrens is geïmplementeerd (#134), en de conversiebrug, het server-side `purchase`-event vanuit de Mollie-webhook, is gebouwd in PR C (`sendPurchaseToGa4`, zie "De conversiebrug" hieronder). De conversiemeting (server-side `trial_booked`, advertentietoestemming in de cookiebanner, leads pas na een 2xx, `contact_click`, `newsletter_signup`, `payment_start` zonder bedrag) staat in `spec-conversiemeting.md`; dat document is leidend voor die events en voor de consentmapping. Dit document vervangt `TRACKING.md`, dat verwijderd is omdat het crowdfunding-helpers beschreef die in #120 al waren weggehaald en negen slug-routes die niet bestaan.

Achtergrond en de feitelijke nulmeting: `docs/analytics-audit-2026-07.md`.

---

## Het probleem dat dit oplost

De codebase had twee eventsystemen die hetzelfde probeerden te meten. GA4 kreeg client-side events voor boeken, annuleren, pauzeren, profiel-updates en roosternavigatie; `tmc.events` kreeg server-side domein-events voor grotendeels dezelfde handelingen. Dat leverde drie problemen op.

**GA4 was structureel de slechtere bron voor dat gedrag.** De consent-banner staat niet op `/app/**`, dus de consent-state blijft daar `denied` en alle member-app-events kwamen cookieless binnen, zonder `user_id`. Wie rechtstreeks op de app binnenkwam, inclusief 100% van de native app-gebruikers, werd nooit geïdentificeerd. `tmc.events` heeft dat probleem niet: die rijen hangen al aan een `profile_id`, zijn niet consent-afhankelijk, en zijn server-side dus niet te blokkeren door een adblocker.

**Twee bronnen die niet overeenkomen zijn erger dan één.** `booking_cancel` vuurde alleen vanuit de rooster-sheet en niet vanuit `/app/boekingen`; `booking_complete` had `plan_type: "unknown"` en `credit_charged: false` hardcoded. De GA4-events zagen er compleet uit en waren dat niet, gevaarlijker dan een ontbrekend event, want je merkt het niet.

**Het onderhoud viel dubbel.** Elke nieuwe member-app-feature vroeg om twee instrumentaties, met twee kansen om het te vergeten.

---

## De meetgrens

> **GA4 meet uitsluitend acquisitie op de publieke site, tot en met de conversie. Productgedrag achter login gaat naar `tmc.events`.**

Eén regel, twee systemen, geen overlap.

### Wat naar GA4 gaat

Alles op de publieke marketingsite, tot het moment dat iemand klant wordt.

| Categorie | Events |
|---|---|
| Lead-conversie | `generate_lead` (via `trackLead`, pas na een 2xx) · `programma_intake` (via `trackProgrammaIntake`, eigen conversie voor de Google Ads-landing op `/12-weken-programma`) · `trial_booked` (server-side, Measurement Protocol) · `newsletter_signup` |
| Formulier-intentie | `form_start` |
| CTA-interactie | `cta_click` |
| Contactklik | `contact_click` (`method`: `whatsapp`, `phone`, `email`) |
| Configurator (`/abonnement`) | `configurator_stage_view` · `configurator_select` · `begin_checkout` · `checkout_rejected` |
| Login-conversie | `portal_login` |
| Betaling | `payment_start` (intentie, zonder bedrag) · `purchase` (server-side, Measurement Protocol) |

De configurator staat bewust aan de GA4-kant: `/abonnement` is een publieke route en de productkeuze dáár is een acquisitiebeslissing, geen productgebruik.

`payment_start` draagt sinds `spec-conversiemeting.md` geen bedrag meer: het is een intentiesignaal aan het begin van de checkout. Bedragen gaan uitsluitend server-side mee, op `purchase` en `trial_booked`.

### Wat naar `tmc.events` gaat

Alles achter login. Boeken, annuleren, wachtlijst, check-in, pauzeren, opzeggen, profiel-updates, health intake, roosternavigatie, credit-mutaties, PT-boekingen.

Deze events bestaan al grotendeels, `emitEvent()` in `src/lib/events/emit.ts` schrijft ze. Deze spec voegt er geen toe; hij legt alleen vast dat dit de plek is waar ze horen.

### De routegrens in code

`src/components/layout/SiteShell.tsx` sluit `/studio`, `/app/**`, `/login`, `/checkin*`, `/12-weken-programma*` en `/betaal/*` uit van de standaard marketing-chrome (Navbar, Footer, opt-in banner) en van de sitebrede `CookieConsent`. Die uitsluiting *is* de meetgrens voor `/studio`, `/app/**`, `/login`, `/checkin*` en `/betaal/*`: daar valt niets te meten waarvoor toestemming nodig is. `/12-weken-programma*` is de uitzondering: dat is publieke acquisitie (Google Ads-landing), dus de layout (`src/app/12-weken-programma/layout.tsx`) mount via `ProgrammaCookieConsent` zelf de banner. De comment in `SiteShell.tsx` zegt dat expliciet.

Eén uitzondering: `UtmTracker` mount wél op `/login` en `/betaal/<token>`. Dat zijn kale routes waar een campagne rechtstreeks op kan landen (MailerLite-mail, betaallink via WhatsApp), en de UTM's die daar binnenkomen zijn acquisitie-data. Zonder die mount schrijft de signup lege `acquisition_*`-velden weg, die door `ON CONFLICT DO NOTHING` in `handle_new_auth_user` daarna permanent leeg blijven. `UtmTracker` schrijft naar `sessionStorage`, zet geen cookie en raakt de consent-state niet aan.

---

## Principe: vuurt deze haak ook als er niets gebeurd is?

> **De test is niet of een event aan een lifecycle-hook hangt. De test is of die haak ook vuurt wanneer er niets gebeurd is. Zo ja: verkeerde haak.**

"Nooit een `useEffect`" is de verkeerde regel, te grof, en 'ie keurt legitieme aankomst-events af terwijl 'ie de echte fout niet vangt. Een `onFocus` is bijvoorbeeld een gebruikershandeling, tot het veld `autoFocus` heeft; dan vuurt 'ie bij mount en is het precies dezelfde fout als `portal_login`, alleen vermomd als user-event. Omgekeerd is een `useEffect` die exact één keer per stage-wissel vuurt volkomen in orde.

Stel bij elke nieuwe call-site dus niet de vraag "werkt het" maar: **noem één situatie waarin deze haak vuurt terwijl de gebruiker niets deed.** Kun je er een noemen, tab-refocus, token-refresh, remount bij client-side navigatie, achtergrond-hydratie, StrictMode-dubbelmount, `autoFocus`, dan meet het event iets anders dan de naam belooft. Dat is van buitenaf niet te zien: het event ziet er in GA4 volkomen normaal uit, en de telling is stilletjes opgeblazen.

### Het gedocumenteerde voorbeeld: `portal_login`

`AuthListener` hing in de root layout en vuurde `portal_login` op het Supabase-event `SIGNED_IN`. Dat leek de juiste haak en was het niet. Geverifieerd in de geïnstalleerde `@supabase/auth-js`:

- `_recoverAndRefresh()` (`GoTrueClient.js:3778`) emit `SIGNED_IN` zodra een opgeslagen sessie uit storage wordt geladen en nog geldig is (regel 3857).
- Die functie draait vanuit `_initialize()` (regel 313), élke client-boot, én vanuit `_onVisibilityChanged()` (regel 4250), gekoppeld aan `visibilitychange`.
- De JSDoc erbij: *"Emitted each time a user session is confirmed or re-established, including on user sign in and when refocusing a tab. […] This event can fire very frequently depending on the number of tabs open in your application."*

Gevolg: het event telde **sessies bevestigd**, niet logins. Het vuurde bij sessieherstel op elke pagina-boot en bij elke tab-refocus, ook op publieke marketingpagina's voor een al ingelogde bezoeker. En één echte login leverde er minstens twee op: `LoginForm` vuurt 'm zelf na een geslaagde `verifyLoginOtp` en doet daarna `window.location.assign()`, wat een verse client boot en dus opnieuw `SIGNED_IN`.

De aanroep leeft nu uitsluitend in `src/app/login/LoginForm.tsx`, direct achter de geslaagde OTP-verificatie. Dát is de handeling.

### De enige toegestane uitzondering: aankomst-events

Een "iemand heeft deze stap of pagina bereikt"-event heeft per definitie geen handeling om aan te hangen; de aankomst *is* de gebeurtenis. Zo'n event mag aan een mount hangen, op drie voorwaarden:

1. De mount valt 1-op-1 samen met de gebeurtenis die je meet, dus geen haak die ook bij refocus, token-refresh of achtergrond-hydratie vuurt.
2. Er is dedupe als herhaald vuren de telling zou vervuilen.
3. **Het event draagt geen bedrag.** Geen `value`, geen `currency`. Een aankomst is per definitie client-side vastgesteld, en de browser kent de autoritatieve prijs niet, die komt uit `tmc.create_order`, en is bovendien manipuleerbaar. Bedragen gaan uitsluitend server-side mee, vanuit de Mollie-webhook (zie "De conversiebrug").

Twee bestaande gevallen vallen hieronder:

| Call-site | Event | Status |
|---|---|---|
| `src/app/abonnement/AbonnementConfigurator.tsx:51` | `configurator_stage_view` | ✅ Voldoet. `useEffect` op `[stage]`; de component mount alleen op `/abonnement` en een stage-wissel *is* de gebeurtenis. Geen refocus-haak, geen bedrag. |
| `src/app/app/abonnement/bedankt/PaymentTracker.tsx` | `payment_return_view` | ✅ Voldoet aan alle drie. Aankomst op de bedankpagina, gededupliceerd per `transactionId` via `sessionStorage`, geen bedrag; `order_status` als dimensie houdt de webhook-race zichtbaar. Verving in PR C de oude `payment_success`/`payment_failed`, die `value`/`currency` droegen en de laatste uitzondering op voorwaarde 3 waren. |

Alles daarbuiten hangt aan `onSubmit`, `onClick` of `onFocus`, geverifieerd, inclusief de controle dat geen van die `onFocus`-velden `autoFocus` draagt of programmatisch gefocust wordt.

---

## De conversiebrug (gebouwd, PR C)

De enige verbinding tussen de twee systemen: één server-side `purchase`-event dat vanuit de Mollie-webhook naar GA4 gaat, zodat de omzet toegerekend kan worden aan het kanaal dat de klant bracht. Zonder die brug meet GA4 wel wie er converteert, maar niet wat het opleverde.

**Waarom server-side.** De browser kent de autoritatieve prijs niet, die komt uit `tmc.create_order`, en client-side bedragen zijn manipuleerbaar. De webhook is het enige punt waar een betaling bevestigd én het bedrag bekend is. De oude client-side variant (`PaymentTracker` met `payment_success`) vuurde bovendien alleen bij order-status `activated`, miste dus de webhook-race, en mat productorders helemaal niet.

### Hoe hij loopt

1. **Uitlezen**, `readGaIds()` (`src/lib/ga-ids.ts`) leest in `PayStage.handlePay()` de GA4 `client_id` en `session_id` via `gtag('get')`, met een harde timeout van 300 ms en een `_ga`-cookie-fallback voor de client_id. Bij consent denied of timeout: `undefined`, checkout gaat door.
2. **Meedragen**, `createOrderAndCheckout` zet ze ná de `create_order`-RPC met een losse update op `tmc.orders.ga_client_id` / `ga_session_id` (migratie `20260816000000`; route (b), analytics-metadata loopt niet door de autoritatieve prijsfunctie). `NULL` is de normale toestand voor member-app-aankopen, admin-betaallinks en consent-denied-orders.
3. **Vuren**, de naloop van de activatieketen (`src/lib/orders/activation-chain.ts`, door de Mollie-webhook via `after()` na de respons gedraaid) roept binnen de `!activation.already_activated`-tak, direct ná `emitEvent("order.activated")`, `sendPurchaseToGa4` aan en wacht erop (`src/lib/orders/ga-purchase.ts`). Die leest de orderrij zelf, slaat over zonder fout als `ga_client_id` ontbreekt, en POST anders één Measurement Protocol `purchase`-event: `transaction_id` = order-id, `currency` EUR, `value` = het door Mollie verwerkte bedrag, `items[0]` met `item_id` = `catalogue_slug` (de join key met `begin_checkout`), `item_name` en `item_category` uit `tmc.catalogue`, `session_id` als event-parameter, en een consent-object volgens de opgeslagen `ad_consent` (zie `spec-conversiemeting.md`, "MP-regels"). **Geen `user_id`**, zie "Wat bewust niet gebeurt".

**Exactly-once** komt uit `tmc.activate_order` (rijlock + statusovergang): precies één webhook-aanroep ziet `already_activated: false`. De helper voegt daar geen eigen dedupe aan toe. Strikt genomen is het at-most-once: crasht de functie tussen activatie en het MP-verzoek, dan is dat ene event weg (Mollie's retry ziet `already_activated: true` en vuurt terecht niet). Geaccepteerd compromis, durability zou een write in de geldpijplijn vragen.

**Dekking**: alle orders door de order-pijplijn, abonnementen, productorders (`/app/producten?tab=tegoed`-redirect) en WS-5-betaallinks, al vuren de laatste twee in de praktijk nooit (geen `ga_client_id`). Trial bookings lopen door een aparte webhook en krijgen hun eigen server-side event, `trial_booked` (`spec-conversiemeting.md`).

### Twee harde regels (gehandhaafd in de bouw)

1. **De webhook mag nooit op analytics falen.** `sendPurchaseToGa4` throwt nooit en staat buiten het idempotentiepad. Hij wordt ge-awaited, maar pas in de naloop, na de respons aan Mollie: een losse `void` kon door Vercel worden bevroren voordat het verzoek klaar was. Zelfde contract als `emitEvent()`: bij falen alleen `console.error` naar de Vercel-logs. Een gemiste meting is een rapportageprobleem; een gemiste order-activatie is een klantprobleem.
2. **Bedragen gaan uitsluitend hierlangs.** Client-side events dragen geen `value`. Dat is de reden dat `begin_checkout` en `configurator_select` bewust geen bedrag meesturen en GA4 daar €0 rapporteert.

**Env:** `GA4_API_SECRET` (GA4 Admin → Data Streams → web-stream → Measurement Protocol API secrets), in Vercel als **Sensitive** voor Production en Preview. Nooit in code of logs, de MP-URL bevat het secret, dus ook die URL nooit loggen.

---

## Evaluatieplicht bij nieuwe features

Elke nieuwe pagina, feature of uitbreiding wordt expliciet geëvalueerd op meting. **"Niet meten" is een geldige uitkomst**, maar geen stilzwijgende: hij wordt net zo goed vastgelegd als een nieuw event. Wat deze plicht voorkomt is niet te weinig meten, maar per ongeluk niet meten en dat pas maanden later ontdekken in een rapportage die er compleet uitzag.

De evaluatie loopt langs vier poorten, in volgorde. Zodra een poort een uitkomst geeft ben je klaar.

### Poort 1: ligt het achter login?

Ja, dan **geen GA4**. Punt. Overweeg in plaats daarvan een `tmc.events`-entry volgens de `noun.verb`-conventie hieronder, met het werkwoord als voltooid deelwoord. Die rijen hangen al aan een `profile_id`, zijn niet consent-afhankelijk en niet te blokkeren door een adblocker. Klaar.

### Poort 2: publiek, maar markeert het iets?

De vraag is niet "kan ik hier een event op hangen" maar: **markeert deze gebruikershandeling een stap in de acquisitiefunnel?**

Nee, dan **geen tracking**, met de reden vastgelegd in de PR-body. Voorbeelden van een terechte "nee": een accordeon die opengaat, een fotogalerij die doorschuift, een taalwissel, een terug-link. Enhanced Measurement dekt pageviews, scroll en outbound clicks al; daar hoeft niets bij.

### Poort 3: ja, dus het event hangt aan de handeling

Het event hangt aan de **gebruikershandeling** (een klik, een submit, een focus), niet aan mount, auth-state of visibility. Uitzondering: het voldoet aan de drie arrival-voorwaarden hierboven, en dan alle drie, niet twee van de drie.

Toets met de vraag uit het principe: noem één situatie waarin deze haak vuurt terwijl de gebruiker niets deed. Kun je er een noemen, dan is het de verkeerde haak.

**Het event draagt geen bedrag.** Geen `value`, geen `currency`.

### Poort 4: gaat er geld om?

Dan komt de `value` **uitsluitend server-side vanuit de Mollie-webhook**. Niet uit de browser, niet uit een prop, niet herberekend. De browser kent de autoritatieve prijs niet en is manipuleerbaar.

### Handhaving: de "Analytics:"-regel

**Elke PR-body bevat een regel die begint met `Analytics:`**, met precies één van drie uitkomsten:

| Uitkomst | Vorm |
|---|---|
| Geen meting | `Analytics: geen. <reden>` |
| Nieuw event | `Analytics: nieuw event <naam> (<parameters>), regel toegevoegd aan het eventregister.` |
| Ongewijzigd | `Analytics: bestaand event <naam> ongewijzigd.` |

Bij "nieuw event" is de regel in het eventregister onderdeel van dezelfde PR, niet van een opruim-PR daarna.

### Beperking: Sanity omzeilt deze plicht

Deze plicht hangt aan PR's. **Content die via Sanity wordt toegevoegd doorloopt hem niet**, want daar komt geen PR aan te pas.

Voor pure contentpagina's is dat acceptabel: Enhanced Measurement dekt pageviews en scroll, en er valt verder niets te meten. Het is **niet** acceptabel voor een Sanity-pagina met een formulier of een CTA. Zodra er een handeling op staat die een funnelstap markeert, is er alsnog een PR-evaluatie nodig, ook al is de pagina zelf in het CMS gemaakt. Wie zo'n pagina publiceert zonder die stap, levert een funnel op waarvan het begin gemeten wordt en het eind niet.

---

## Eventregister

Alle levende GA4-events. **Elk nieuw event krijgt hier een regel in dezelfde PR waarin het gebouwd wordt.** Een event dat hier niet staat, bestaat wat dit project betreft niet: dit register is de bron waartegen een rapportage gecontroleerd wordt.

Alle events hieronder zijn client-side uit `src/lib/analytics.ts`, met twee uitzonderingen: `purchase` (`src/lib/orders/ga-purchase.ts`) en `trial_booked` (`src/lib/trial-bookings/ga-trial-booked.ts`) gaan server-side via het Measurement Protocol. Parameters zijn de daadwerkelijk verzonden sleutels. Voor `trial_booked`, `purchase`, `generate_lead`, `contact_click`, `newsletter_signup` en `payment_start` is `spec-conversiemeting.md` leidend: daar staan het moment, de bron van elke parameter, de key events en de consentmapping.

| Event | Trigger | Parameters | Surface | Status |
|---|---|---|---|---|
| `generate_lead` | Geslaagde lead-aanvraag, pas na een 2xx van de bijbehorende API | `lead_type` (`terugbelverzoek`, `contact_form`, `overstap`, `yoga_quiz`). Geen `value`, geen `currency` | `/proefles` (terugbelformulier), `/contact`, `/prijzen` (overstap), `/welke-yoga-past-bij-jou` (mailblok) | Levend. Zie `spec-conversiemeting.md`. De proefboeking zelf vuurt geen `generate_lead` meer maar `trial_booked` |
| `trial_booked` | Proefboeking definitief: betaald na de overgang pending naar paid (trial-webhook of cron), met code na `redeem_trial_code`, gratis na `book_opening_trial` | `client_id`, `session_id`, `trial_type`, `pillar`, `code`, `action_page` (optioneel), `transaction_id`, `currency`, `value`, consent-object | Server-side (Measurement Protocol) | Levend, key event. Zie `spec-conversiemeting.md` |
| `newsletter_signup` | Geslaagde aanmelding, pas na een 2xx | `location` (`banner`, `yoga_quiz`) | Banner op de marketingpagina's, mailblok van de yoga-test (alleen met de tips-opt-in) | Levend, geen key event. Vervangt `generate_lead` met label `info_optin` |
| `programma_intake` | Geslaagde intake-aanvraag, pas na een 2xx van `/api/leads/programma-intake` | `value: 240`, `currency: EUR`, `lead_type: programma_intake` | `/12-weken-programma/intake` | Levend. Eigen conversie naast `generate_lead`, zodat de proefles-conversies schoon blijven; de intake vuurt geen `generate_lead` meer. `value` is een vaste leadwaarde voor Google Ads, geen omzet of prijs (bewuste uitzondering op "bedragen alleen server-side"). Na de merge in GA4 als key event markeren |
| `kennismaking_hormoonprofiel` | Geslaagde kennismaking, pas na een 2xx van `/api/leads/hormoonprofiel` | `lead_type: hormoonprofiel`, `site_mode` (`standalone` of `section`). Geen `value`, geen persoonsgegevens | `hormoonprofiel.com` (standalone) en `/hormoonprofiel` (sectie) | Levend. Eigen conversie naast `generate_lead`, zodat de proefles-conversies schoon blijven. Alleen na toestemming in de cookiebanner (`hasConsent()`-poort, zoals de yoga-events). Geen cross-domain koppeling: op hormoonprofiel.com is het een aparte first-party sessie in dezelfde property. Na de merge in GA4 als key event markeren |
| `cta_click` | Klik op een CTA-knop | `event_category: engagement`, `event_label` (knoptekst), `page_location` | `/proefles` | Levend. De call-site op `/app/producten` is verwijderd (spec-analytics-scope.md) |
| `form_start` | Eerste focus in een formulier | `event_category: engagement`, `event_label` (formuliernaam) | 11 formulieren, publiek plus `/abonnement` (`abonnement_identify`) en `/kopen` (`kopen_identify`, zelfde `IdentifyStage`-component) | Levend |
| `contact_click` | Klik op een publieke tel:-, mailto:- of wa.me-link | `method` (`whatsapp`, `phone`, `email`) | Footer, homepage (ContactSection), `/contact`, `/privacybeleid`, en contactlinks in Sanity-content | Levend. Enige call-site is `TrackedContactLink`. Vervangt de nooit gebruikte `click_phone`, `click_whatsapp` en `click_email` | Klik op een contactlink | `event_category: contact`, `event_label` | Geen | **Helper aanwezig, nul call-sites.** Wacht op mount op de footer-`tel:`/`mailto:`-links, audit gap #4 |
| `configurator_stage_view` | Stage-wissel in de configurator, inclusief mount | `event_category: configurator`, `stage` | `/abonnement`, `/kopen` (onderscheid via `page_location`) | Levend, arrival-event |
| `configurator_select` | Kaartselectie, vrij-trainen-swap, verlengde toegang, 12/24 maanden | `event_category: configurator`, `item_id`, `family`, `frequency`, `commitment_months`, `addon_vrij_trainen`, `addon_extended_access` | `/abonnement` | Levend |
| `begin_checkout` | Klik op "Ga verder" | `event_category: configurator`, `items[0]` met `item_id`, `item_name`, `item_category` | `/abonnement`, `/kopen` (`item_category` is daar de catalogus-`family` van het product) | Levend, bewust zonder bedrag |
| `checkout_rejected` | Server-side weigering van `create_order` | `event_category: configurator`, `item_id`, `reason` | `/abonnement`, `/kopen` | Levend |
| `portal_login` | Geslaagde OTP-verificatie | `event_category: portal`, `method` | Geen | **Vervallen** in de PR van `spec-analytics-scope.md`: `/login` valt buiten de meetgrens, het event gaat ook niet naar `tmc.events` |
| `payment_start` (`PayStage.tsx`) | Klik op "Betaal nu" | `event_category: payment`, `context`, `plan_variant` | `/abonnement` (`context: first_membership`), `/kopen` (`context: ten_ride_card` of `pt_package`, zelfde call-site) | Levend, zonder bedrag sinds `spec-conversiemeting.md` |
| `payment_start` (`BuyButton.tsx`) | Klik op "Koop" | `event_category: payment`, `value`, `currency`, `context`, `plan_variant` | Geen | **Vervallen**: `/app/producten` valt buiten de meetgrens (spec-analytics-scope.md) |
| `payment_return_view` | Aankomst op de bedankpagina, per `transactionId` één keer | `event_category: payment`, `order_status` | Geen | **Vervallen**: `/app/abonnement/bedankt` valt buiten de meetgrens (spec-analytics-scope.md). Verving eerder `payment_success` en `payment_failed` in #139 |
| `yoga_test_start` | Klik op "Start de test" | `event_category: yoga_test` | `/welke-yoga-past-bij-jou` | Levend. Alleen na toestemming in de cookiebanner (`hasConsent()`-poort in `src/lib/analytics.ts`) |
| `yoga_test_complete` | Laatste vraag beantwoord (klik op een antwoord) | `event_category: yoga_test`, `result` (uitkomstsleutel `v`, `p`, `ym`, `y`, `r`, `n`) | `/welke-yoga-past-bij-jou` | Levend, zelfde toestemmingspoort. Geen mount-haak: vuurt op de klik |
| `yoga_test_book_click` | Klik op een boekknop op de uitslag | `event_category: yoga_test`, `result`, `target` (`code`, `betaald`, `bellen`) | `/welke-yoga-past-bij-jou` | Levend, zelfde toestemmingspoort |
| `yoga_test_email_submit` | Submit van het mailblok op de uitslag | `event_category: yoga_test`, `result`, `opt_in` (boolean) | `/welke-yoga-past-bij-jou` | Levend, zelfde toestemmingspoort. Geen e-mailadres of naam in de parameters |
| `purchase` | Order geactiveerd in de Mollie-webhook, exact één keer per order | `client_id`, `session_id`, `transaction_id`, `currency`, `value`, `items[0]` met `item_id`, `item_name`, `item_category`, `quantity`, consent-object | Server-side (Measurement Protocol) | Levend. Zie "De conversiebrug" en `spec-conversiemeting.md` |

Daarnaast levert GA4 Enhanced Measurement automatisch `page_view`, scroll, outbound clicks en file downloads. Die staan niet in dit register: ze zijn een admin-instelling, niet iets dat in deze repo geschreven of gewijzigd wordt.

### De twee `payment_start`-uitzonderingen (vervallen)

**Beide uitzonderingen zijn opgelost.** `BuyButton.tsx` vuurt niet meer (`spec-analytics-scope.md`), en `PayStage.tsx` stuurt sinds `spec-conversiemeting.md` geen `value` en geen `currency` meer. De tekst hieronder blijft staan als geschiedenis van het besluit.

Eén event, twee call-sites, twee verschillende overtredingen. Beide waren bewuste, tijdelijke uitzonderingen, opgenomen op dezelfde manier als de `PaymentTracker`-afwijking hierboven.

**`PayStage.tsx` op `/abonnement`: draagt een bedrag client-side.** Het event zelf is in orde (poort 1 tot en met 3 gehaald: publieke route, echte gebruikershandeling, geen mount-haak), maar het stuurt `value` en `currency` mee en dat is in strijd met poort 4. Bedragen komen uitsluitend server-side uit de Mollie-webhook. **Oplossing: het bedrag wordt verwijderd, het event blijft.** Zonder `value` blijft het precies wat het hoort te zijn, een intentiesignaal aan het begin van de checkout.

**`BuyButton.tsx` op `/app/producten`: vuurt achter login.** Dit faalt poort 1: de route ligt achter de meetgrens en hoort helemaal geen GA4-event te hebben. Erger nog, het event landt in de praktijk nergens. `/app/**` valt binnen de `SiteShell`-uitsluiting, dus daar staat geen `CookieConsent`, blijft `analytics_storage` op `denied` en komt de hit hooguit cookieless binnen zonder bruikbare sessie. Het kost onderhoud en levert niets. **Oplossing: de call-site wordt verwijderd.** Wat daar gemeten moet worden hoort in `tmc.events`.

**Geen nieuwe uitzonderingen.** De lijst is leeg: de enige client-side waarde die nog bestaat is de vaste leadwaarde van `programma_intake`, een bewust besluit bij dat event. Een nieuw event dat een poort niet haalt, wordt niet gebouwd; het wordt aangepast tot het wel door de poorten komt, of het wordt niet gemeten en dat wordt vastgelegd. Een uitzondering toevoegen vraagt een expliciet besluit, geen PR-voetnoot.

---

## Naamconventie `tmc.events`

`noun.verb` waarbij het werkwoord een **voltooid deelwoord** is, het event beschrijft iets dat is gebeurd, niet iets dat gaat gebeuren. Conform de bestaande `checkin.recorded`.

```
checkin.recorded          booking.cancelled         order.activated
booking.created           membership.pause_granted  payment.received
waitlist.promoted         pt_booking.rescheduled    member.created
```

- Enkelvoudig noun (`booking`, niet `bookings`).
- `snake_case` binnen elk deel (`membership.cancellation_requested`).
- Geen tegenwoordige tijd (`booking.create`) en geen gerundium (`booking.creating`).
- Het volledige toegestane domein staat als union-type in `EventType` in `src/lib/events/emit.ts`. Een nieuw event begint daar, niet bij de call-site.

---

## Wat bewust niet gebeurt

- **Measurement Protocol voor iets anders dan conversies**, de enige MP-calls zijn `purchase` en `trial_booked` (`spec-conversiemeting.md`). Geen server-side events voor gedrag; dat blijft `tmc.events`.
- **Consent-banner op `/app/**`**, niet nodig onder deze architectuur, en het toevoegen ervan zou de meetgrens juist ondermijnen.
- **GA4 `user_id`**, verwijderd. Een GA4-identiteit koppelen aan iemand wiens gedrag daar toch niet meer gemeten wordt levert niets op en vergroot alleen de PII-oppervlakte. Cohort- en lifecycle-analyse hoort thuis op `tmc.events`, waar het `profile_id` al staat.
- **Nieuwe `tmc.events` call-sites**, deze spec legt de grens vast; hij vult de gaten aan de `tmc.events`-kant niet. Die zijn geïnventariseerd in `docs/analytics-audit-2026-07.md` §8.

---

## Bekende gaten aan de GA4-kant (open)

Uit de audit, nog niet geadresseerd:

- De marketing top-of-funnel meet alleen formulier-submits. `/`, `/prijzen`, `/aanbod` en `/early-member` hebben geen CTA- of sectie-tracking, en de navbar-CTA "Plan je proefles", de primaire actie van de site, vuurt niets.
- Opgelost in `spec-conversiemeting.md`: de contactlinks op de publieke site vuren `contact_click` via `TrackedContactLink`. De helper `trackContact` en de events `click_*` bestaan niet meer.
- Er is geen route-change-hook voor SPA-pageviews; soft navigation leunt volledig op GA4's Enhanced Measurement, een admin-instelling die niet vanuit de repo verifieerbaar is.

---

## Verwachte breuk in de cijfers: `portal_login`

**De `portal_login`-aantallen dalen fors vanaf het moment dat de fix hierboven live gaat. Die daling is de correctie, niet een regressie.**

Wat vóór de fix geteld werd, waren sessie-bevestigingen: elke pagina-boot met een geldige sessie, elke tab-refocus, plus een dubbeltelling bij iedere echte login. Wat er nu geteld wordt, is één event per daadwerkelijk voltooide OTP-verificatie.

Praktische gevolgen bij het lezen van de rapportage:

- Vergelijk `portal_login` niet over de deploy-datum heen. De reeks vóór en de reeks ná meten verschillende dingen; een trendlijn er dwars doorheen is betekenisloos.
- Ga niet op zoek naar de oorzaak van de daling. Die staat hier.
- De nieuwe waarde is de bruikbare: pas hierna is `portal_login` te gebruiken als noemer of als conversiestap, want pas hierna telt 'ie logins.

Zet in GA4 een annotatie op de deploy-datum, zodat dit ook zichtbaar is voor wie deze spec niet leest.
