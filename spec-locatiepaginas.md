# spec-locatiepaginas.md

Lokale dienst- en locatiepagina's op themovementclub.nl, voor vindbaarheid in het Gooi en Wijdemeren. Ontwerp: `mockups/locatiepaginas-mockup.html` (v2, drie sjablonen: dienst, locatie, hub). Visueel gecontroleerd op de Vercel-preview (alle acht routes, 390 en 1280 px) en vergeleken met `mockups/locatiepaginas-mockup.html`. Screenshots niet bewaard.

## Doel en beslissingen

- **Dienstpagina's als basis, plus een beperkt aantal locatiepagina's.** Organisch zoeken is het grootste kanaal van TMC. De dienstblokken op `/aanbod` ranken niet als losse pagina; ze krijgen een eigen route. De locatiepagina's vangen "personal trainer <plaats>"-zoekopdrachten.
- **Geen raster.** Geen pagina per dienst per plaats, geen eigen pagina voor Wijdemeren of small group. Combinaties als "kettlebell training Gooi" vangen de dienstpagina's via title en regio-regel.
- **Inhoud in code, niet in Sanity.** Getypte TypeScript-bestanden in `src/content/lokaal/`, één per pagina plus `types.ts`. Er zijn geen Sanity-types, queries of seed-scripts. Uitzonderingen: openingstijden komen uit `getOpeningHours()` en de tijden van Marlon uit `getTrainerPresenceWindows()` (`tmc.trainer_presence_windows`), met de copy uit `PRESENCE_MARLON`. Die tijden staan nergens in de content.
- **De inhoudseis zit in het type.** Elke pagina heeft `status: 'concept' | 'live'` als discriminated union. Bij `live` zijn verplicht:
  - locatiepagina: `reistijdAutoMin`, `reistijdAutoVanaf`, `reistijdFietsMin`, `reistijdFietsVanaf`, `parkeren`, `quote` (tekst, voornaam, wijk, toestemmingsdatum) en `faq` als tuple van precies 3 vragen met antwoord;
  - dienstpagina: `faq` met minimaal 3 vragen met antwoord en een `heroImage` met alt (alle beelden zijn dan een `Foto`);
  - hub: per plaats een reistijd auto en fiets.
  Een pagina op `live` zetten met een ontbrekend veld is een typefout en breekt de build. Bij `concept` mogen die velden ontbreken, en is een placeholder-beeld toegestaan. Dat is bewust, om dunne pagina's te voorkomen.
- **307-terugval, alleen in productie.** Een `concept`-pagina geeft een tijdelijke redirect (307, nooit een 404) als `process.env.VERCEL_ENV === 'production'`: locatiepagina naar `/personal-trainer-gooi`, hub en dienstpagina's naar `/aanbod`. Zo komt een redirect vanaf ptloosdrecht.nl nooit op een 404 uit. Op preview en lokaal rendert een conceptpagina wel, zodat hij te beoordelen is voor hij live gaat. Daar krijgt hij altijd `robots: noindex, nofollow` (via `generateMetadata`) en een vaste smalle balk bovenaan, "Concept, niet live" (`ConceptBalk`). In productie verschijnt die balk nooit, want daar geeft concept een 307. De sitemap blijft ongewijzigd: alleen `live`-pagina's, in elke omgeving. De beslislogica staat in `conceptRedirectHref` (`src/lib/lokaal/links.ts`), de redirect zelf in `src/lib/lokaal/gate.ts`. Interne links naar een concept-pagina verdwijnen (`resolveHref` in `src/lib/lokaal/links.ts`), zodat een live pagina nooit naar een redirect linkt.
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

Zeven pagina's staan sinds de inhoud-PR (`feat/lokale-inhoud`) op `live`; `/mobility` blijft `concept` tot er een mobility-les in het rooster staat. De `concept`-mechaniek (307 in productie, noindex en conceptbalk daarbuiten) blijft bestaan voor nieuwe pagina's.

### Keuzes in PR A

- **Pagina's die niet in mockup v2 staan.** `/personal-training`, `/mobility`, `/krachttraining`, `/personal-trainer-bussum` en `/personal-trainer-laren` ontbreken in de mockup. Ze volgen het sjabloon. De drie dienstpagina's gebruiken de bestaande tekst van `/aanbod` (omschrijving, wat je krijgt, frequentie); Bussum en Laren gebruiken de Hilversum-tekst met de plaatsnaam vervangen ("Bussum en Laren gebruiken exact dit sjabloon met eigen inhoud", zegt de mockup). Alles wat plaatsspecifiek is en nog niet bestaat, blijft leeg.
- **Lege FAQ-antwoorden zijn bewust.** De vragen staan er, de antwoorden niet. Ook antwoorden die in de mockup deels bekend zijn ("Ja. ..." plus een invulplek) staan leeg, zodat een half antwoord de livegang niet kan halen: bij `live` moet elk antwoord ingevuld zijn. De FAQ-vragen van de pagina's buiten de mockup zijn een voorstel.
- **Kortenhoef staat niet op de hub.** De kaart in de mockup toont Kortenhoef, maar de opdracht en de reistijdtabel noemen zeven plaatsen: Hilversum, Bussum, Laren, Blaricum, Huizen, Naarden en Eemnes. Kortenhoef komt er alleen bij als er een reistijd voor gemeten is.
- **Geen nieuwe `cta_click`-plekken.** De CTA's zijn gewone links naar `/proefles` en `/proefles?kaart=bellen`. Getoetst aan de vier poorten van `spec-analytics.md`: de stap van landingspagina naar `/proefles` is in GA4 zichtbaar via paginapaden en de conversie blijft `generate_lead` op `/proefles`. Het eventregister is dus ongewijzigd. Nieuwe call-sites zouden een eigen regel in het register vragen.
- **Links naar conceptpagina's verdwijnen** (`resolveHref`), ook op preview, zodat preview zich gedraagt als productie.

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

