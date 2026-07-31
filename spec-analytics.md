# Spec: Analytics — de meetgrens

## Status

**Besloten en gebouwd.** De meetgrens is geïmplementeerd (#134), en de conversiebrug — het server-side `purchase`-event vanuit de Mollie-webhook — is gebouwd in PR C (`sendPurchaseToGa4`, zie "De conversiebrug" hieronder). Enige open rest: de herziening van `payment_start`. Dit document vervangt `TRACKING.md`, dat verwijderd is omdat het crowdfunding-helpers beschreef die in #120 al waren weggehaald en negen slug-routes die niet bestaan.

Achtergrond en de feitelijke nulmeting: `docs/analytics-audit-2026-07.md`.

---

## Het probleem dat dit oplost

De codebase had twee eventsystemen die hetzelfde probeerden te meten. GA4 kreeg client-side events voor boeken, annuleren, pauzeren, profiel-updates en roosternavigatie; `tmc.events` kreeg server-side domein-events voor grotendeels dezelfde handelingen. Dat leverde drie problemen op.

**GA4 was structureel de slechtere bron voor dat gedrag.** De consent-banner staat niet op `/app/**`, dus de consent-state blijft daar `denied` en alle member-app-events kwamen cookieless binnen, zonder `user_id`. Wie rechtstreeks op de app binnenkwam — inclusief 100% van de native app-gebruikers — werd nooit geïdentificeerd. `tmc.events` heeft dat probleem niet: die rijen hangen al aan een `profile_id`, zijn niet consent-afhankelijk, en zijn server-side dus niet te blokkeren door een adblocker.

**Twee bronnen die niet overeenkomen zijn erger dan één.** `booking_cancel` vuurde alleen vanuit de rooster-sheet en niet vanuit `/app/boekingen`; `booking_complete` had `plan_type: "unknown"` en `credit_charged: false` hardcoded. De GA4-events zagen er compleet uit en waren dat niet — gevaarlijker dan een ontbrekend event, want je merkt het niet.

**Het onderhoud viel dubbel.** Elke nieuwe member-app-feature vroeg om twee instrumentaties, met twee kansen om het te vergeten.

---

## De meetgrens

> **GA4 meet uitsluitend acquisitie op de publieke site, tot en met de conversie. Productgedrag achter login gaat naar `tmc.events`.**

Eén regel, twee systemen, geen overlap.

### Wat naar GA4 gaat

Alles op de publieke marketingsite, tot het moment dat iemand klant wordt.

| Categorie | Events |
|---|---|
| Lead-conversie | `generate_lead` (via `trackLead`) |
| Formulier-intentie | `form_start` |
| CTA-interactie | `cta_click` |
| Contactklik | `click_phone` · `click_whatsapp` · `click_email` |
| Configurator (`/abonnement`) | `configurator_stage_view` · `configurator_select` · `begin_checkout` · `checkout_rejected` |
| Login-conversie | `portal_login` |
| Betaling | `payment_start` (voorlopig, herziening volgt) · `payment_return_view` (arrival, geen bedrag) · `purchase` (server-side, Measurement Protocol) |

De configurator staat bewust aan de GA4-kant: `/abonnement` is een publieke route en de productkeuze dáár is een acquisitiebeslissing, geen productgebruik.

`payment_start` staat hier met een asterisk: client-side mét bedrag, de laatste in zijn soort. Herziening volgt; de omzetmeting zelf leunt er sinds de conversiebrug niet meer op.

### Wat naar `tmc.events` gaat

Alles achter login. Boeken, annuleren, wachtlijst, check-in, pauzeren, opzeggen, profiel-updates, health intake, roosternavigatie, credit-mutaties, PT-boekingen.

Deze events bestaan al grotendeels — `emitEvent()` in `src/lib/events/emit.ts` schrijft ze. Deze spec voegt er geen toe; hij legt alleen vast dat dit de plek is waar ze horen.

### De routegrens in code

`src/components/layout/SiteShell.tsx` sluit `/studio`, `/app/**`, `/login`, `/checkin*`, `/12-weken-programma*` en `/betaal/*` uit van de marketing-chrome, inclusief `CookieConsent`. Die uitsluiting *is* de meetgrens. De comment daar zegt dat expliciet, zodat niemand het later "repareert" door een banner toe te voegen.

Eén uitzondering: `UtmTracker` mount wél op `/login` en `/betaal/<token>`. Dat zijn kale routes waar een campagne rechtstreeks op kan landen (MailerLite-mail, betaallink via WhatsApp), en de UTM's die daar binnenkomen zijn acquisitie-data. Zonder die mount schrijft de signup lege `acquisition_*`-velden weg, die door `ON CONFLICT DO NOTHING` in `handle_new_auth_user` daarna permanent leeg blijven. `UtmTracker` schrijft naar `sessionStorage`, zet geen cookie en raakt de consent-state niet aan.

---

## Principe: vuurt deze haak ook als er niets gebeurd is?

> **De test is niet of een event aan een lifecycle-hook hangt. De test is of die haak ook vuurt wanneer er niets gebeurd is. Zo ja: verkeerde haak.**

"Nooit een `useEffect`" is de verkeerde regel — te grof, en 'ie keurt legitieme aankomst-events af terwijl 'ie de echte fout niet vangt. Een `onFocus` is bijvoorbeeld een gebruikershandeling, tot het veld `autoFocus` heeft; dan vuurt 'ie bij mount en is het precies dezelfde fout als `portal_login`, alleen vermomd als user-event. Omgekeerd is een `useEffect` die exact één keer per stage-wissel vuurt volkomen in orde.

Stel bij elke nieuwe call-site dus niet de vraag "werkt het" maar: **noem één situatie waarin deze haak vuurt terwijl de gebruiker niets deed.** Kun je er een noemen — tab-refocus, token-refresh, remount bij client-side navigatie, achtergrond-hydratie, StrictMode-dubbelmount, `autoFocus` — dan meet het event iets anders dan de naam belooft. Dat is van buitenaf niet te zien: het event ziet er in GA4 volkomen normaal uit, en de telling is stilletjes opgeblazen.

### Het gedocumenteerde voorbeeld: `portal_login`

`AuthListener` hing in de root layout en vuurde `portal_login` op het Supabase-event `SIGNED_IN`. Dat leek de juiste haak en was het niet. Geverifieerd in de geïnstalleerde `@supabase/auth-js`:

- `_recoverAndRefresh()` (`GoTrueClient.js:3778`) emit `SIGNED_IN` zodra een opgeslagen sessie uit storage wordt geladen en nog geldig is (regel 3857).
- Die functie draait vanuit `_initialize()` (regel 313) — élke client-boot — én vanuit `_onVisibilityChanged()` (regel 4250), gekoppeld aan `visibilitychange`.
- De JSDoc erbij: *"Emitted each time a user session is confirmed or re-established, including on user sign in and when refocusing a tab. […] This event can fire very frequently depending on the number of tabs open in your application."*

Gevolg: het event telde **sessies bevestigd**, niet logins. Het vuurde bij sessieherstel op elke pagina-boot en bij elke tab-refocus, ook op publieke marketingpagina's voor een al ingelogde bezoeker. En één echte login leverde er minstens twee op: `LoginForm` vuurt 'm zelf na een geslaagde `verifyLoginOtp` en doet daarna `window.location.assign()`, wat een verse client boot en dus opnieuw `SIGNED_IN`.

De aanroep leeft nu uitsluitend in `src/app/login/LoginForm.tsx`, direct achter de geslaagde OTP-verificatie. Dát is de handeling.

### De enige toegestane uitzondering: aankomst-events

Een "iemand heeft deze stap of pagina bereikt"-event heeft per definitie geen handeling om aan te hangen; de aankomst *is* de gebeurtenis. Zo'n event mag aan een mount hangen, op drie voorwaarden:

1. De mount valt 1-op-1 samen met de gebeurtenis die je meet — dus geen haak die ook bij refocus, token-refresh of achtergrond-hydratie vuurt.
2. Er is dedupe als herhaald vuren de telling zou vervuilen.
3. **Het event draagt geen bedrag.** Geen `value`, geen `currency`. Een aankomst is per definitie client-side vastgesteld, en de browser kent de autoritatieve prijs niet — die komt uit `tmc.create_order` — en is bovendien manipuleerbaar. Bedragen gaan uitsluitend server-side mee, vanuit de Mollie-webhook (zie "De conversiebrug").

Twee bestaande gevallen vallen hieronder:

| Call-site | Event | Status |
|---|---|---|
| `src/app/abonnement/AbonnementConfigurator.tsx:51` | `configurator_stage_view` | ✅ Voldoet. `useEffect` op `[stage]`; de component mount alleen op `/abonnement` en een stage-wissel *is* de gebeurtenis. Geen refocus-haak, geen bedrag. |
| `src/app/app/abonnement/bedankt/PaymentTracker.tsx` | `payment_return_view` | ✅ Voldoet aan alle drie. Aankomst op de bedankpagina, gededupliceerd per `transactionId` via `sessionStorage`, geen bedrag; `order_status` als dimensie houdt de webhook-race zichtbaar. Verving in PR C de oude `payment_success`/`payment_failed`, die `value`/`currency` droegen en de laatste uitzondering op voorwaarde 3 waren. |

Alles daarbuiten hangt aan `onSubmit`, `onClick` of `onFocus` — geverifieerd, inclusief de controle dat geen van die `onFocus`-velden `autoFocus` draagt of programmatisch gefocust wordt.

---

## De conversiebrug (gebouwd, PR C)

De enige verbinding tussen de twee systemen: één server-side `purchase`-event dat vanuit de Mollie-webhook naar GA4 gaat, zodat de omzet toegerekend kan worden aan het kanaal dat de klant bracht. Zonder die brug meet GA4 wel wie er converteert, maar niet wat het opleverde.

**Waarom server-side.** De browser kent de autoritatieve prijs niet — die komt uit `tmc.create_order` — en client-side bedragen zijn manipuleerbaar. De webhook is het enige punt waar een betaling bevestigd én het bedrag bekend is. De oude client-side variant (`PaymentTracker` met `payment_success`) vuurde bovendien alleen bij order-status `activated`, miste dus de webhook-race, en mat productorders helemaal niet.

### Hoe hij loopt

1. **Uitlezen** — `readGaIds()` (`src/lib/ga-ids.ts`) leest in `PayStage.handlePay()` de GA4 `client_id` en `session_id` via `gtag('get')`, met een harde timeout van 300 ms en een `_ga`-cookie-fallback voor de client_id. Bij consent denied of timeout: `undefined`, checkout gaat door.
2. **Meedragen** — `createOrderAndCheckout` zet ze ná de `create_order`-RPC met een losse update op `tmc.orders.ga_client_id` / `ga_session_id` (migratie `20260816000000`; route (b) — analytics-metadata loopt niet door de autoritatieve prijsfunctie). `NULL` is de normale toestand voor member-app-aankopen, admin-betaallinks en consent-denied-orders.
3. **Vuren** — de Mollie-webhook roept binnen de `!activation.already_activated`-tak, direct ná `emitEvent("order.activated")`, fire-and-forget `sendPurchaseToGa4` aan (`src/lib/orders/ga-purchase.ts`). Die leest de orderrij zelf, slaat over zonder fout als `ga_client_id` ontbreekt, en POST anders één Measurement Protocol `purchase`-event: `transaction_id` = order-id, `currency` EUR, `value` = het door Mollie verwerkte bedrag, `items[0].item_id` = `catalogue_slug` (de join key met `begin_checkout`), `session_id` als event-parameter. **Geen `user_id`** — zie "Wat bewust niet gebeurt".

**Exactly-once** komt uit `tmc.activate_order` (rijlock + statusovergang): precies één webhook-aanroep ziet `already_activated: false`. De helper voegt daar geen eigen dedupe aan toe. Strikt genomen is het at-most-once: crasht de functie tussen activatie en het MP-verzoek, dan is dat ene event weg (Mollie's retry ziet `already_activated: true` en vuurt terecht niet). Geaccepteerd compromis — durability zou een write in de geldpijplijn vragen.

**Dekking**: alle orders door de order-pijplijn — abonnementen, productorders (`/app/producten?tab=tegoed`-redirect) en WS-5-betaallinks — al vuren de laatste twee in de praktijk nooit (geen `ga_client_id`). Trial bookings lopen door een aparte webhook en vallen erbuiten.

### Twee harde regels (gehandhaafd in de bouw)

1. **De webhook mag nooit op analytics falen.** `sendPurchaseToGa4` throwt nooit, wordt zonder `await` aangeroepen, en staat buiten het idempotentiepad. Zelfde contract als `emitEvent()`: bij falen alleen `console.error` naar de Vercel-logs. Een gemiste meting is een rapportageprobleem; een gemiste order-activatie is een klantprobleem.
2. **Bedragen gaan uitsluitend hierlangs.** Client-side events dragen geen `value`. Dat is de reden dat `begin_checkout` en `configurator_select` bewust geen bedrag meesturen en GA4 daar €0 rapporteert.

**Env:** `GA4_API_SECRET` (GA4 Admin → Data Streams → web-stream → Measurement Protocol API secrets), in Vercel als **Sensitive** voor Production en Preview. Nooit in code of logs — de MP-URL bevat het secret, dus ook die URL nooit loggen.

---

## Naamconventie `tmc.events`

`noun.verb` waarbij het werkwoord een **voltooid deelwoord** is — het event beschrijft iets dat is gebeurd, niet iets dat gaat gebeuren. Conform de bestaande `checkin.recorded`.

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

- **Measurement Protocol voor iets anders dan `purchase`** — de conversiebrug is de enige MP-call. Geen server-side events voor gedrag; dat blijft `tmc.events`.
- **Consent-banner op `/app/**`** — niet nodig onder deze architectuur, en het toevoegen ervan zou de meetgrens juist ondermijnen.
- **GA4 `user_id`** — verwijderd. Een GA4-identiteit koppelen aan iemand wiens gedrag daar toch niet meer gemeten wordt levert niets op en vergroot alleen de PII-oppervlakte. Cohort- en lifecycle-analyse hoort thuis op `tmc.events`, waar het `profile_id` al staat.
- **Nieuwe `tmc.events` call-sites** — deze spec legt de grens vast; hij vult de gaten aan de `tmc.events`-kant niet. Die zijn geïnventariseerd in `docs/analytics-audit-2026-07.md` §8.

---

## Bekende gaten aan de GA4-kant (open)

Uit de audit, nog niet geadresseerd:

- De marketing top-of-funnel meet alleen formulier-submits. `/`, `/prijzen`, `/aanbod` en `/early-member` hebben geen CTA- of sectie-tracking, en de navbar-CTA "Plan je proefles" — de primaire actie van de site — vuurt niets.
- `trackContact` heeft op dit moment géén call-site. De helper staat er bewust, wachtend op een mount op de footer-`tel:`/`mailto:`-links van de publieke site. De vorige enige call-site zat op `/app/support`, dus achter de meetgrens, en is verwijderd.
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
