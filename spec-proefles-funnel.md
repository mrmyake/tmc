# Spec: proefles-funnel

Opdracht van Ilja en Marlon, 16-11-2026. De proefles-funnel wordt gesplitst in een organische `/proefles` met één hoofdactie en aparte actiepagina's `/actie/[slug]` voor advertenties en flyers.

## Doel

GA4, 1 oktober tot 15 november 2026: 226 gebruikers op `/proefles`, gemiddeld 20 seconden; 47 openden `/proefles/boeken`, 28 `/proefles/code`, 27 haalden de bedankpagina. De pagina toonde drie gelijke kaarten (betaald boeken, "Ik heb een code" met de campagnecode openbaar zichtbaar, "Liever gebeld worden"). Gevolg: bijna niemand betaalde, en per campagne was niet te zien wat werkt.

Twee doelen:

1. Organisch verkeer krijgt één duidelijke hoofdactie: de betaalde proefles.
2. Campagneverkeer krijgt een eigen landingspagina per bron, met een gratis aanbod dat server-side aan de slug hangt, zodat de bron bij de boeking meetbaar is.

## Besluiten van 16-11-2026

Dit vervangt het besluit van 30-09-2026 over drie gelijkwaardige kaarten op `/proefles` (`spec-community-growth.md` par. 1).

1. **Organische `/proefles`.** Eén hoofdactie "Boek je proefles" met de prijs. Daaronder klein "Liever eerst bellen?" en een invulveld "Heb je een code?". Nergens op de site staat een code.
2. **Actiepagina's `/actie/[slug]`.** Noindex, niet in de sitemap, alleen het woordmerk, één aanbod per slug. De code hangt server-side aan de slug en komt nooit in HTML, URL, cookie of client-bundle. De slug gaat mee met de boeking.
3. **Reikwijdte van de campagnecode.** Geldt voor groepslessen en vrij trainen, niet voor personal training. De code van de yoga-quiz hoort bij de quiz en krijgt geen actie-slug.

Buiten scope: GA4-eventdefinities en consent (aparte chat). Wel dataLayer-haakjes.

## Beslissingen bij de bouw (B1 t/m B16)

- **B1. Code nooit bij de bezoeker.** Geen code in een cookie, URL, HTML, prop of client-bundle. `tmc_actie` (ondertekende slug, 24 uur, httpOnly, sameSite lax, secure) is het enige cookie van de actieflow. `/proefles/code` en de boekingsactie zoeken de code server-side op via de slug. In de actieflow toont de boekingsstap de aanbodnaam uit de slug-content, nooit de code.
- **B2. Geen nieuwe kolom.** De bron staat in de bestaande `tmc.trial_bookings.action_page`, met een foreign key naar `tmc.campaign_landings(slug)`. `tmc.redeem_trial_code` schrijft de gevalideerde slug.
- **B3. Eén code voor alle slugs.** Alle vijf de slugs hangen aan dezelfde campagnecode. De tweede campagnecode wordt niet in een migratie aangeraakt; Ilja scherpt die zelf aan in de admin.
- **B4. "Bijna vol"** bij 2 of minder vrije plekken, met hergebruik van `FEW_SPOTS_THRESHOLD`. Geen aparte limiet voor proefplekken.
- **B5. GA4-scope.** `/actie` gaat in de allowlist van `src/lib/analytics-scope.ts`.
- **B6. Yoga-quiz uitgezonderd.** De code van de quiz blijft zichtbaar op de uitslag en in de uitslagmail. `/proefles/code/start` en de `?code=`-voorinvulling blijven ongewijzigd.
- **B7. Haakjes.** Geen event op mount (`proefles_view` vervalt; de `page_view` met het pad volstaat). De overige haakjes lopen via één helper `pushDataLayer(event, params)` (`src/lib/data-layer.ts`), die niets doet als `window.dataLayer` ontbreekt. Niet gekoppeld aan gtag; dat doet de analytics-chat.
- **B8. Seed.** Hard falen als `tmc.trial_codes` rijen heeft maar de campagnecode ontbreekt; overslaan op een lege database, zodat de shadow-replay blijft werken.
- **B9. Pijler-whitelist.** Het lespad van `tmc.redeem_trial_code` krijgt per scope precies de pijlers die `pillarsForScope` in TypeScript teruggeeft. Beide plekken dragen een comment dat ze gelijk moeten blijven.
- **B10. Uitrol.** De app gaat live voor de `db push`. De aanroep met `p_campaign_slug` valt terug op de oude signatuur zolang de functie nog niet bestaat, met een server-warning (de slug wordt dan niet opgeslagen). Na de `db push` gaat de fallback er in een opvolg-PR uit.
- **B11. Attributie.** De actiepagina en `/actie/[slug]/start` geven gclid, gbraid, wbraid, fbclid, `utm_*` en `lp` door via de bestaande `resolveAttribution` en `withAttribution`.
- **B12. Canonical.** De actiepagina zet een eigen canonical naar zichzelf, naast `robots { index: false, follow: false }`.
- **B13. Google-score.** Een vaste tekst (5.0, 25+ reviews), gemarkeerd als COPY. Geen Featurable-widget op de actiepagina. Op `/proefles` staat dezelfde tekst als constante in `ProeflesChoice.tsx`.
- **B14. Foto.** `trainer.photo` uit Sanity via `next/image` en `urlFor`, met `object-position: center 25%`. Geen eigen crop-assets; is een uitsnede slecht, dan zet Marlon een hotspot in Sanity.
- **B15. Rate limiting op `/actie/[slug]/start`.** Zoals de quizroute niet op de teller voor foute codes (de bezoeker voert geen code in), wel de slotcheck per IP.
- **B16. Prijs.** Geen nieuwe catalogusrij. De kaart op `/proefles` toont de prijs van `drop_in` uit `tmc.catalogue`, via dezelfde helper als het betaalpad (`dropInSlugForPillar`). De proefles is eenmalig: er staat geen periode bij.

