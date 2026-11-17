# spec-locatiepaginas.md

Lokale dienst- en locatiepagina's op themovementclub.nl, voor vindbaarheid in het Gooi en Wijdemeren. Ontwerp: `mockups/locatiepaginas-mockup.html` (v2, drie sjablonen: dienst, locatie, hub). Screenshots van de sjablonen met testdata op 390 en 1280 px: `mockups/screenshots/lokaal/`.

## Doel en beslissingen

- **Dienstpagina's als basis, plus een beperkt aantal locatiepagina's.** Organisch zoeken is het grootste kanaal van TMC. De dienstblokken op `/aanbod` ranken niet als losse pagina; ze krijgen een eigen route. De locatiepagina's vangen "personal trainer <plaats>"-zoekopdrachten.
- **Geen raster.** Geen pagina per dienst per plaats, geen eigen pagina voor Wijdemeren of small group. Combinaties als "kettlebell training Gooi" vangen de dienstpagina's via title en regio-regel.
- **Inhoud in code, niet in Sanity.** Getypte TypeScript-bestanden in `src/content/lokaal/`, één per pagina plus `types.ts`. Er zijn geen Sanity-types, queries of seed-scripts. Uitzonderingen: openingstijden komen uit `getOpeningHours()` en de tijden van Marlon uit `getTrainerPresenceWindows()` (`tmc.trainer_presence_windows`), met de copy uit `PRESENCE_MARLON`. Die tijden staan nergens in de content.
- **De inhoudseis zit in het type.** Elke pagina heeft `status: 'concept' | 'live'` als discriminated union. Bij `live` zijn verplicht:
  - locatiepagina: `reistijdAutoMin`, `reistijdAutoVanaf`, `reistijdFietsMin`, `reistijdFietsVanaf`, `parkeren`, `quote` (tekst, voornaam, wijk, toestemmingsdatum) en `faq` als tuple van precies 3 vragen met antwoord;
  - dienstpagina: `faq` met minimaal 3 vragen met antwoord en een `heroImage` met alt (alle beelden zijn dan een `Foto`);
  - hub: per plaats een reistijd auto en fiets.
  Een pagina op `live` zetten met een ontbrekend veld is een typefout en breekt de build. Bij `concept` mogen die velden ontbreken, en is een placeholder-beeld toegestaan. Dat is bewust, om dunne pagina's te voorkomen.
- **307-terugval.** Een `concept`-pagina geeft een tijdelijke redirect (307, nooit een 404): locatiepagina naar `/personal-trainer-gooi`, hub en dienstpagina's naar `/aanbod`. Zo komt een redirect vanaf ptloosdrecht.nl nooit op een 404 uit. Concept-pagina's staan niet in de sitemap. Interne links naar een concept-pagina verdwijnen (`resolveHref` in `src/lib/lokaal/links.ts`), zodat een live pagina nooit naar een redirect linkt.
- **Geen interne UTM's.** CTA's linken kaal naar `/proefles` of `/proefles?kaart=bellen`. UTM-parameters op interne links overschrijven in GA4 de bron van het bezoek, waarna organisch verkeer niet meer te meten is.
- **Geen prijzen.** Prijzen komen uit `tmc.catalogue`; de pagina's verwijzen naar `/prijzen`.
- **Geen Google Maps-embed.** De routekaart en regiokaart zijn een schematische SVG uit lat en lon in de content (`RegioKaart`), zonder laadtijd of cookies.
- **Reviewscore.** Geen eigen getal op deze pagina's. De cijferbalk van `/kettlebell-training` toont "Kettlebell Master" als derde vak. De Google-score staat in de bestaande `GoogleReviewsBadge`.
- **Rooster.** `/kettlebell-training` toont `RoosterPijlerStrip` met pijler `kettlebell` (eerstvolgende 3 lessen, leesquery op `class_sessions` en `v_session_availability`). `/mobility` heeft geen strip (er is geen aparte mobility-pijler, alleen `yoga_mobility`) maar linkt naar `/rooster?pijler=yoga_mobility`. `/personal-training` en `/krachttraining` hebben geen rooster.
- **Voorheen PT Loosdrecht.** De regel "Voorheen PT Loosdrecht. Zelfde trainer, nieuwe studio." staat op `/personal-training`, de locatiepagina's (in de langere vorm uit de mockup) en de hub.
- **Structured data.** Eén sitebrede `ExerciseGym` met `@id` `https://www.themovementclub.nl/#business` (was `GymOrHealthClub`, dat bestaat niet op schema.org). Per dienst-, locatie- en hubpagina een `Service` met `provider` naar dat `@id`, plus `BreadcrumbList` op alle acht. Nooit een LocalBusiness per plaats, nooit een ander adres dan de studio, geen `aggregateRating`.
- **Analytics.** Bestaand event `cta_click` en `generate_lead` ongewijzigd, geen nieuwe call-sites. De stap van landingspagina naar `/proefles` is in GA4 zichtbaar via paginapaden; de conversie blijft `generate_lead` op `/proefles`.

