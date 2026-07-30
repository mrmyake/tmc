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

## De conversiebrug (nog te bouwen)

De enige verbinding tussen de twee systemen: één server-side `purchase`-event dat vanuit de Mollie-webhook naar GA4 gaat, zodat de omzet toegerekend kan worden aan het kanaal dat de klant bracht. Zonder die brug meet GA4 wel wie er converteert, maar niet wat het opleverde.

**Waarom server-side.** De browser kent de autoritatieve prijs niet — die komt uit `tmc.create_order` — en client-side bedragen zijn manipuleerbaar. De webhook is het enige punt waar een betaling bevestigd én het bedrag bekend is.

**Waarom niet client-side op de bedankpagina.** Dat is de huidige `PaymentTracker`, en die vuurt alleen bij order-status `activated`. Wie terugkeert terwijl de webhook nog niet verwerkt is, ziet `pending` of `paid` en er vuurt niets, zonder herkansing. Dat is de normale race, geen randgeval. Product-orders redirecten bovendien naar `/app/producten?tab=tegoed`, waar helemaal geen tracker staat.

### Twee harde regels voor de bouw

1. **De webhook mag nooit op analytics falen.** Een mislukte GA4-call mag de betalingsverwerking niet blokkeren, vertragen of doen retryen. Zelfde contract als `emitEvent()`: nooit throwen, bij falen alleen `console.error` naar de Vercel-logs. Een gemiste meting is een rapportageprobleem; een gemiste order-activatie is een klantprobleem.
2. **Bedragen gaan uitsluitend hierlangs.** Client-side events dragen geen `value`. Dat is de reden dat `begin_checkout` en `configurator_select` bewust geen bedrag meesturen en GA4 daar €0 rapporteert.

Verder nodig bij de bouw: de GA4 `client_id` moet vanaf de publieke site meegedragen worden tot in de webhook, anders is de purchase niet aan de oorspronkelijke sessie te koppelen en verliest het event zijn attributiewaarde. Hoe dat precies loopt, is onderdeel van die PR.

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
- `trackContact` heeft nog maar één mount, en die zit op `/app/support`, dus achter de meetgrens. De footer-`tel:`/`mailto:`-links op de publieke site zijn ongemeten. Dat is precies andersom dan het hoort.
- Er is geen route-change-hook voor SPA-pageviews; soft navigation leunt volledig op GA4's Enhanced Measurement, een admin-instelling die niet vanuit de repo verifieerbaar is.