## Slugs

| Slug | Bron | Pijlerfilter | Aanbod |
|---|---|---|---|
| `google-kettlebell` | google | kettlebell | Gratis proefles kettlebell |
| `google-yoga` | google | yoga_mobility | Gratis proefles yoga |
| `google-merk` | google | geen (alles) | Gratis proefles |
| `meta-ig` | meta | geen (alles) | Gratis proefles |
| `flyer-weekblad` | flyer | geen (alles) | Gratis proefles |

De koppeling slug naar code staat alleen in `tmc.campaign_landings` (PR 2). De code zelf staat in geen enkel bestand van de site.

## dataLayer-haakjes

Helper: `pushDataLayer(event, params)` in `src/lib/data-layer.ts`. Nooit een code of persoonsgegevens in de params.

| Haakje | Params | Waar |
|---|---|---|
| `proefles_cta_click` | `variant`: `organic`, `actie` of `actie_sticky`; `slug` bij de actievarianten | Knop op `/proefles`; knoppen op `/actie/[slug]` (PR 2) |
| `proefles_code_submit` | `result`: `valid` of `invalid` | Invulveld op `/proefles` |
| `proefles_callback_open` | geen | Link "Marlon belt je terug" op `/proefles` |
| `actie_whatsapp_click` | `slug` | WhatsApp-knoppen op `/actie/[slug]` (PR 2) |
| `proefles_booked` | `variant`: `organic` of `actie`; `slug`; `source`: `paid`, `code` of `opening` | `/proefles/boeken/bedankt`, eenmalig per boeking en alleen bij status `paid` |

## Wat Marlon moet bevestigen

Alle regels met `// COPY: confirm met Marlon` in `src/app/proefles/ProeflesChoice.tsx` en `src/app/proefles/ProeflesContent.tsx` (de teruglink). Sanity-content hoeft niet te wijzigen: in de gepubliceerde documenten staat geen code (controle 16-11-2026).

## Ledger

- **PR #351 (2026-11-16, organische `/proefles`)**: branch `feat/proefles-organisch`, `github.com/mrmyake/tmc/pull/351`. De drie gelijke kaarten zijn vervangen door één hoofdkaart "Boek je proefles" met de prijs van `drop_in` uit `tmc.catalogue`, daaronder de regel "Liever eerst bellen?" (opent het bestaande terugbelformulier, `?kaart=bellen` werkt nog) en het invulveld "Heb je een code?" (zelfde server action `checkTrialCode`, inclusief IP-slot en ondertekend cookie; daarna naar `/proefles/code`). Blok "Zo werkt het", portret van Marlon op desktop. De aangeprezen campagnecode is van de site: `src/lib/trial-codes/promoted.ts` en `lookupPromotedTrialCode` zijn verwijderd, en de ntfy-melding van een codeboeking noemt de code niet meer. Nieuwe helper `pushDataLayer` met de haakjes `proefles_cta_click`, `proefles_code_submit`, `proefles_callback_open` en `proefles_booked`. Geen migratie. **Bewust niet aangeraakt:** `/proefles/boeken`, `/proefles/code` (op een comment na), `/proefles/gratis`, `/proefles/code/start`, de `?code=`-voorinvulling en de yoga-quiz (B6); de bestaande GA4-events `cta_click` ("Boek direct", "Liever gebeld worden"), `form_start` en `generate_lead` (het `cta_click`-label "Ik heb een proefcode" vervalt met de kaart); `/api/proefles` (nog zonder rate limiting); de actiepagina's, `tmc.campaign_landings` en `action_page` (PR 2).
