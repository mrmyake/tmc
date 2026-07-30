# Analytics-audit — GA4 `G-2VFCDM4KRZ`

**Datum:** 2026-07-30
**Scope:** read-only inventarisatie van wat er vandaag daadwerkelijk naar GA4 gaat, en welke surfaces ongemeten zijn.
**Branch bij audit:** `docs/evaluatie-admin-leden` (HEAD `4b89d7f`)
**Aard:** feitelijk. Geen implementatie-aanbevelingen, alleen vaststellingen plus een rangschikking van de gaten.

---

## 1. Inventaris `src/lib/analytics.ts`

Het bestand exporteert **26 functies**. Hieronder per export het aantal call-sites in `src/` (exclusief het bestand zelf).

### 1.1 Generieke helpers

| Export | Call-sites | Waar |
|---|---|---|
| `trackEvent` | **0** | Alleen intern gebruikt door de andere helpers. Nooit direct aangeroepen. |
| `trackLead` | 12 | `early-member/OverstapLeadForm`, `early-member/EarlyMemberOptInForm`, `mobility-reset/MobilityResetContent`, `12-weken-programma/intake/ProgrammaIntakeContent`, `proefles/ProeflesContent`, `proefles/code/CodeRedeemFlow`, `proefles/boeken/TrialBookingList`, `mobility-check/MobilityCheckContent`, `beweeg-beter/BeweegBeterContent`, `blocks/ContactForm`, `blocks/InfoOptInBanner`, `blocks/yoga/YogaWaitlistForm` |
| `trackCTA` | 6 | `app/producten/_components/BuyButton` (1), `proefles/ProeflesChoice` (3), `abonnement/ConfigureStage` (1), `ui/TrackedLink` → `TrackedCTA` (1, zelf ongebruikt) |
| `trackContact` | 1 | `ui/TrackedLink` → `TrackedContactLink`, uitsluitend gemount op `/app/support` |
| `trackFormStart` | 14 | Alle bovenstaande formulieren + `abonnement/IdentifyStage` |
| `trackOutbound` | **0** | Nergens aangeroepen. |

### 1.2 Member-app helpers

| Export | Call-sites | Waar |
|---|---|---|
| `trackScheduleDayView` | 1 | `app/rooster/_components/DayStrip` |
| `trackSchedulePaginateForward` | 1 | `app/rooster/_components/DayStrip` |
| `trackMyBookingsTabSwitch` | 2 | `app/boekingen/_components/BoekingenTabs` |
| `trackRoosterFilter` | 1 | `app/rooster/_components/FilterChips` |

### 1.3 Identiteit & login

| Export | Call-sites | Waar |
|---|---|---|
| `setUserId` | 3 | `layout/AuthListener` (initial mount, `SIGNED_IN`, `SIGNED_OUT`) |
| `trackPortalLogin` | 2 | `login/LoginForm`, `layout/AuthListener` |

### 1.4 Booking-lifecycle

| Export | Call-sites | Waar |
|---|---|---|
| `trackBookingStart` | 1 | `app/rooster/_components/BookingSheet` (panel opent) |
| `trackBookingComplete` | 1 | `app/rooster/_components/BookingSheet` |
| `trackBookingCancel` | 1 | `app/rooster/_components/BookingSheet` |
| `trackWaitlistJoin` | 1 | `app/rooster/_components/BookingSheet` |

### 1.5 Membership-lifecycle

| Export | Call-sites | Waar |
|---|---|---|
| `trackMembershipView` | 1 | `app/abonnement/_components/MembershipViewTracker` |
| `trackMembershipPauseRequest` | 1 | `app/abonnement/_components/PauseDialog` |
| `trackMembershipCancelAttempt` | 1 | `app/abonnement/_components/MembershipActions` |
| `trackMembershipCancelComplete` | 1 | `app/abonnement/_components/CancellationDialog` |

### 1.6 Profiel & onboarding

| Export | Call-sites | Waar |
|---|---|---|
| `trackProfileUpdate` | 1 | `app/profiel/ProfileForm` |
| `trackHealthIntakeStart` | 1 | `app/profiel/intake/IntakeForm` |
| `trackHealthIntakeComplete` | 1 | `app/profiel/intake/IntakeForm` |

### 1.7 Payment

