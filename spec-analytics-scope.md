# spec-analytics-scope.md

GA4 (`G-2VFCDM4KRZ`) meet alleen de publieke marketingsite. Dit document legt vast welke paden, waarom, en hoe de gate werkt. Het sluit aan op de meetgrens in `spec-analytics.md`.

## Doel

Bezoekersaantallen, betrokkenheid en kanalen in GA4 waren vertekend doordat ook ledenomgeving, trainers, admin, kiosk en studio meetelden (bijvoorbeeld `/app/rooster` 1.109 views, `/app/admin/rooster` 44 minuten per gebruiker). Nu geldt: productroutes en de Capacitor-app laden geen gtag-script en sturen geen hits.

## Routetabel

**`src/lib/analytics-scope.ts` is leidend.** Deze tabel is een weergave; bij verschil wint de code. Het is een allowlist: een onbekend pad wordt niet gemeten. Een nieuwe publieke pagina moet bewust in de lijst worden gezet.

| Groep | Paden | Meten | Reden |
|---|---|---|---|
| Marketing | `/`, `/over`, `/aanbod`, `/prijzen`, `/rooster`, `/contact` | Ja | Acquisitie |
| Proefles | `/proefles/**` behalve `/proefles/annuleren/**` | Ja | Conversiefunnel |
| Proefles zelfservice | `/proefles/annuleren/**` | Nee | Na conversie, geen acquisitie |
| Content | `/welke-yoga-past-bij-jou`, `/yoga/**`, `/huisregels`, `/voorwaarden`, `/privacybeleid` | Ja | Publiek |
| Ads-landing | `/12-weken-programma/**` (dekt `/intake`) | Ja | Google Ads, event `programma_intake` |
| Actiepagina's | `/actie/**` | Ja | Advertenties en flyers voor de proefles (`spec-proefles-funnel.md`); `page_view`, conversie via `trial_booked` met `action_page` |
| Configurators | `/abonnement`, `/kopen` | Ja | Publieke conversiefunnel, conversiebrug heeft de GA-ids nodig |
| Product | `/app/**`, `/kiosk/**`, `/checkin/**`, `/studio/**` | Nee | Productgedrag, hoort in `tmc.events` |
| Auth en betalen | `/login`, `/auth/**`, `/factuur/**`, `/betaal/**` | Nee | Product |
| Overig | `/onbegeleide-toegang` | Nee | Voorwaardentekst voor leden |
| Redirect | `/early-member` | n.v.t. | Redirect naar `/prijzen` |

## Hoe de gate werkt

- `AnalyticsGate` staat in de root layout (client, `usePathname`). Geen route-groups.
- `window['ga-disable-G-2VFCDM4KRZ']` volgt het pad en de native-status bij elke pathname-wijziging, in beide richtingen. Het wordt tijdens render gezet (client, idempotent). Een al geladen gtag.js kan na een soft nav naar een productroute dus niets meer sturen.
- Op gemeten paden (web): de Consent Mode v2 defaults en de `gtag`-stub worden eenmalig gezet, gtag.js laadt uitgesteld (eerste interactie of idle), en de config is `{ send_page_view: false }`.
- Precies een handmatige `page_view` per pathname-wijziging naar een gemeten pad, inclusief de eerste load.
- Productroute bij harde load: geen inline script, geen `dataLayer`, geen stub. `window.gtag` ontbreekt dan, en `trackEvent` is een stille no-op. Na een soft nav vanaf een gemeten pad blijft de stub bestaan, maar `ga-disable` staat aan, en `trackEvent` controleert dat ook.
- `consent.ts` is inhoudelijk niet gewijzigd; de consent-defaults hebben dezelfde inhoud als het vroegere head-script in `layout.tsx`.

## Staff-cookie

- `tmc_staff=1`: eerste partij, niet httpOnly, geen PII, `SameSite=Lax`, `Secure`, `Path=/`, `Max-Age` een jaar.
- Gezet of gewist door `StaffCookie` in de outer `/app` layout, op basis van `profiles.role`: `admin` of `trainer` zet het, elke andere rol wist het.
- `signOut` (`src/lib/actions/auth.ts`) en de accountverwijdering (`src/lib/actions/account-deletion.ts`) wissen het server-side.
- Effect: de config krijgt `traffic_type: 'internal'`. Het cookie wordt client-side gelezen op het moment dat de config wordt gepusht, dus vóór de eerste hit.
- **Bekende rest-situatie:** verloopt een sessie zonder dat `signOut` draait, dan blijft het cookie staan. Dat browserprofiel telt dan tot een volgende `/app`-bezoek als intern. Het cookie is alleen een marker en geeft geen toegang.

## Niet-productie

Als `VERCEL_ENV` niet `production` is (preview en lokaal), krijgt elke hit `traffic_type: 'internal'`. De root layout berekent `isProduction` server-side en geeft het door aan de gate. Zo vervuilt preview-verificatie de data niet.

## Capacitor

In de native app laadt gtag nooit en staat `ga-disable` altijd op `true`, ook op marketingpaden. Detectie: `Capacitor.isNativePlatform()` uit `@capacitor/core`, zoals de rest van de codebase. Test: `npm run test:analytics-scope` (gate met gemockte Capacitor).

## Besluit: `portal_login` vervalt

`portal_login` (en `payment_return_view`, `trackCTA` en `payment_start` op `/app/producten`) staan op productroutes en verdwijnen uit GA4. Ze gaan niet naar `tmc.events`. Verwijderd: `trackPortalLogin`, `trackPaymentReturnView`, `PaymentTracker`, de call-sites in `LoginForm.tsx` en `BuyButton.tsx`. `payment_start` in `PayStage.tsx` (`/abonnement`, `/kopen`) en `cta_click` op `/proefles` blijven.

Vergelijk `portal_login` en `payment_return_view` niet over de deploy-datum heen.

## Handmatige GA4-stappen (Ilja)

1. **Bij de productie-deploy:** Admin, Data streams, Enhanced measurement, Geavanceerd: vink "Paginawijzigingen op basis van browsergeschiedenisgebeurtenissen" uit. Anders komt er bovenop de handmatige `page_view` een dubbele.
2. **Data filter Internal Traffic:** maak een filter met parameter `traffic_type`, waarde `internal`. Zet het eerst 2 tot 3 dagen op **Testen** en controleer in de rapportage. Zet het daarna op **Actief**. Activeren werkt niet terug en gefilterde data is definitief weg.

## Ledger

| PR | Branch | Merge-hash | Datum | Wat | Bewust niet aangeraakt |
|---|---|---|---|---|---|
| #346 | `feat/analytics-marketing-scope` | `c33dba9` | 2026-11-16 | Pad-gate, `ga-disable`, staff-cookie, `traffic_type` bij niet-productie, `portal_login` en drie product-call-sites verwijderd | `consent.ts`, cookiebanner, `ga-purchase.ts`, `ga-ids.ts`, conversie-events, Unassigned-attributie |

**Stand GA4-stappen per 2026-11-16:** de instelling "Paginawijzigingen op basis van browsergeschiedenisgebeurtenissen" is op 2026-11-16 uitgezet. Het filter Internal Traffic (`traffic_type` = `internal`, Exclude) staat op **Testen**; activeren volgt na controle door Ilja.
