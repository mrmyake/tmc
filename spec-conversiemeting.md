# Spec: conversiemeting (GA4 en voorbereiding op Google Ads)

Welke conversies themovementclub.nl meet, waar ze vandaan komen, en onder welke toestemming ze naar Google gaan. Sluit aan op de meetgrens in `spec-analytics.md`, de pad-gate in `spec-analytics-scope.md` en de attributie in `spec-marketing-attribution.md`. Besloten ontwerp en akkoord Ilja, 2026-11-16.

## Doel

GA4 moet per conversie laten zien wat hij waard is en uit welk kanaal hij kwam, zodat Google Ads later op echte uitkomsten kan sturen. Drie dingen maken dat mogelijk:

1. De belangrijkste conversie, de proefboeking, wordt server-side gemeten op het moment dat hij definitief is (`trial_booked`), met een waarde.
2. De cookiebanner kent naast analytische cookies een tweede categorie, advertentiemeting. Zonder die keuze mag geen enkele conversie als advertentiedata naar Google.
3. De client-events zijn opgeschoond: leads vuren pas na een geslaagde aanvraag, en geen enkel client-event draagt nog een bedrag (op de vaste leadwaarde van `programma_intake` na).

Er komt geen Google Ads-tag op de site. De route naar Google Ads is de import van GA4 key events.

## Eventtabel

Alleen de events die deze spec raakt. Het volledige register staat in `spec-analytics.md`.

| Event | Moment | Bron | Parameters | Key event | Ads-rol (voorstel, Ilja beslist in Google Ads) |
|---|---|---|---|---|---|
| `trial_booked` | Proefboeking definitief. Betaald: de geslaagde overgang pending naar paid in de trial-webhook of in de cron `expire-trial-bookings`, na de controle op een geannuleerde sessie. Code: na een geslaagde `redeem_trial_code`. Gratis: na een geslaagde `book_opening_trial` | Server, Measurement Protocol (`src/lib/trial-bookings/ga-trial-booked.ts`) | `trial_type` (`paid`, `code`, `free`), `pillar`, `code` (alleen bij `code`), `action_page` (optioneel), `transaction_id` (het trial_booking-id), `currency` EUR, `value`, `session_id` | Ja | Primaire conversie |
| `purchase` | Order geactiveerd, exact een keer per order | Server, Measurement Protocol (`src/lib/orders/ga-purchase.ts`) | `transaction_id` (order-id), `currency` EUR, `value`, `session_id`, `items[0]` met `item_id`, `item_name`, `item_category`, `quantity` | Ja (bestaand) | Conversie met omzetwaarde |
| `generate_lead` | Na een 2xx van de bijbehorende API | Client (`trackLead`) | `lead_type`: `terugbelverzoek` (`/proefles`), `contact_form`, `overstap`, `yoga_quiz` | Ja (bestaand) | Secundaire conversie |
| `programma_intake` | Ongewijzigd: na een 2xx van `/api/leads/programma-intake` | Client | `value: 240`, `currency: EUR`, `lead_type` | Ja (bestaand) | Eigen conversie voor de 12-wekencampagne |
| `contact_click` | Klik op een publieke tel:-, mailto:- of wa.me-link | Client (`TrackedContactLink`, de enige call-site) | `method`: `whatsapp`, `phone`, `email` | Nee | Geen |
| `newsletter_signup` | Na een 2xx | Client (`trackNewsletterSignup`) | `location`: `banner` (InfoOptInBanner) of `yoga_quiz` (alleen met de tips-opt-in aangevinkt) | Nee | Geen |
| `payment_start` | Klik op "Betaal nu" op `/abonnement` of `/kopen` | Client | `context`, `plan_variant`. Geen `value`, geen `currency` meer | Nee | Geen |

### Toelichting per event

**`trial_booked`**