| Export | Call-sites | Waar |
|---|---|---|
| `trackPaymentStart` | 2 | `abonnement/PayStage`, `app/producten/_components/BuyButton` |
| `trackPaymentSuccess` | 1 | `app/abonnement/bedankt/PaymentTracker` |
| `trackPaymentFailed` | 1 | `app/abonnement/bedankt/PaymentTracker` |

### 1.8 Correctie op de verwachting in de opdracht

De crowdfunding-helpers `trackViewItemList`, `trackSelectItem`, `trackBeginCheckout`, `trackPurchase` en `trackShare` **bestaan niet meer in de codebase**. Ze zijn verwijderd in commit `bab4894` ("chore: remove crowdfunding endpoints and dead helpers", #120, 2026-07-24), samen met de Mollie crowdfunding-endpoints. Ze zijn dus geen dode code — ze zijn weg. Er bestaat op dit moment **geen enkel GA4 e-commerce-event** (`view_item_list` / `select_item` / `begin_checkout` / `purchase`) in het project; de betaalmeting loopt volledig via de eigen `payment_*`-events.

---

## 2. Hoe GA4 geladen wordt en hoe consent de calls gate

### 2.1 Laadpad

Geen `@next/third-parties`. Eigen implementatie in twee delen:

1. **Inline script in `<head>`** (`src/app/layout.tsx:35-48`, `CONSENT_DEFAULTS_SCRIPT`). Zet `window.dataLayer`, definieert de `gtag()`-stub (klassiek script, dus de function-declaratie landt op `window`), leest `localStorage["tmc_cookie_consent"]` en vuurt `gtag("consent", "default", {...})` met `analytics_storage` = de opgeslagen keuze (of `"denied"`), `ad_storage`/`ad_user_data`/`ad_personalization` hard `"denied"`, `wait_for_update: 500`.
2. **`DeferredAnalytics`** (`src/components/analytics/DeferredAnalytics.tsx`), gemount onderaan `<body>` in de root layout. Laadt `googletagmanager.com/gtag/js` **pas na de eerste user-interactie** (`pointerdown`/`keydown`/`scroll`/`touchstart`) **of bij `requestIdleCallback`** (timeout 3500 ms; fallback `setTimeout` 3000 ms). Daarna volgt een tweede inline script met `gtag('js', …)` en `gtag('config', gaId)`.

### 2.2 Falen gtag-calls stil, of bufferen ze?

**Ze bufferen.** `trackEvent` guardt op `typeof window !== "undefined" && window.gtag`. Omdat de head-stub `window.gtag` al bij eerste paint definieert, is die guard vanaf paint waar en pusht elke `trackEvent` in `dataLayer`. De calls falen dus niet stil — ze wachten.

Twee feitelijke kanttekeningen bij die buffer:

- **Volgorde t.o.v. `config`.** Events die vóór het laden van gtag.js worden gevuurd, staan in `dataLayer` **vóór** de `gtag('config', gaId)`-call, die pas door `DeferredAnalytics` wordt toegevoegd. gtag.js verwerkt de queue in volgorde; een `event`-command dat aan elke `config` voorafgaat heeft geen geconfigureerde bestemming. Dit raakt alleen events die binnen de idle/interactie-window vallen — in de praktijk het smalle venster tussen paint en eerste scroll/klik.
- **Consent-default is `denied` voor elke nieuwe bezoeker.** Met `analytics_storage: "denied"` verstuurt gtag cookieless pings: events komen aan, maar zonder persistente `client_id`. Er is geen consent-retentie van hits die vóór de keuze zijn gevuurd.

### 2.3 Consent-flip

`src/lib/consent.ts` schrijft naar `localStorage["tmc_cookie_consent"]` en roept `gtag("consent", "update", { analytics_storage: state })` aan. Bij `granted` vuurt het handmatig één `page_view` na, omdat Consent Mode de pending hit niet vasthoudt. Geen `window.location.reload()`.

### 2.4 Waar de banner wél en niet staat — bepalend voor de hele meting

`CookieConsent` wordt gerenderd in `src/components/layout/SiteShell.tsx:77`. SiteShell **rendert alleen `{children}`, zonder banner**, voor de paden (`SiteShell.tsx:62`):

```
/studio  ·  /app  en /app/*  ·  /login  ·  /checkin*  ·  /12-weken-programma*  ·  /betaal/*
```

Alleen `/12-weken-programma` haalt de banner expliciet terug via een eigen wrapper (`_components/ProgrammaCookieConsent.tsx`).

**Gevolg:** een bezoeker die rechtstreeks op `/login`, `/app/**`, `/checkin` of `/betaal/<token>` binnenkomt, krijgt de consent-banner nooit te zien. De consent-state blijft `denied` (default), en `setUserId` is in `AuthListener` expliciet gegate op `getConsent() === "granted"` — die gebruiker krijgt dus **nooit een GA4 `user_id`**, en alle member-app-events blijven cookieless. Alleen wie eerst een marketingpagina heeft bezocht en daar heeft geaccepteerd, meet volledig.

### 2.5 SPA-pageviews

Er is **geen route-change-hook** die bij client-side navigatie een `page_view` vuurt (grep op `usePathname` in combinatie met analytics/pageview levert niets op). Na de initiële `gtag('config')` hangt pageview-meting bij soft navigation volledig af van GA4's Enhanced Measurement "page changes based on browser history events" — een instelling in de GA4-admin, niet in deze repo, en dus niet vanuit de code verifieerbaar.

---

## 3. Per-route status

Legenda: **gemeten** = de kern-conversie/interactie van die surface vuurt · **deels** = sommige interacties wel, andere niet · **niet gemeten** = geen enkele analytics-call.

### 3.1 Marketing

| Route | Status | Wat er staat |
|---|---|---|
| `/` (homepage) | **niet gemeten** | Geen enkele analytics-import in `page.tsx` of in de blocks (`Hero`, `PhilosophyGrid`, `ScheduleTeaser`, `StudioSection`, `TrainerSpotlight`, `OfferingCards`, `YogaTeaser`, `PricingTable`, `ContactSection`, `TestimonialCarousel`). Geen `cta_click` op de hero-CTA's, geen `section_view`. De enige meting op de homepage is de globale `InfoOptInBanner` (site-breed, zie hieronder). |
| `/prijzen` | **niet gemeten** | `PrijzenContent.tsx` heeft geen analytics-import. Geen CTA-tracking, geen plan-interactie. |
| `/aanbod` | **niet gemeten** | `AanbodContent.tsx` heeft geen analytics-import. |
| `/proefles` | **gemeten** | `ProeflesChoice`: 3× `cta_click` ("Boek direct", "Ik heb een code", "Liever gebeld worden"). `ProeflesContent`: `form_start` + `generate_lead(proefles_booking, 20)`. |
| `/proefles/boeken` | **gemeten** | `form_start(trial_booking_form)` + `generate_lead(trial_booking, prijs)`. |
| `/proefles/code` | **gemeten** | `form_start(trial_code_booking_form)` + `generate_lead(trial_code_booking)`. |
| `/mobility-check` | **gemeten** | `form_start(mobility_check_form)` + `generate_lead(mobility_check_booking, 25)`. |
| `/beweeg-beter` | **gemeten** | `form_start` + `generate_lead(pdf_beweeg_beter, 1)`. |
| `/mobility-reset` | **gemeten** | `form_start` + `generate_lead(mobility_reset_optin, 5)`. |
| `/early-member` | **deels** | Beide formulieren meten: `EarlyMemberOptInForm` (`form_start` + `generate_lead(early_member_optin)`) en `OverstapLeadForm` (`form_start` + `generate_lead(overstap_aanvraag)`). `EarlyMemberContent.tsx` zelf heeft geen tracking: geen `cta_click`, geen sectie-/scroll-events op de campagnepagina. |
| `/contact` | **gemeten** | `ContactForm`: `form_start` + `generate_lead(contact_form, 10)`. |
| `/12-weken-programma` + `/intake` | **deels** | Intake meet (`form_start` + `generate_lead(programma_intake_booking, 25)`). De microsite-pagina zelf en `ProgrammaTopbar` meten niets. |
| Site-breed `InfoOptInBanner` | **gemeten** | `form_start(banner_info_optin)` + `generate_lead(info_optin, 1)`. Niet gemount op de uitgesloten paden (§2.4). |
| Yoga-wachtlijst (`YogaWaitlistCta`) | **gemeten** | `form_start` + `generate_lead(yoga_waitlist, 5)`. |
| Footer / Navbar contactlinks | **niet gemeten** | `Footer.tsx` gebruikt gewone `QuietLink` voor `mailto:` en `tel:` — geen `TrackedContactLink`. Navbar heeft geen contactlinks en de primaire CTA `Plan je proefles` (`Button href="/proefles"`, regel 189 en 304) vuurt geen `cta_click`. `trackContact` bestaat dus alleen op `/app/support`. |

### 3.2 `/abonnement` — configurator en de 9 slug-varianten

Feitelijke correctie op de vraagstelling: er zijn **geen 9 slug-routes**. `/abonnement` is één route (`src/app/abonnement/page.tsx`) met een client-side stage-machine. De 9 varianten zijn catalogusrijen — `FAMILIES` (`groepslessen`, `vrij_trainen`, `all_inclusive`) × `FREQUENCIES` (`2x`, `3x`, `unl`), samengesteld door `planSlug()` in `src/app/abonnement/lib.ts`. Ze hebben geen eigen URL en er is geen state in de URL: de hele configuratie leeft in React-state. Dat is relevant voor de meting — zonder events is er geen enkel signaal over welke variant iemand bekijkt of kiest.

| Stage / interactie | Status | Detail |
|---|---|---|
| Pagina-load `/abonnement` | **niet gemeten** | Geen view-event. Ook geen `view_item_list`-equivalent voor het kaartenoverzicht. |
| **ConfigureStage** — kaartselectie (`setSelectedCardId`, 7 kaarten: 6 basiskaarten + All Access) | **niet gemeten** | `onClick={() => setSelectedCardId(id)}` op regel 369 en 433 — geen analytics. |
| **ConfigureStage** — "Onbeperkt vrij trainen erbij" (plus-30 `vt`-toggle, `toggleVt`, regel 323) | **niet gemeten** | Dit is een familie-swap naar `all_inclusive_{freq}`, dus een echte productwissel. Geen event. |
| **ConfigureStage** — "Verlengde toegang 06:00-23:00" (`ext`-toggle, `toggleExt`, regel 341) | **niet gemeten** | Add-on met eigen prijs. Geen event. |
| **ConfigureStage** — looptijd 12 vs 24 maanden (`setCommit24m`, regel 491 en 503) | **niet gemeten** | 8%-kortingskeuze. Geen event. |
| **ConfigureStage** — "Ga verder" | **deels** | `trackCTA("Ga verder", "/abonnement")` (regel 242). De payload bevat **niet** welk plan, welke frequentie, welke toggles of welke looptijd gekozen is — de gekozen variant is uit dit event niet af te leiden. |
| **IdentifyStage** — e-mail/OTP | **deels** | `trackFormStart("abonnement_identify")` (regel 104). Geen event bij verzonden code, bij succesvolle verificatie of bij OTP-fout. `trackPortalLogin` vuurt hier wel indirect via `AuthListener` op `SIGNED_IN`. |
| **PayStage** — pagina | **niet gemeten** | Geen view-event op de bevestigingsstap. |
| **PayStage** — "Betaal nu" | **gemeten** | `trackPaymentStart({ amount: res.amountCents/100, context: "first_membership", planVariant: plan.slug })` (regel 58). Dit is het **enige** event in de hele funnel dat de gekozen slug bevat, en het vuurt pas ná een geslaagde `create_order`. |
| **PayStage** — mislukte `create_order` | **niet gemeten** | Bij `!res.ok` wordt alleen `setError` gedaan. Alle geweigerde orders (`existing_membership`, `existing_open_order`, `em_and_24m_exclusive`, `commit_24m_not_offered`, …) zijn onzichtbaar in GA4. |

### 3.3 Checkout-pijplijn

| Schakel | Status | Detail |
|---|---|---|
| `createOrderAndCheckout` (`src/lib/orders/create-order.ts`, `"use server"`) | **niet gemeten in GA4** | Server action. Schrijft wel een intern event via `emitEvent({ type: "order.created", … })` naar de eigen events-tabel, met `slug`, `first_charge_cents` en `early_member`. Dat is Supabase-telemetrie, geen GA4. |
| `create_order` RPC (Postgres) | **niet gemeten** | Autoritatieve prijsberekening + guards. Faalreden (`reason`) komt terug naar de client maar wordt nergens naar GA4 gestuurd. |
| Mollie-redirect (`window.location.href = res.checkoutUrl`) | **gemeten (vertrek)** | `trackPaymentStart` vuurt direct vóór de redirect, in zowel `PayStage` als `BuyButton`. Wat er op Mollie's domein gebeurt is per definitie buiten bereik. |
| Mollie webhook (`src/app/api/mollie/webhook`) | **niet gemeten** | Server-side, geen GA4-call (zie §4). |
| Return-route **abonnement**: `/app/abonnement/bedankt?order=<id>` | **deels** | `PaymentTracker` vuurt `payment_success` bij `status === "activated"` en `payment_failed` bij `expired`/`cancelled`, met sessionStorage-dedupe per `transactionId`. **Bij `status === "pending"` of `"paid"` vuurt niets** (regel 34: `return`), en er is geen herkansing — een gebruiker die terugkeert vóórdat de webhook `activate_order` heeft laten lopen, wordt nooit als conversie geteld. Dat is de normale race, niet een randgeval. |
| Return-route **producten**: `/app/producten?tab=tegoed` | **niet gemeten** | `createOrderAndCheckout` stuurt niet-abonnement-orders hierheen (regel 157-159). Op die pagina staat geen tracker. Voor PT-pakketten en 10-rittenkaarten bestaat dus **wel** `payment_start` maar **geen** `payment_success`/`payment_failed`. |

### 3.4 Member-app (`/app`)

| Surface | Status | Detail |
|---|---|---|
| `/app` (dashboard-landing) | **niet gemeten** | Geen analytics-import. |
| `/app/rooster` | **gemeten** | `schedule_day_view` (DayStrip), `schedule_paginate_forward` (DayStrip), `rooster_filter` (FilterChips), `booking_start`/`booking_complete`/`booking_cancel`/`waitlist_join` (BookingSheet). Twee kanttekeningen: `trackBookingComplete` geeft `planType: "unknown"` en `creditCharged: false` **hardcoded** mee (BookingSheet regel 142-143) — beide dimensies zijn dus constant en dragen geen informatie. `trackBookingCancel` krijgt nooit een `reason` mee. |
| `/app/boekingen` | **deels** | `my_bookings_tab_switch` (BoekingenTabs) is het enige event. **`UpcomingRow.doCancel()` roept `cancelBooking()` aan zonder `trackBookingCancel`** — annuleringen vanaf de boekingenpagina worden niet gemeten, alleen die via de rooster-sheet. `booking_cancel` is daarmee structureel een ondertelling. `PtCancellationRequestAction` (PT-annuleerverzoek) meet niets. |
| `/app/producten` | **deels** | `BuyButton`: `cta_click` + `payment_start`. Geen tab-switch-event (`ProductenTabs`), geen view-event, geen `payment_success` op de terugkeer (§3.3). `TegoedPanel` meet niets. |
| `/app/abonnement` | **gemeten** | `membership_view` (MembershipViewTracker), `membership_pause_request` (PauseDialog), `membership_cancel_attempt` (MembershipActions), `membership_cancel_complete` (CancellationDialog). Dit is de best gedekte surface van de app. `GuestPassesSection` en `MembershipHistory` meten niets. |
| `/app/profiel` | **deels** | `profile_update` met lijst gewijzigde velden (ProfileForm). `health_intake_start` + `health_intake_complete` op `/app/profiel/intake`. Niet gemeten: `AvatarUpload`, `EmergencyContactForm`, `MarketingOptInToggle` (marketing-opt-in flip!), `AccountDeletionSection`/`DeleteAccountDialog` (account-verwijdering — geen churn-signaal). |
| `/app/pt` | **niet gemeten** | Geen analytics-import. Feitelijke noot: er ís geen PT-boekflow voor leden. Volgens de header-comment in `src/app/app/pt/page.tsx` (PT-agenda C1) plant Marlon PT volledig zelf in; de pagina is een informatieve landing. Er is dus geen zelfbedienings-boeking om te meten — wel een onbemeten pagina-ingang. |
| `/app/support` | **gemeten** | Enige plek met `TrackedContactLink` → `click_phone` / `click_whatsapp` / `click_email`. |
| `/login` | **deels** | `trackPortalLogin("otp")` in `LoginForm` (regel 124) plus nogmaals via `AuthListener` op `SIGNED_IN` — **op deze route vuurt `portal_login` dus mogelijk dubbel**. Geen `form_start`, geen event bij OTP-fout of resend. Bovendien: geen consent-banner en geen `UtmTracker` op deze route (§2.4). |
| `/checkin`, `/betaal/<token>`, `/app/trainer/**`, `/app/admin/**` | **niet gemeten** | Nul analytics-calls. Voor trainer/admin is dat een bewuste keuze (interne tooling); voor `/betaal/<token>` — de WS-5-betaallink die niet-ingelogde ontvangers via mail/WhatsApp bereiken — betekent het dat een volledige betaalflow buiten elke meting valt, inclusief de consent-banner (§2.4). |

---

## 4. Server-side event-verzending

**Vastgesteld: die bestaat niet.**

Grep over `src/` op `measurement_protocol`, `google-analytics.com/mp`, `api_secret`, `mp/collect` en `region1.google-analytics` levert **nul treffers**. Er is geen GA4 Measurement Protocol-call vanuit een route handler, server action, webhook of cron. Concreet:

- `src/app/api/mollie/webhook` — het punt waar een betaling daadwerkelijk als geslaagd bekend wordt — stuurt niets naar GA4.
- `src/app/api/trial-bookings/webhook`, `src/app/api/cron/*` en de `/api/leads/*` handlers evenmin.
- Het enige server-side telemetriepad is `emitEvent()` (`src/lib/events/emit.ts`) naar de eigen Supabase events-tabel. Dat is een interne audit-/eventlog, volledig losgekoppeld van GA4; er is geen brug tussen de twee.

Elk GA4-event in dit project is dus client-side en afhankelijk van (a) een geladen gtag.js en (b) het feit dat de gebruiker de betreffende pagina daadwerkelijk in beeld krijgt.

---

## 5. `user_id`-binding en UTM-persistentie

### 5.1 GA4 `user_id`

**Ja, dit bestaat.** `setUserId()` (`analytics.ts:94-100`) roept `gtag("config", GA_MEASUREMENT_ID, { user_id, send_page_view: false })` aan met de **opaque Supabase auth-UUID** — geen e-mail of andere PII.

Aangeroepen vanuit `src/components/layout/AuthListener.tsx`, gemount in de root layout, gestart bij `requestIdleCallback` (timeout 4000 ms) met dynamische import van de Supabase-browserclient:
- initial mount met bestaande sessie → `setUserId(user.id)`, **alleen als `getConsent() === "granted"`**;
- `SIGNED_IN` → idem, plus `trackPortalLogin("otp")` (die laatste ongegate);
- `SIGNED_OUT` → `setUserId(null)`.

Twee feitelijke beperkingen:
1. De consent-gate in combinatie met §2.4: wie nooit een marketingpagina heeft gezien, krijgt de banner niet, houdt `denied`, en krijgt dus **nooit een `user_id`**. Voor de Capacitor-app geldt dat structureel (§6).
2. `setUserId` wordt bij `SIGNED_OUT` wél aangeroepen zonder consent-check, maar dat is een no-op-richting (clear).

### 5.2 UTM-persistentie

Twee onafhankelijke paden, beide first-touch-wint:

**a) sessionStorage → MailerLite.** `captureUtmFromUrl()` (`src/lib/utm.ts`) schrijft `utm_source/medium/campaign/content/term` naar `sessionStorage["tmc_utm"]`, en overschrijft nooit een bestaande set. Gemount via `UtmTracker` in `SiteShell.tsx:78` — **dus niet op `/app/**`, `/login`, `/checkin`, `/betaal/*`, `/studio`, `/12-weken-programma`**. Een bezoeker die met UTM-parameters rechtstreeks op `/login` of `/betaal/<token>` landt (bijvoorbeeld vanuit een MailerLite-mail), levert geen UTM-capture op. `getStoredUtm()` wordt uitgelezen door alle 8 lead-formulieren en doorgestuurd naar `/api/leads/*`, die het via `utmToMailerliteFields()` als `acquisition_source`/`_medium`/`_campaign`/`_content` + `signup_path` op de MailerLite-subscriber zet.