## Reistijden

Methode: Google Maps, dinsdag 17-11-2026 rond 11:15, vertrek nu, bestemming Industrieweg 14P, vertrekpunt het centrum zoals Google dat kiest. Auto en fiets, enkele reis.

| Vanaf | Auto | Fiets | Opmerking |
|---|---|---|---|
| Hilversum centrum | 12 min | 19 min | 6,1 km via Loosdrechtseweg en Rading |
| Hilversum Centraal (station) | 16 min | 21 min | ov 29 min: bus 104 vanaf Hilversum Station, daarna 6 min lopen |
| Bussum | 20 min | 34 min | 11,3 km via Loosdrechtseweg |
| Naarden | 25 min | 43 min | |
| Laren | 18 min | 36 min | 16,1 km via Utrechtseweg |
| Blaricum | 21 min | 47 min | |
| Huizen | 23 min | 53 min | |
| Eemnes | 20 min | 45 min | |

De hub toont alle zeven plaatsen (Hilversum is het centrum). De locatiepagina's tonen het centrum van de plaats groot, met een tweede vertrekpunt met alleen een autotijd: station Hilversum (16 min), Naarden bij Bussum (25 min), Blaricum (21 min) en Eemnes (20 min) bij Laren. Ov staat alleen op de Hilversum-pagina. `/yoga` zegt nog "tien minuten" en is bewust niet aangepast.

## Bronnen inhoud

- **Opleiding en gratis intake:** van ptloosdrecht.nl. Marlon is opgeleid als Master Kettlebell en T.O.P Personal Trainer bij Overload Worldwide; de intake is gratis en vrijblijvend.
- **Quotes:** uit Google-reviews, met toestemming van de reviewers, bevestigd door Ilja op 17-11-2026 (toestemmingsdatum 2026-11-17). Woonplaatsen volgens Ilja: Sara (Hilversum, op de Hilversum-pagina), Savannah (Loosdrecht, op de Bussum-pagina), Jeroen (Loosdrecht, op de Laren-pagina).
- **FAQ-antwoorden en overige copy:** aangeleverd door Ilja op 17-11-2026; nog te bevestigen door Marlon via de Vercel-preview.
- **Lesduur:** uit `tmc.class_types` en `class_sessions` (alleen gelezen): Kettlebell Power en alle `yoga_mobility`-klassen duren 60 minuten.
- **Foto's:** zie "Foto's" hieronder.

## Foto's