- `value`: bij `paid` het bedrag dat Mollie verwerkte. Bij `code` en `free` de drop-in-prijs van de pillar uit `tmc.catalogue`, op slug gelezen (`src/lib/trial-pricing.ts`): `drop_in` voor yoga, kettlebell en vrij trainen, `drop_in_kids` en `drop_in_senior` voor die pillars. Vrij trainen heeft geen eigen los tarief en krijgt daarom de prijs van `drop_in`. Er staat nergens een bedrag in de code. Is de catalogusrij niet te lezen, dan gaan `value` en `currency` niet mee.
- `code`: een unieke code (`tmc.trial_codes.max_uses = 1`) gaat als de waarde `uniek` mee, elke andere code letterlijk (gedeelde campagnecodes zoals MOVENOW en JOUWYOGA). Bij `paid` en `free` is er geen `code`.
- `action_page`: de slug van de actiepagina uit de proefles-funnel, gelezen uit `tmc.trial_bookings.action_page`. Zolang die kolom leeg is gaat de parameter niet mee: geen lege string, geen `none`. Zie "Open punten".
- **Testboekingen.** In productie vuurt het event nooit voor een `is_test`-boeking. Buiten productie is elke boeking een testboeking (`trialBookingMode()`), en vuurt het event wel, als intern verkeer (zie "MP-regels").
- **Exactly-once.** Bij betaald is de rijtelling van de guarded update (`status = 'pending'` naar `paid`, `.select("id")`) het signaal: precies een van webhook en cron wint. Bij code en gratis vuurt het event na de ene geslaagde RPC. De helper voegt geen eigen dedupe toe. Strikt genomen is het at-most-once: crasht de functie na de boeking en voor het verzoek, dan is dat ene event weg.
- **Geannuleerde sessie.** Annuleert `cancelIfSessionCancelled` de boeking direct na de overgang naar paid, dan vuurt er geen `trial_booked`.
- De client-side `trackLead("trial_booking", ...)` in `TrialBookingList` en `VisitorSlotPicker` is verwijderd.

**`purchase`**

- `item_category` uit `tmc.catalogue`, op `revenue_category`, met de rittenkaart op slug:

| Catalogus | `item_category` |
|---|---|
| `revenue_category = abonnement` (alle `*_2x`, `*_3x`, `*_unl`, ook kids en senior) | `abonnement` |
| `ten_ride_card`, `ten_ride_card_kids`, `ten_ride_card_senior` | `rittenkaart` |
| `revenue_category = personal_training` (`pt_single`, `pt_10`, `duo_single`, `duo_10`) | `pt` |
| `revenue_category = programma` (`program_studio_12w`, `program_online_12w`) | `programma` |
| Al het andere (`drop_in*`, `extended_access`, `signup_fee`) en een onbekende slug | `overig` |

- `item_name` is `display_name` uit de catalogus. Is de rij niet te lezen, dan gaat alleen `item_id` mee en gaat het event gewoon door.
- De helper wordt ge-awaited in de naloop van de activatieketen. Daarvoor was het een losse `void`, waardoor Vercel de functie kon bevriezen terwijl het verzoek nog liep; bij een productorder zonder Akiles-stap (rittenkaart, PT) kon dat het event kosten.
- Facturen vallen er bewust buiten: de invoices-webhook vuurt geen `purchase`.

**`generate_lead`** draagt geen `value`, geen `currency`, en niet meer `event_category` of `event_label`. De call-sites in `ProeflesContent` en `ContactForm` vuurden bij de submit, voor de fetch; ze vuren nu na een 2xx. De bevestiging aan de bezoeker is ongewijzigd.

**`contact_click`** vervangt de helper `trackContact` en de nooit gebruikte events `click_phone`, `click_whatsapp` en `click_email`. Gemeten links: Footer (mail, telefoon), ContactSection op de homepage (mail, WhatsApp), `/contact` (telefoon, mail, WhatsApp), de privacyverklaring (drie keer mail), en elke tel:-, mailto:- of WhatsApp-link die via Sanity in een Portable Text-veld komt (`portableTextComponents`, gebruikt door alle vier de renderers).