**b) sessionStorage → `tmc.profiles`.** **Dit bestaat.** `IdentifyStage.tsx:41-55` en `LoginForm.tsx:60-70` geven de UTM's mee als `raw_user_meta_data` in `supabase.auth.signInWithOtp({ options: { data: { acquisition_source, acquisition_medium, acquisition_campaign, acquisition_content, signup_path, first_touch_at } } })`. Migratie `20260429000000_profiles_acquisition.sql` voegt die zes kolommen toe aan `public.profiles` (met indexen op `acquisition_source`, `acquisition_campaign`, `signup_path`); de trigger `handle_new_auth_user` kopieert ze naar de profiles-rij met `ON CONFLICT DO NOTHING`, zodat een bestaand profiel nooit wordt overschreven.

De keten is dus compleet **behalve** dat de capture-stap (`UtmTracker`) juist ontbreekt op de twee routes waar de signup-schrijfactie plaatsvindt (`/login`, `/abonnement` valt er wel onder). Wie direct op `/login?utm_source=…` binnenkomt schrijft lege acquisition-velden weg — en door `ON CONFLICT DO NOTHING` is dat daarna permanent leeg. `src/lib/admin/customer-actions.ts:133` zet bij handmatige admin-aanmaak `signup_path: "admin_wizard"`.

