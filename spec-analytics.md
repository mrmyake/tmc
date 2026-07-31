# Spec: Analytics — de meetgrens

## Status

**Besloten, deels gebouwd.** De meetgrens zelf is geïmplementeerd (deze PR). De conversiebrug — het server-side `purchase`-event vanuit de Mollie-webhook — is nog te bouwen en is de enige openstaande post. Vervangt `TRACKING.md`, dat in dezelfde PR is verwijderd omdat het crowdfunding-helpers beschreef die in #120 al waren weggehaald en negen slug-routes die niet bestaan.

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
| Betaling (voorlopig) | `payment_start` · `payment_success` · `payment_failed` |

De configurator staat bewust aan de GA4-kant: `/abonnement` is een publieke route en de productkeuze dáár is een acquisitiebeslissing, geen productgebruik.

De `payment_*`-events staan hier met een asterisk. Ze zijn client-side en dus onbetrouwbaar (zie "De conversiebrug"). Ze blijven staan tot de webhook-brug er is; dan worden ze herzien.

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
| `src/app/app/abonnement/bedankt/PaymentTracker.tsx:22,28` | `payment_success` / `payment_failed` | ⚠️ Voldoet aan 1 en 2 (gededupliceerd per `transactionId` via `sessionStorage`), **niet aan 3**: beide events dragen `value` en `currency`. Bekende afwijking, zie hieronder. |

**De afwijking bij `payment_*` is bewust en tijdelijk.** Deze events zijn de enige plek waar vandaag nog een bedrag client-side meegaat, en ze zijn precies wat de conversiebrug moet vervangen: `PaymentTracker` vuurt alleen bij order-status `activated`, mist dus de webhook-race, en meet productorders helemaal niet. Voorwaarde 3 is de regel waar de brug naartoe werkt; deze twee call-sites zijn de laatste uitzondering erop en verdwijnen met die PR. Neem er geen nieuwe bij.

Alles daarbuiten hangt aan `onSubmit`, `onClick` of `onFocus` — geverifieerd, inclusief de controle dat geen van die `onFocus`-velden `autoFocus` draagt of programmatisch gefocust wordt.

---

## De conversiebrug (nog te bouwen)

De enige verbinding tussen de twee systemen: één server-side `purchase`-event dat vanuit de Mollie-webhook naar GA4 gaat, zodat de omzet toegerekend kan worden aan het kanaal dat de klant bracht. Zonder die brug meet GA4 wel wie er converteert, maar niet wat het opleverde.

**Waarom server-side.** De browser kent de autoritatieve prijs niet — die komt uit `tmc.create_order` — en client-side bedragen zijn manipuleerbaar. De webhook is het enige punt waar een betaling bevestigd én het bedrag bekend is.

**Waarom niet client-side op de bedankpagina.** Dat is de huidige `PaymentTracker`, en die vuurt alleen bij order-status `activated`. Wie terugkeert terwijl de webhook nog niet verwerkt is, ziet `pending` of `paid` en er vuurt niets, zonder herkansing. Dat is de normale race, geen randgeval. Product-orders redirecten bovendien naar `/app/producten?tab=tegoed`, waar helemaal geen tracker staat.

### Twee harde regels voor de bouw

1. **De webhook mag nooit op analytics falen.** Een mislukte GA4-call mag de betalingsverwerking niet blokkeren, vertragen of doen retryen. Zelfde contract als `emitEvent()`: nooit throwen, bij falen alleen `console.error` naar de Vercel-logs. Een gemiste meting is een rapportageprobleem; een gemiste order-activatie is een klantprobleem.
2. **Bedragen gaan uitsluitend hierlangs.** Client-side events dragen geen `value`. Dat is de reden dat `begin_checkout` en `configurator_select` bewust geen bedrag meesturen en GA4 daar €0 rapporteert.

Verder nodig bij de bouw: de GA4 `client_id` moet vanaf de publieke site meegedragen worden tot in de webhook, anders is de purchase niet aan de oorspronkelijke sessie te koppelen en verliest het event zijn attributiewaarde. Hoe dat precies loopt, is onderdeel van die PR.

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

Alle events hieronder zijn client-side tenzij anders vermeld. Parameters zijn de daadwerkelijk verzonden sleutels uit `src/lib/analytics.ts`.

| Event | Trigger | Parameters | Surface | Status |
|---|---|---|---|---|
| `generate_lead` | Submit van een lead-formulier | `event_category: lead_magnet`, `event_label` (type), `value` | 12 publieke formulieren | Levend |
| `cta_click` | Klik op een CTA-knop | `event_category: engagement`, `event_label` (knoptekst), `page_location` | `/proefles`, `/app/producten` | Levend |
| `form_start` | Eerste focus in een formulier | `event_category: engagement`, `event_label` (formuliernaam) | 13 formulieren, publiek plus `/abonnement` | Levend |
| `click_phone` · `click_whatsapp` · `click_email` | Klik op een contactlink | `event_category: contact`, `event_label` | Geen | **Helper aanwezig, nul call-sites.** Wacht op mount op de footer-`tel:`/`mailto:`-links, audit gap #4 |
| `configurator_stage_view` | Stage-wissel in de configurator, inclusief mount | `event_category: configurator`, `stage` | `/abonnement` | Levend, arrival-event |
| `configurator_select` | Kaartselectie, vrij-trainen-swap, verlengde toegang, 12/24 maanden | `event_category: configurator`, `item_id`, `family`, `frequency`, `commitment_months`, `addon_vrij_trainen`, `addon_extended_access` | `/abonnement` | Levend |
| `begin_checkout` | Klik op "Ga verder" | `event_category: configurator`, `items[0]` met `item_id`, `item_name`, `item_category` | `/abonnement` | Levend, bewust zonder bedrag |
| `checkout_rejected` | Server-side weigering van `create_order` | `event_category: configurator`, `item_id`, `reason` | `/abonnement` | Levend |
| `portal_login` | Geslaagde OTP-verificatie | `event_category: portal`, `method` | `/login` | Levend |
| `payment_start` | Klik op "Betaal nu" of "Koop" | `event_category: payment`, `value`, `currency`, `context`, `plan_variant` | `/abonnement`, `/app/producten` | Levend. Laatste client-side event met een bedrag; herziening volgt |
| `payment_success` | Bedankpagina bij order-status `activated` | `event_category: payment`, `value`, `currency`, `context`, `transaction_id` | `/app/abonnement/bedankt` | **Wordt vervangen door `payment_return_view` in PR #139 (open)** |
| `payment_failed` | Bedankpagina bij order-status `expired` of `cancelled` | `event_category: payment`, `value`, `currency`, `context`, `reason` | `/app/abonnement/bedankt` | **Wordt vervangen door `payment_return_view` in PR #139 (open)** |

Daarnaast levert GA4 Enhanced Measurement automatisch `page_view`, scroll, outbound clicks en file downloads. Die staan niet in dit register: ze zijn een admin-instelling, niet iets dat in deze repo geschreven of gewijzigd wordt.

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

- **Measurement Protocol** — nog geen besluit. De conversiebrug bepaalt straks welk mechanisme gebruikt wordt.
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