**`newsletter_signup`** vervangt `trackLead("info_optin")`. De yoga-quiz-events `yoga_test_*` blijven ongewijzigd, inclusief hun strengere `hasConsent()`-poort; `generate_lead` (`yoga_quiz`) en `newsletter_signup` volgen de gewone Consent Mode.

## Consentmapping

De banner (`CookieConsent.tsx`, een component met twee mounts: `SiteShell` en via `ProgrammaCookieConsent` de layout van `/12-weken-programma`) kent twee categorieen:

- **Analytische cookies** sturen `analytics_storage`.
- **Advertentiemeting** stuurt `ad_storage` en `ad_user_data`.
- `ad_personalization` blijft altijd `denied`: geen remarketing.

Knoppen: Accepteren (beide granted), Weigeren (beide denied), en Zelf kiezen met een vinkje per categorie en Keuze opslaan. De link "Cookie-instellingen" in de footer en in de privacyverklaring heropent de banner met de huidige keuze voorgevuld; aan die link hangt geen tracking.

### Opslag

localStorage, sleutel `tmc_cookie_consent`, formaat v2:

```json
{"v":2,"analytics":"granted","ads":"denied"}
```

Het oude formaat was de kale string `granted` of `denied` en ging alleen over analytische cookies. Zo'n waarde betekent nooit advertentietoestemming. Wie een oude keuze heeft ziet de banner eenmalig opnieuw; tot de nieuwe keuze blijft de oude analytische keuze gelden. De pure kern staat in `src/lib/consent-core.ts`.

| Bannertoestand | `tmc_cookie_consent` | `analytics_storage` | `ad_storage`, `ad_user_data` | `ad_personalization` | `analytics_consent` (`lead_attributions`) | `ad_consent` (`trial_bookings`, `orders`) | MP-event (`purchase`, `trial_booked`) |
|---|---|---|---|---|---|---|---|
| Accepteren | v2, beide granted | granted | granted | denied | granted | granted | Ja, `ad_user_data` GRANTED |
| Weigeren | v2, beide denied | denied | denied | denied | denied | denied | Geen event |
| Alleen analytisch | v2, analytics granted, ads denied | granted | denied | denied | granted | denied | Ja, `ad_user_data` DENIED |
| Alleen advertentiemeting | v2, analytics denied, ads granted | denied | granted | denied | denied | granted | Geen event: zonder analytische toestemming worden er geen GA4-id's gelezen of opgeslagen |
| Oude keuze `granted` | kale string | granted | denied | denied | granted | unknown | Ja, `ad_user_data` DENIED |
| Oude keuze `denied` | kale string | denied | denied | denied | denied | unknown | Geen event |
| Geen keuze, onleesbare waarde of geblokkeerde storage | ontbreekt | denied | denied | denied | unknown | unknown | Geen event |

### MP-events bestaan alleen met analytische toestemming

Een server-side event (`purchase`, `trial_booked`) vertrekt uitsluitend voor een bezoeker die analytische cookies heeft geaccepteerd. Binnen die groep volgt `ad_user_data` de advertentiekeuze. De twee keuzes werken dus getrapt: analytisch bepaalt of er een event is, advertentiemeting bepaalt of Google het voor advertentiemeting mag gebruiken.

Dat wordt op twee plekken afgedwongen, omdat een MP-event alleen kan vertrekken als er een `ga_client_id` op de boeking of order staat:

1. **Client.** `readGaIds()` (`src/lib/ga-ids.ts`) geeft alleen id's terug als de analytische keuze `granted` is (formaat v2, of de oude waarde `granted`). Bij denied, geen keuze, een kapotte waarde of geblokkeerde storage is het resultaat leeg, zonder `gtag('get')`-aanroep en zonder lezing van de `_ga`-cookie. Zonder die poort gaf gtag in de cookieloze modus een tijdelijke client_id, en las de cookie-fallback een achtergebleven `_ga`-cookie van iemand die eerder accepteerde en later weigerde.
2. **Server.** De client stuurt naast `ad_consent` ook `analytics_consent` mee (zelfde bron als `analyticsConsentFromBanner`). `gaIdsForStorage` (`src/lib/ga-mp/store.ts`) schrijft `ga_client_id` en `ga_session_id` alleen bij `granted` en gooit ze anders weg. Dat geldt voor orders (`PayStage`, `createOrderAndCheckout`) en voor alle drie de proefles-schrijfpunten (betaald, code, gratis). Het is de enige plek in de code die `ga_client_id` schrijft.

`analytics_consent` wordt hier alleen als poort gebruikt en niet opgeslagen op de boeking of order; `ad_consent` wel, ook zonder analytische toestemming.

`analytics_consent` en `ad_consent` zijn twee verschillende dingen. `analytics_consent` mag nooit als bron voor `ad_user_data` dienen; `ad_consent` is de enige bron, en `unknown` telt als denied.

## Opslag voor de server-side events

Migratie `20261116120000_conversiemeting_ga_consent.sql`:

- `tmc.trial_bookings`: `ga_client_id`, `ga_session_id` (tekst, nullable), `ad_consent` (`granted`, `denied`, `unknown`, default `unknown`), `action_page` (tekst, nullable, `^[a-z0-9-]{1,64}$`).
- `tmc.orders`: `ad_consent` (zelfde check en default). `ga_client_id` en `ga_session_id` staan daar al sinds `20260816000000`.
- Geen grants, geen policies, geen functies: het patroon van `ga_client_id` op `tmc.orders`. `tmc.trial_bookings` blijft uitsluitend `service_role` (zelfcontrole in de migratie). Op `tmc.orders` kan een lid zijn eigen `ad_consent` lezen, net als zijn eigen `ga_client_id`.

Bij de proefles-submit en in `PayStage` leest de client `readGaIds()` en de twee bannerkeuzes (`readGaSubmitMeta`) en geeft ze mee aan de server action. De GA4-id's worden alleen gelezen en alleen opgeslagen met analytische toestemming (zie "MP-events bestaan alleen met analytische toestemming"). De server valideert ze opnieuw en schrijft ze met losse service-role-updates na de insert of RPC, nooit in de insert of RPC zelf. `ad_consent` heeft altijd een eigen update en een eigen select, nooit samen met `ga_client_id` of een andere kolom. Daardoor werkt de code ook voordat de migratie gepusht is: een ontbrekende kolom leidt alleen tot een gelogde fout en `ad_consent` `unknown`, nooit tot een gemiste `purchase` of een mislukte boeking. Zonder de kolommen is er geen `ga_client_id` op de proefboeking en vuurt `trial_booked` nog niet.

Geen wijziging aan `redeem_trial_code`, `book_opening_trial`, `create_order` of prijzen.

## MP-regels

Gelden voor `purchase` en `trial_booked`; de gedeelde code staat in `src/lib/ga-mp/` (`core.ts` puur, `send.ts` en `store.ts` server-only).

1. **Analytics laat nooit iets falen.** De helpers throwen nooit. Een fout levert alleen `console.error` op.
2. **De MP-URL wordt nooit gelogd.** Hij bevat het `api_secret`. Ook de respons-body en de fout van een mislukt verzoek worden niet gelogd, alleen een label, een id en de status.
3. **Stil overslaan** zonder `ga_client_id` (geen analytische toestemming, member-app, admin-betaallink) en zonder `GA4_API_SECRET`. Zonder analytische toestemming bestaat er nooit een `ga_client_id`: de client leest hem niet en de server slaat hem niet op.
4. **Geen `user_id`.**
5. **Bedragen alleen hier.** `value` komt uit Mollie (betaald) of uit `tmc.catalogue` (code en gratis), nooit uit de browser.
6. **Consent op requestniveau.** Elk verzoek draagt `"consent": { "ad_user_data": "GRANTED" | "DENIED", "ad_personalization": "DENIED" }`, naast `client_id` en `events`. `ad_user_data` volgt de opgeslagen `ad_consent`; `unknown` telt als denied. `ad_personalization` is altijd `DENIED`.
7. **Buiten productie** (`VERCEL_ENV` niet `production`) krijgt elk event de parameters `traffic_type: "internal"` en `debug_mode: true`, net als de client-hits uit `spec-analytics-scope.md`.
8. **Altijd ge-awaited, na de respons.** `trial_booked` draait binnen `after()` in de webhook, de cron en de twee server actions; `purchase` in de naloop van de activatieketen, die de webhook via `after()` draait.