---

## 6. Capacitor / native wrapper

**Vastgesteld: de webview pakt simpelweg de web-tag mee. Er is geen aparte GA4-configuratie, data stream of consent-pad.**

Onderbouwing:

- `capacitor.config.ts` draait in **server-mode**: `server.url = 'https://www.themovementclub.nl/app/rooster'`. Er is geen lokaal gebundelde webapp; de native app is een webview op de productie-deployment. Alle web-analytics laadt dus precies zoals in de browser.
- Geen native analytics-SDK. `package.json` bevat aan Capacitor-plugins alleen `@capacitor/android`, `ios`, `core`, `push-notifications`, `splash-screen`, `status-bar`. Geen `@capacitor-firebase/analytics`, geen `@capacitor-community/firebase-analytics`.
- De Firebase-referenties zijn **uitsluitend push**: `android/build.gradle` heeft `com.google.gms:google-services:4.4.4` en `android/app/build.gradle:48-53` past de plugin alleen toe als `google-services.json` bestaat, met logregel *"Push Notifications won't work"*. iOS heeft **geen** `GoogleService-Info.plist` in `ios/App/App/`. `firebase-admin` in `package.json` is server-side (FCM-verzending).
- Er is geen tweede GA4 measurement-ID in de codebase; `G-2VFCDM4KRZ` is de enige, hardcoded op twee plekken (`analytics.ts:7` en de layout-constante).