## Een pagina live zetten

1. Vul alle verplichte velden van het contentbestand (zie hierboven) en zet `status: "live"`. Zet `bijgewerkt` op de datum van de wijziging.
2. Vervang placeholders door echte foto's onder `public/images/lokaal/` (`Foto` met alt).
3. `npm run typecheck` en `npm run build` moeten groen zijn; ontbreekt er iets, dan geeft het type een fout.
4. De pagina verschijnt dan in de sitemap met `lastModified` uit `bijgewerkt`. Interne links naar de pagina verschijnen vanzelf.

## URL-tabel

Title is wat in de browser staat (de layout-template voegt " | The Movement Club" toe).

| Route | Type | Title | H1 |
|---|---|---|---|
| `/personal-training` | dienst | Personal training in Loosdrecht, voor het Gooi \| The Movement Club | Personal training in Loosdrecht |
| `/kettlebell-training` | dienst | Kettlebell training in Loosdrecht, voor het Gooi \| The Movement Club | Kettlebell training in Loosdrecht |
| `/mobility` | dienst | Mobility training in Loosdrecht, voor het Gooi \| The Movement Club | Mobility training in Loosdrecht |
| `/krachttraining` | dienst (route-pagina) | Krachttraining in Loosdrecht, voor het Gooi \| The Movement Club | Krachttraining in Loosdrecht |
| `/personal-trainer-hilversum` | locatie | Personal trainer bij Hilversum \| The Movement Club | Personal trainer bij Hilversum |
| `/personal-trainer-bussum` | locatie (dekt ook Naarden) | Personal trainer bij Bussum en Naarden \| The Movement Club | Personal trainer bij Bussum en Naarden |
| `/personal-trainer-laren` | locatie (dekt ook Blaricum en Eemnes) | Personal trainer bij Laren, Blaricum en Eemnes \| The Movement Club | Personal trainer bij Laren, Blaricum en Eemnes |
| `/personal-trainer-gooi` | hub | Personal trainer in het Gooi \| The Movement Club | Personal trainer in het Gooi |

Alle pagina's staan in deze PR op `concept`. Pagina's die niet in mockup v2 staan (`/personal-training`, `/mobility`, `/krachttraining`, Bussum, Laren) volgen het sjabloon, gebruiken de bestaande tekst van `/aanbod` en laten alles wat nog niet bestaat leeg.

## Nulmeting Search Console: ptloosdrecht.nl

Periode 16-11-2025 t/m 14-11-2026: 408 klikken, 19.800 vertoningen.

Per oude pagina (klikken / vertoningen):

| Pagina | Klikken | Vertoningen |
|---|---|---|
| home | 198 (plus 107 via http) | 5.889 (plus 5.833 via http) |
| ervaren-personal-trainer | 23 | 934 |
| personal-trainer-hilversum | 19 | 1.743 |
| kettlebell-bootcamp | 18 | 618 |
| kettlebell-training | 15 | 707 |
| personal-training-loosdrecht | 9 | 273 |
| personal-hormonal-profiling | 6 | 439 |
| contact | 5 | 1.121 |
| personal-trainer-bussum | 4 | 2.414 |
| personal-trainer-gooi | 4 | 877 |
| personal-trainer-wijdemeren | 3 | 237 |
| training-en-begeleiding | 2 | 815 |
| personal-trainer-laren | 0 | 2.312 |

Zoekvraag per plaats (vertoningen, positie):

| Plaats | Vertoningen | Positie |
|---|---|---|
| Laren | ongeveer 2.000 | 21 tot 31 |
| Bussum | ongeveer 1.650 | 21 tot 23 |
| Hilversum | ongeveer 1.230 | 26 tot 36 |
| Gooi | ongeveer 130 | 14 tot 19 |

De oude plaatspagina's bestonden voor ongeveer 95% uit algemene tekst en stonden op pagina 2 tot 3 van Google. Context: organisch zoeken is 49% van de sessies, met 11 conversies en 893 euro omzet sinds mei.

## Mapping ptloosdrecht.nl naar themovementclub.nl

Ter referentie. De redirects zelf horen bij de migratie-PR, niet bij deze. Alle varianten (http, https, www) afvangen.

| Oud pad | Nieuw pad |
|---|---|
| `/` | `/` |
| `/personal-training-loosdrecht/` | `/personal-training` |
| `/kettlebell-training/` | `/kettlebell-training` |
| `/kettlebell-bootcamp/` | `/kettlebell-training` |
| `/training-en-begeleiding/` | `/aanbod` |
| `/ervaren-personal-trainer/` | de pagina over Marlon (of `/over`) |
| `/personal-hormonal-profiling/` | `/personal-training` (tijdelijk, volgt het hormoonprofiel-besluit) |
| `/personal-training-loosdrecht-contact/` | `/contact` |
| `/personal-trainer-hilversum/` | `/personal-trainer-hilversum` |
| `/personal-trainer-bussum/` | `/personal-trainer-bussum` |
| `/personal-trainer-laren/` | `/personal-trainer-laren` |
| `/personal-trainer-gooi/` | `/personal-trainer-gooi` |
| `/personal-trainer-wijdemeren/` | `/personal-training` |
| `/training-en-begeleiding-old/`, `/product/*`, `/product-category/*`, `/portfolio/*`, `/portfolio-category/*` | 410 |