Bron voor het consentformaat: Google, "Measurement Protocol reference", `developers.google.com/analytics/devguides/collection/protocol/ga4/reference`. Het formaat is bovendien gecontroleerd tegen de validatieserver (`/debug/mp/collect`) met `npm run test:conversiemeting-mp`: de vijf payloads geven geen validationMessages, en een payload met `granted` in kleine letters of een verkeerde veldnaam wordt geweigerd. `traffic_type` en `debug_mode` staan niet in die documentatie; ze gaan als gewone eventparameters mee.

## Bewust niet

- **Geen Google Ads-tag**, geen conversion linker, geen Meta-pixel. De route naar Google Ads is de import van GA4 key events.
- **Geen offline conversion upload** en geen Meta Conversions API.
- **Geen `ad_consent` op `tmc.lead_attributions`.** Die tabel houdt alleen `analytics_consent`; de advertentiekeuze staat op de boeking en de order.
- **Geen `purchase` op facturen.** De invoices-webhook vuurt niets.
- **Geen `user_id`** op welk event dan ook.
- **Geen remarketing**: `ad_personalization` is nergens granted, ook niet na Accepteren.
- **Geen wijziging aan `programma_intake`**: eigen event, eigen Ads-conversie, met de vaste leadwaarde van 240.
- **Geen wijziging aan de RPC's, `create_order` of prijzen.**
- **`YogaWaitlistForm` en `YogaWaitlistCta` blijven staan.** Ze zijn nergens gemount: dode code met een `trackLead("yoga_waitlist")` die bovendien niet op een 2xx wacht. Alleen de aanroep is aangepast aan de nieuwe signatuur. Wie de wachtlijst terugzet moet de call-site eerst gelijktrekken met de andere leads.
- **Geen tracking op de link "Cookie-instellingen".**
- **Geen `engagement_time_msec`** op de MP-events; de bestaande `purchase` stuurde hem ook niet.
- **`types/supabase.ts` is niet bijgewerkt**: de admin-client is ongetypeerd, en het bestand wordt na de db push opnieuw gegenereerd.

## Open punten

- **`action_page` wordt gevuld door de funnel-PR (`/actie/[slug]`).** Die PR moet de slug server-side tot aan de boeking dragen en in `tmc.trial_bookings.action_page` schrijven. De drie schrijfpunten zijn `startTrialBooking` (betaald en code) en `startOpeningTrialBooking`; de losse update na de insert of RPC staat er al (`storeTrialBookingGaMeta`). Geen enkele code in deze PR vult de kolom, en de helper neemt `action_page` alleen op als hij gevuld is. **Opgelost in de funnel-PR (`spec-proefles-funnel.md`, PR 2):** alleen het codepad schrijft de kolom, in `tmc.redeem_trial_code` zelf (parameter `p_campaign_slug`, gevalideerd tegen `tmc.campaign_landings`); de kolom heeft sindsdien een foreign key naar `campaign_landings(slug)`. Betaalde boekingen en de openingsflow laten `action_page` leeg.
- **Bewaartermijn** van `ga_client_id` en `ga_session_id` op `tmc.trial_bookings` en `tmc.orders`: geen automatische opruiming. Hoort bij dezelfde afweging als de bewaartermijn van `tmc.lead_attributions`.
- **Datafilter voor intern verkeer.** Of het GA4-datafilter op `traffic_type` ook de MP-events van de preview pakt, blijkt pas in DebugView.
- **`contact_click` als key event**: nu niet; Ilja kan dat in GA4 alsnog aanzetten.
- **Bestaande test.** `scripts/opening-trial/trial-core.test.mts` faalt op `origin/main` al (een verdwenen export); niet door deze PR en hier niet gerepareerd.