**Consequentie die specifiek voor native geldt:** de app start op `/app/rooster`. Dat pad valt binnen de SiteShell-uitsluiting (§2.4), dus **de consent-banner wordt in de native app nooit getoond**. Zonder eerdere marketing-bezoek in diezelfde webview blijft `localStorage["tmc_cookie_consent"]` leeg → `analytics_storage: "denied"` → cookieless pings zonder stabiele `client_id`, en `setUserId` vuurt nooit. Alle native app-gebruik is daarmee effectief anoniem en niet aan een lid te koppelen. Dezelfde webview mist ook `UtmTracker`.

---

## 7. Dode code

| Item | Locatie | Vaststelling |
|---|---|---|
| `trackOutbound` | `src/lib/analytics.ts:52-57` | Geëxporteerd, **nul call-sites**. Het `click_outbound`-event uit CLAUDE.md bestaat dus niet in productie (Instagram-, Google Maps- en overige externe links zijn ongemeten). |
| `trackEvent` | `src/lib/analytics.ts:16-20` | Geëxporteerd, **nul externe call-sites**. Wordt alleen intern door de andere helpers gebruikt; de export zelf is ongebruikt. |
| `TrackedCTA` | `src/components/ui/TrackedLink.tsx:39-56` | Component geëxporteerd, **nergens geïmporteerd**. De enige consument van dat bestand is `/app/support`, en die importeert alleen `TrackedContactLink`. Dit is de reden dat `trackCTA` via dit pad nul echte call-sites heeft. |