Een redirect naar een nog niet live pagina komt via de 307-terugval op `/personal-trainer-gooi` of `/aanbod` uit, nooit op een 404.

## Attributie van de kennismaking

Locatiepagina's, hub en `/personal-training` linken naar `/proefles?kaart=bellen` (het terugbelformulier, dat naar `tmc.trial_requests`, MailerLite en ntfy gaat). Er is geen bronveld in `trial_requests`; een kolom toevoegen is een Supabase-wijziging en valt buiten deze PR.

Bevinding over `recordLeadAttribution`: `landing_path` wordt **niet** vastgelegd als de eerste pagina van het bezoek. `parseAttribution` en `sanitizeLeadAttribution` (`src/lib/attribution/params.ts`) leveren alleen iets op als er minstens een advertentie- of campagneparameter is (gclid, gbraid, wbraid, fbclid of utm_*). Zonder zo'n parameter komt er geen rij in `tmc.lead_attributions`, dus ook geen `landing_path`. En met zo'n parameter is `landing_path` de pagina die de parameters droeg (via `lp` of de huidige URL van `/proefles/*`), niet per se de eerste pagina van het bezoek. Een organische bezoeker die via `/personal-trainer-hilversum` naar `/proefles?kaart=bellen` gaat, laat dus geen spoor achter in de database. In GA4 is die route wel zichtbaar via paginapaden. Niets gewijzigd; een bronveld of een landingspagina-registratie voor organisch verkeer is een eigen beslissing.

## Open punten voor Marlon

- **Copy bevestigen** voor alle pagina's (alle tekst staat onder `// COPY: confirm met Marlon`).
- **Reistijden meten**: auto en fiets, op een doordeweekse ochtend, vanaf twee punten per plaats, voor Hilversum, Bussum, Laren, Blaricum, Huizen, Naarden en Eemnes. Alleen "ongeveer 10 minuten met de auto vanaf het centrum van Hilversum" ligt al vast. Ov alleen invullen als het echt werkt.
- **Quotes met schriftelijke toestemming** van een lid uit Hilversum, Bussum en Laren (tekst, voornaam, wijk, toestemmingsdatum).
- **FAQ-antwoorden**: drie per locatiepagina, drie of vier per dienstpagina. De vragen staan er, de antwoorden niet.
- **Opleiding en certificering als Kettlebell Master**, één zin.
- **Bestaat de kettlebell bootcamp buiten nog?** Zo ja: een vierde kaart bij "Drie manieren" op `/kettlebell-training` (alleen een extra item in `vormen.kaarten`, geen sjabloonwijziging).
- **PT-tijden**: vaste tijden of in overleg? (veld `tijden.ptTijden`).
- **Kennismaking PT**: gratis of betaald, hoe lang (antwoord op de FAQ).
- **Echte foto's** onder `public/images/lokaal/`: hero per dienstpagina, de drie bewegingen op `/kettlebell-training`, portret van Marlon.
- **Kaart**: de SVG is schematisch; een statische afbeelding is een latere keuze.

## Bestanden

- Inhoud en types: `src/content/lokaal/`
- Sjablonen: `src/components/blocks/lokaal/` (`DienstTemplate`, `LocatieTemplate`, `HubTemplate`, `RegioKaart`, `RoosterPijlerStrip`, `Dagbalk`, `Delen`, `Beeld`)
- Hulpfuncties: `src/lib/lokaal/` (`links`, `metadata`, `dagbalk`)
- Routes: acht mappen onder `src/app/`
- JSON-LD: `src/lib/structuredData.ts` (`BUSINESS_ID`, `getServiceSchema`)
- Sitemap: `src/app/sitemap.ts`
- Tests: `npm run test:lokaal`

## Bewust niet in PR A

Geen wijzigingen aan `/aanbod`, `AANBOD_DROPDOWN`, de footer of `/yoga`. De interne links (dienstblokken op `/aanbod`, Aanbod-submenu, footerkolom Regio, regio-sectie op `/yoga` naar de locatiepagina's) en het live zetten van inhoud horen bij PR B.

## Ledger

- **PR #357, PR A fundament:** 2026-11-17. Acht routes met sjablonen, contentbestanden op `concept`, typegebonden inhoudseis, 307-terugval, `ExerciseGym` met `@id`, `Service` en `BreadcrumbList`, sitemap voor `live`-pagina's, CLAUDE.md gecorrigeerd. Bewust niet aangeraakt: Sanity, Supabase, `/aanbod`, `AANBOD_DROPDOWN`, Footer, `/yoga`, interne links, redirects vanaf ptloosdrecht.nl, nieuwe analytics-events.