## Handmatige stappen Ilja

**Uitrol**

1. PR mergen na een groene preview. De code werkt ook voor de db push.
2. `supabase db push` voor migratie `20261116120000` (schema `tmc`). Vanaf dan worden `ga_client_id` en `ad_consent` opgeslagen en vuurt `trial_booked`.
3. `types/supabase.ts` opnieuw genereren.
4. Controleren dat `GA4_API_SECRET` in Vercel staat voor Production en Preview.

**GA4 (Admin)**

1. `trial_booked` markeren als key event. `generate_lead`, `purchase` en `programma_intake` zijn dat al.
2. Aangepaste dimensies (bereik: gebeurtenis) aanmaken voor `trial_type`, `pillar`, `code`, `action_page`, `lead_type`, `method` en `location`.
3. De regel voor `booking_complete` weghalen onder Gebeurtenissen (maken of wijzigen): dat event staat niet in de code.
4. Een annotatie zetten op de deploy-datum: `generate_lead` verliest `event_label` en `value` en krijgt `lead_type`, de proefboeking verhuist van `generate_lead` (`trial_booking`) naar `trial_booked`, `payment_start` verliest zijn bedrag, en `info_optin` wordt `newsletter_signup`. Vergelijk deze reeksen niet over de deploy-datum heen.
5. Toestemmingsinstellingen controleren (Admin, Gegevensverzameling): na de deploy horen `ad_storage` en `ad_user_data` als signaal binnen te komen.

**Google Ads**

1. GA4 koppelen aan het Google Ads-account, als dat nog niet is gebeurd.
2. De key events importeren als conversies: `trial_booked` als primaire conversie, de rest naar keuze (zie de kolom Ads-rol).
3. Geen remarketinglijsten aanmaken: `ad_personalization` is altijd denied.

## Ledger

| PR | Branch | Merge-hash | Datum | Wat | Bewust niet aangeraakt |
|---|---|---|---|---|---|
| #348 | `feat/conversiemeting` | `c1bf720` | 2026-11-16 | Server-side `trial_booked` (webhook, cron, code en gratis), GA4-id's alleen gelezen en opgeslagen met analytische toestemming (poort in `readGaIds` en server-vangrail `gaIdsForStorage`), `purchase` met `item_name` en `item_category` en ge-awaited in de naloop, gedeelde MP-helper met consent-object en `traffic_type` buiten productie, cookiebanner met advertentiemeting en consentformaat v2, link Cookie-instellingen, `generate_lead` pas na een 2xx met `lead_type`, `contact_click` via `TrackedContactLink` en de Portable Text-link-mark, `newsletter_signup`, `payment_start` zonder bedrag, migratie `20261116120000` (op 2026-11-16 gepusht met `supabase db push`, dry-run toonde alleen deze ene; read-only geverifieerd: de vier kolommen op `tmc.trial_bookings` en `ad_consent` op `tmc.orders` met default `unknown` en de drie checks, `has_table_privilege` false voor `anon` en `authenticated` op `tmc.trial_bookings`, policies ongewijzigd, `migration list` toont de versie lokaal en remote), privacytekst gemarkeerd voor Marlon | De RPC's `redeem_trial_code` en `book_opening_trial`, `create_order`, prijzen, `programma_intake`, de `yoga_test_*`-events, `tmc.lead_attributions`, de invoices-webhook, `YogaWaitlistForm` en `YogaWaitlistCta` (dode code), `types/supabase.ts`, een bewaartermijn voor de GA-id's, het vullen van `action_page` (funnel-PR) |