Niet dode code maar wel loze parameters:

| Item | Locatie | Vaststelling |
|---|---|---|
| `booking_complete.plan_type` | `BookingSheet.tsx:142` | Hardcoded `"unknown"` — altijd dezelfde waarde. |
| `booking_complete.credit_charged` | `BookingSheet.tsx:143` | Hardcoded `false` — altijd `0`. |
| `booking_cancel.reason` | `BookingSheet.tsx:190` | Optioneel veld, nooit meegegeven. |

**Niet dode code:** de vijf crowdfunding-helpers uit de opdracht bestaan niet meer (verwijderd in `bab4894`, zie §1.8).

---

## 8. Hoogste-impact gaten

Gerangschikt op wat het meest kost om níet te weten — dus op beslissingswaarde, niet op implementatiegemak.

### 1. De hele `/abonnement`-configurator is stil tot vlak vóór de betaling

Tussen "pagina geopend" en "Betaal nu" ligt de complete productkeuze: 7 kaarten, de plus-30 vrij-trainen-swap, de verlengde-toegang-addon en de 12-vs-24-maanden-toggle. Daarvan wordt **niets** gemeten, en het enige tussenliggende event (`cta_click("Ga verder")`) bevat de keuze niet. Er is ook geen URL-state om achteraf uit af te leiden. Gevolg: van de negen abonnementsvarianten is niet vast te stellen welke bekeken, overwogen of afgehaakt worden — alleen welke uiteindelijk betaald is. Bij een prijsstructuur waar de omzet volledig in die keuze zit, is dit het duurste blinde vlak dat er is. Bovendien zijn geweigerde `create_order`-pogingen (`existing_membership`, `existing_open_order`, EM/24m-conflict) volledig onzichtbaar, dus een deel van de uitval is niet eens als uitval zichtbaar.