Alle beelden komen uit Sanity (`siteImages`, trainer) en zijn omgezet naar JPEG (max 1920 px breed, niet opgeschaald) onder `public/images/lokaal/`. Het portret van Marlon (`trainer.photo`) is een echte foto van Marlon, bewerkt met AI, en blijft in het trainersblok (alt: "Marlon, eigenaar en trainer van The Movement Club."). De andere beelden (hero's) zijn door AI gemaakt; hun alt-teksten beweren daarom niet dat het beeld in de studio is gemaakt.

| Plek | Bestand | Bron in Sanity |
|---|---|---|
| Hero `/kettlebell-training` | `kettlebell-hero.jpg` | gallery "Rogue Kettlebells" |
| Hero `/personal-training` | `personal-training-hero.jpg` | `offeringPersonalTraining` |
| Hero `/mobility` | `mobility-hero.jpg` | gallery "Mobility Area" |
| Hero `/krachttraining` | `krachttraining-hero.jpg` | gallery "Pull Up" |
| Portret Marlon (trainersblok) | `marlon.jpg` | `trainer.photo` |

Alle drie de basisbewegingen op `/kettlebell-training` (swing, goblet squat, Turkish get-up) zijn tekstkaarten; `goblet-squat.jpg` is verwijderd. Niet gebruikt: `offeringStrength` (een man met "MARLON" op zijn hoodie, terwijl Marlon een vrouw is).

## Vrij trainen en schema

Leden met vrij trainen krijgen geen standaard schema in de app: een schema wordt alleen door Marlon aangemaakt via de admin-builder of het dupliceren van een bestaand schema, en er is geen koppeling aan een abonnement (`spec-trainingsprotocol.md`). Daarom staat nergens op deze pagina's dat vrij trainen een schema bevat. "Schema" bij personal training (intake en schema, door Marlon) blijft staan.

## Attributie van de kennismaking

Locatiepagina's, hub en `/personal-training` linken naar `/proefles?kaart=bellen` (het terugbelformulier, dat naar `tmc.trial_requests`, MailerLite en ntfy gaat). Er is geen bronveld in `trial_requests`; een kolom toevoegen is een Supabase-wijziging en valt buiten deze PR.

Bevinding over `recordLeadAttribution`: `landing_path` wordt **niet** vastgelegd als de eerste pagina van het bezoek. `parseAttribution` en `sanitizeLeadAttribution` (`src/lib/attribution/params.ts`) leveren alleen iets op als er minstens een advertentie- of campagneparameter is (gclid, gbraid, wbraid, fbclid of utm_*). Zonder zo'n parameter komt er geen rij in `tmc.lead_attributions`, dus ook geen `landing_path`. En met zo'n parameter is `landing_path` de pagina die de parameters droeg (via `lp` of de huidige URL van `/proefles/*`), niet per se de eerste pagina van het bezoek. Een organische bezoeker die via `/personal-trainer-hilversum` naar `/proefles?kaart=bellen` gaat, laat dus geen spoor achter in de database. In GA4 is die route wel zichtbaar via paginapaden. Niets gewijzigd; een bronveld of een landingspagina-registratie voor organisch verkeer is een eigen beslissing.

## Open punten voor Marlon

- **Goedkeuring op de Vercel-preview.** Mergen zet de pagina's live. Alle copy, de FAQ-antwoorden en de reistijden zijn aangeleverd door Ilja en staan onder `// COPY: confirm met Marlon`.
- **Echte foto's (should).** De AI-beelden voor kettlebell, personal training, krachttraining en mobility vervangen door echte foto's van de studio onder `public/images/lokaal/`.
- **PT-tijden (should):** vaste tijden of in overleg? (veld `tijden.ptTijden`, nu leeg).
- **`/mobility` blijft concept (should)** tot er een mobility-les in het rooster staat. In productie geeft de route een 307 naar `/aanbod`; de sitemap bevat zeven nieuwe routes.
- **`/aanbod` belooft "Mobility Sessions" (should)**, maar die lessen staan niet in het rooster. Buiten deze PR.
- **Mobility in het rooster.** Het klassentype "Mobility Reset" bestaat (60 min, actief) maar heeft nog nooit een sessie gehad en geen actieve template; in pijler `yoga_mobility` staan alleen yoga-vormen. `/mobility` linkt daardoor naar een rooster met alleen yogalessen. Beslissen: een mobilityles inplannen, of de pagina herformuleren.
- **Kaart**: de SVG is schematisch; een statische afbeelding is een latere keuze.

## Open punten voor ons

- **PR B (interne links):** dienstblokken op `/aanbod`, Aanbod-submenu, footerkolom Regio en de regio-sectie op `/yoga` naar de nieuwe pagina's. Nog niet gebouwd.
- **Prioriteit should: attributie van organische leads.** `recordLeadAttribution` schrijft alleen een rij in `tmc.lead_attributions` bij een gclid of utm-parameter (zie "Attributie van de kennismaking"). Organische leads, ook die via de nieuwe pagina's binnenkomen, laten daardoor geen spoor achter in de database, alleen in GA4. Apart oppakken (een eigen opdracht, mogelijk met een schemawijziging); niet in deze PR.

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

- **PR #357, PR A fundament:** 2026-11-17. Acht routes met sjablonen, contentbestanden op `concept`, typegebonden inhoudseis, `ExerciseGym` met `@id`, `Service` en `BreadcrumbList`, sitemap voor `live`-pagina's, CLAUDE.md gecorrigeerd. Conceptpagina's geven alleen in productie een 307 (`VERCEL_ENV === 'production'`); op preview en lokaal renderen ze met `noindex, nofollow` en een conceptbalk. Visueel gecontroleerd op de Vercel-preview (alle acht routes, 390 en 1280 px) en vergeleken met de mockup; screenshots niet bewaard. Bewust niet aangeraakt: Sanity, Supabase, `/aanbod`, `AANBOD_DROPDOWN`, Footer, `/yoga`, interne links, redirects vanaf ptloosdrecht.nl, nieuwe analytics-events, `recordLeadAttribution` (open punt, apart oppakken).
- **PR #358, inhoud en livegang:** 2026-11-17. Zeven pagina's op `live` (`/mobility` blijft `concept`: er staat geen mobility-les in het rooster; mobility als groepsles is van de live pagina's gehaald): reistijden (Google Maps, 17-11-2026), FAQ's, quotes met woonplaats en bron (type `Quote`: `woonplaats` in plaats van `wijk`), statbalken met de werkelijke lesduur, foto's uit Sanity onder `public/images/lokaal/`, Hilversum op 12 minuten, geen schema-claim bij vrij trainen, extra vertrekpunten op de locatiepagina's. Bewust niet aangeraakt: `/yoga`, `/aanbod`, `AANBOD_DROPDOWN`, Footer (PR B), Supabase, Sanity, `recordLeadAttribution`.