### 2. Consent-banner en UTM-capture ontbreken op elke ingelogde en transactionele route

`/app/**`, `/login`, `/checkin` en `/betaal/*` renderen geen `CookieConsent` en geen `UtmTracker`. Wie daar rechtstreeks binnenkomt houdt `analytics_storage: "denied"`, krijgt nooit een `user_id`, en laat geen UTM's achter — ook niet in `profiles.acquisition_*`, waar `ON CONFLICT DO NOTHING` dat daarna permanent maakt. Dit ondermijnt met terugwerkende kracht alle andere member-app-meting: de 14 zorgvuldig gebouwde member-events landen in GA4 zonder identiteit en zonder acquisitiebron, waardoor de cohort- en lifecycle-analyse die `setUserId` moest ontsluiten in de praktijk niet werkt. Het raakt bovendien 100% van de native app-gebruikers (§6) en alle ontvangers van een WS-5-betaallink.

### 3. Betaalconversie wordt structureel ondergeteld — en voor producten helemaal niet gemeten

Twee onafhankelijke lekken in dezelfde funnel. (a) `PaymentTracker` vuurt alleen bij order-status `activated`; wie terugkeert terwijl de Mollie-webhook nog niet is verwerkt ziet `pending` of `paid`, er vuurt niets, en er is geen herkansing — dat is de normale race, niet een randgeval. (b) Product-orders (PT-pakketten, 10-rittenkaarten) redirecten naar `/app/producten?tab=tegoed`, waar geen tracker staat: er is `payment_start` zonder enige tegenhanger. Netto is de `payment_start → payment_success`-ratio in GA4 geen conversieratio maar een artefact van webhook-timing plus producttype. Omdat er ook geen server-side Measurement Protocol bestaat (§4), is er geen tweede bron om dit tegen af te zetten.

### 4. De volledige marketing-top-of-funnel meet alleen formulier-submits

`/`, `/prijzen`, `/aanbod` en de `/early-member`-campagnepagina hebben nul CTA-, sectie- of scroll-tracking; `trackOutbound` is nooit aangeroepen; de footer-`tel:`/`mailto:`-links en de navbar-CTA "Plan je proefles" (op elke pagina, de primaire actie van de site) vuren niets. Alleen `/app/support` meet contactklikken. Het gevolg is dat de trechter pas zichtbaar wordt op het moment dat iemand al een formulier invult: er is geen data over welke pagina, welke sectie of welke CTA die intentie heeft veroorzaakt. Attributie tussen pagina's berust volledig op GA4's standaard pageview-pad — dat bij client-side navigatie zelf onzeker is (§2.5).

### 5. `booking_cancel` mist de helft van zijn events, en `booking_complete` mist zijn segmentatie

Annuleren kan op twee plekken; alleen de rooster-sheet meet het. `UpcomingRow.doCancel()` op `/app/boekingen` — de plek waar een lid zijn eigen aankomende boekingen ziet en dus de meest voor de hand liggende annuleerplek — roept `cancelBooking()` aan zonder event. Elke no-show/late-cancel-analyse en elke afgeleide capaciteitsbeslissing rust dus op een onbekend deel van de werkelijkheid. Tegelijk zijn `plan_type` (`"unknown"`) en `credit_charged` (`false`) in `booking_complete` hardcoded constanten, waardoor de twee dimensies die boekgedrag aan abonnementstype en creditverbruik zouden koppelen, leeg zijn. De booking-events zien er in GA4 compleet uit en zijn dat niet — dat maakt dit gat gevaarlijker dan een simpelweg ontbrekend event.

---

*Read-only audit. Geen code gewijzigd, geen PR geopend.*
