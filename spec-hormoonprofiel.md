# Spec: hormoonprofiel.com als informatiesite

hormoonprofiel.com (voorheen WordPress/WooCommerce bij SiteGround) wordt een informatiesite op het TMC-platform. Eén inhoudsbron in `content/hormoonprofiel/`, twee schillen: **standalone** (hormoonprofiel.com, licht, eigen identiteit) en **sectie** (`https://www.themovementclub.nl/hormoonprofiel`, TMC-huisstijl). Welke van de twee publiek is, volgt uit de modus van hormoonprofiel.com in Vercel Global Config (item `legacy_domains`, uitbreiding van #359, zie `spec-legacy-domains.md`). Er bestaat altijd precies één publieke versie.

Ontwerp: `mockups/hormoonprofiel-mockup.html` (v1.1). Geen prijzen, bedragen, pakketten, winkelwagen of bestelknoppen. Alleen Marlon.

## Modi

`standalone` is alleen geldig voor hormoonprofiel.com; voor elk ander domein is de waarde ongeldig (warn plus standaardmodus). Voor hormoonprofiel.com geldt `off` als `standalone` (met `console.warn`), en ook een onbereikbare Global Config, een ontbrekend item of een ongeldige waarde geeft `standalone`. De standaardmodus in het register is `standalone`.

| Host en pad | standalone (en off) | redirect_temporary | redirect_permanent |
|---|---|---|---|
| hormoonprofiel.com, een van de 10 pagina's | rewrite naar `/hp-site/<pad>`, canonical op hormoonprofiel.com | 307, een hop naar `https://www.themovementclub.nl/hormoonprofiel/<slug>` | 308, idem |
| hormoonprofiel.com, oude shoppaden | 308 naar de bestemming op dezelfde host | 307 naar het TMC-equivalent | 308 naar het TMC-equivalent |
| hormoonprofiel.com, 410-lijst | 410 | 410 | 410 |
| hormoonprofiel.com, onbekend pad | eigen 404 (status 404, noindex) | 307 naar `/hormoonprofiel` | 308 naar `/hormoonprofiel` |
| www.hormoonprofiel.com | 308 naar de apex, een hop | een hop naar TMC (afwijking: niet eerst naar de apex) | idem |
| www.themovementclub.nl/hormoonprofiel/* | 307 naar hormoonprofiel.com/<slug> | sectie getoond, canonical op TMC | idem |
| `/hp-site/*` op elke andere host dan hormoonprofiel.com | 404 | 404 | 404 |

Redirects naar TMC krijgen `?utm_source=hormoonprofiel&utm_medium=redirect` (zoals de overige legacy-domeinen), technische bestanden (robots, sitemap) niet. Trailing slash is niet canoniek: een pad met slash gaat in een hop naar de juiste bestemming. Op TMC is `/hormoonprofiel` daarvoor uitgezonderd van de algemene slash-redirect in `next.config.ts`; de proxy handelt het af.

Assets (`/_next`, `/_vercel`, `/hp-assets`, `/.well-known`) en `/api/leads/hormoonprofiel` gaan op hormoonprofiel.com in standalone ongemoeid door.

### Slugs (1:1, ook de ankers)

home `/`, wat `/wat-is-personal-hormonal-profiling`, waarom `/waarom-is-een-persoonlijk-hormoonprofiel-belangrijk`, hoewerkt `/hoe-werkt-personal-hormonal-profiling`, training `/het-belang-van-hormoontraining`, supplementen `/voedingssupplementen` (#multivitamine, #visolie, #fundazymes, #matcha), voeding `/voedingsrichtlijnen`, profielen `/verschillende-hormoonprofielen` (#insuline-profiel, #cortisol-profiel, #oestrogeen-profiel, #groeihormoon-profiel, #thyroid-profiel, #testosteron-profiel), faq `/veel-gestelde-vragen`, contact `/contact-gegevens`.

### Oude shop- en restpagina's

| Oud pad | Naar | Code |
|---|---|---|
| `/product/hormonen-in-balans`, `/hormonen-in-balans` | hoe-werkt | 308 (307 in redirect_temporary) |
| `/trainen-op-basis-van-hormoonprofiel` | het-belang-van-hormoontraining | idem |
| `/winkelwagen`, `/test-shop`, `/payment-failed`, `/payment-confirmation`, `/shop-2`, `/shop`, `/afrekenen`, `/mijn-account`, `/product/*`, `/product-categorie/*`, `/product-tag/*` | home | idem |
| `?add-to-cart=` of `?p=` op elk pad | home | idem |
| `/our-process`, `/contact-sidebar`, `/contact-minimal`, `/contact-creative`, `/contact-classic`, `/pricing-*`, `/services-*`, `/portfolios`, `/portfolios/*`, `/wp-admin*`, `/wp-login.php`, `/wp-content/*`, `/wp-includes/*`, `/xmlrpc.php`, `/feed*`, `/comments/feed*` | 410 Gone, in elke modus | 410 |
| elk ander onbekend pad | zie modustabel | |

In een redirect-modus is "home" gelijk aan `/hormoonprofiel` en gaat een bestemming naar `/hormoonprofiel/<slug>`. De hele mapping staat in `src/lib/hormoonprofiel/redirects.ts`, de tests in `scripts/hormoonprofiel/` (`npm run test:hormoonprofiel`).

## Bouw

- Proxy: `src/proxy.ts` en `src/lib/legacy-domains/{handle,mode,override,registry,types}.ts` uitgebreid; geen tweede mechanisme. Matcher en `LEGACY_HOSTS` in `next.config.ts` blijven gelijk.
- Routes: `src/app/hp-site/[[...slug]]` (intern, eigen layout, eigen 404, `robots.txt`, `sitemap.xml`, `favicon.svg`), `src/app/hormoonprofiel/[[...slug]]` (sectie). `SiteShell` en `GlobalJsonLd` herkennen de standalone-schil aan `useSelectedLayoutSegment() === "hp-site"`, omdat `usePathname()` bij een rewrite het browserpad geeft.
- Componenten: `src/components/hormoonprofiel/` (CSS-module overgenomen uit de mockup, `.hp` en `.tmc` via CSS-variabelen).
- Inhoud: `content/hormoonprofiel/*.ts` (title, meta, h1, in het kort, blokken, faq, gerelateerd, dateModified). `_bron/` bevat de ruwe tekst van de oude site, wordt nooit geserveerd en valt buiten de prijzentest.
- Preview-override (alleen preview en development): header `x-legacy-host-test`, of `?__host=hormoonprofiel.com` (cookie `__host`, wissen met `?__host=reset`) en `?__mode=standalone|redirect_temporary|redirect_permanent` (cookie `__hp_mode`).

## Kennismakingsformulier

`POST /api/leads/hormoonprofiel`, dezelfde stroom als de 12 weken-intake, geen tweede systeem: rij in `tmc.programma_intakes` (geen migratie), daarna best-effort MailerLite, ntfy, mail aan Marlon en attributierij. Verschillen: `signup_path` is `/hormoonprofiel` in beide modi; `preferred_day` is `geen voorkeur` (kolom is `not null`); `landing_path` is `/hormoonprofiel?host=<host>&mode=<standalone|section>` met een eventuele advertentielanding als `lp`; MailerLite-groep uit `MAILERLITE_HORMOONPROFIEL_GROUP_ID` (leeg: overgeslagen met een warning, nooit `GROUPS.PROGRAMMA_INTAKE`); ntfy-titel "Hormoonprofiel: kennismaking aangevraagd!" (buiten productie met "TEST: "); mail met onderwerp "Kennismaking hormoonprofiel" zonder voorkeursdag, alleen tekstlinks. Spam: honeypot `website` en minimaal 3 seconden invultijd (stil succes, niets opgeslagen). Gevolg: de kennismakingen staan in `/app/admin/intakes` tussen de 12 weken-intakes; onderscheid via `signup_path`.

## SEO en meting

Per pagina title (`<onderwerp> | Hormoonprofiel` of `| The Movement Club`), meta, canonical per schil, JSON-LD (Person met hasCredential, WebPage/Article/ContactPage met author en dateModified, BreadcrumbList, FAQPage op home en faq, WebSite alleen standalone; organisatie is een verwijzing naar `#business`). In standalone eigen sitemap (10 pagina's) en robots (zelfde AI-crawlerbeleid, gedeeld in `src/lib/robots-policy.ts`); de TMC-sitemap bevat de sectie alleen in een redirect-modus (ververst elk uur). Geen noindex op inhoud, wel op de 404.

Event `kennismaking_hormoonprofiel` (eventregister in `spec-analytics.md`), alleen na toestemming. De meetgrens (`analytics-scope.ts`) bevat `/hormoonprofiel`, `/hp-site` en de negen publieke paden van hormoonprofiel.com. Geen cross-domain koppeling: de consent-keuze (localStorage) en de GA4-cookie zijn per origin, dus de banner verschijnt op hormoonprofiel.com opnieuw en een bezoeker telt daar als aparte sessie in dezelfde property.

## Open punten

- **COPY-check Marlon**: alle teksten (`// COPY: confirm met Marlon`), de meetpunten per profiel (afgeleid van de BioSignature-indeling, Marlon checkt ze tegen het Overload-materiaal), de waterregel (3 liter per dag), de reactietijd "binnen 1 werkdag", de formulering bij "Wat kost het?" en de supplementteksten (alleen claims van de EU-lijst).
- Nullable velden in `content/hormoonprofiel/shared.ts`, nooit zichtbaar zolang leeg: `certificeringJaar`, `ervaringJaren`, `vragenlijstZichtbaarVoor` (wie ziet de antwoorden, waar bewaard).
- Foto's: de mockup heeft vlakken zonder label voor Marlon en de studio; echte beelden ontbreken.
- Favicon: tijdelijk een "h" in cursief serif op salie (`src/app/hp-site/favicon.svg/route.ts`).
- Geen rate limit op het formulier (geen herbruikbare helper; zelfde gat als `/api/proefles`).
- Kaart: alleen het adres, geen kaartafbeelding.
- Een `source`-kolom op `programma_intakes` zou het onderscheid met de 12 weken-intake expliciet maken (zou een migratie vragen, bewust niet gedaan).
- `MAILERLITE_HORMOONPROFIEL_GROUP_ID` moet in Vercel (Production en Preview); Ilja maakt de groep aan.
- GA4: `kennismaking_hormoonprofiel` na de merge als key event markeren.

## Livegang (stappenplan voor Ilja, niet door Claude uit te voeren)

De zone van hormoonprofiel.com staat bij SiteGround (ns1/ns2.siteground.net, registrar GoDaddy) en de mail draait daar ook (MX naar `mx*.antispam.mailspamprotection.com`). De SiteGround-hosting en de zone worden dus niet opgezegd.

1. Vercel: voeg `hormoonprofiel.com` en `www.hormoonprofiel.com` toe aan het TMC-project en noteer de DNS-waarden die Vercel geeft (voor ptloosdrecht.nl waren dat apex A `216.150.1.1` en een eigen CNAME voor www; gebruik altijd wat Vercel voor dit domein toont).
2. Vercel Global Config: zet in `legacy_domains` het domein `hormoonprofiel.com` op `standalone`, vóór de DNS-wissel. Zet ook `MAILERLITE_HORMOONPROFIEL_GROUP_ID` (en maak de MailerLite-groep aan).
3. Export vóór elke wijziging de volledige zone uit SiteGround.
4. SPF-check vóór de wissel: stuur een testmail van info@hormoonprofiel.com naar een Gmail-adres, kies "Origineel weergeven" en noteer dat SPF op pass staat en via welk mechanisme (de SPF bevat `+a`, dus het apex-A-record telt mee).
5. DNS bij SiteGround: apex, vervang alleen de vier A-records door de waarde van Vercel. www, verwijder de vier A-records en zet de CNAME van Vercel in de plaats. MX, SPF, DKIM, DMARC en de google-site-verification TXT blijven ongewijzigd.
6. Na de wissel: herhaal de testmail en de SPF-controle, en test een mail naar info@hormoonprofiel.com. Is SPF geen pass meer, meld dat; het SPF-record wordt niet aangepast zonder apart besluit.
7. Controleer met `curl -I` de belangrijkste URL's (`/`, een inhoudspagina met slash, `/product/hormonen-in-balans`, `/winkelwagen`, `/wp-login.php`, www).
8. Schakel de WordPress-installatie bij SiteGround pas uit na een geslaagde controle. De mailboxen blijven daar staan.

Terug naar TMC-sectie later: zet het Global Config-item op `redirect_permanent` (of eerst `redirect_temporary`); de sectie staat dan live en in de TMC-sitemap.

## Moduswijzigingen

| Datum | Domein | Oude modus | Nieuwe modus | Door wie |
|---|---|---|---|---|
| (volgt) | hormoonprofiel.com | off (standaard in code) | standalone | Ilja bij de uitrol |

## Ledger

| PR | Branch | Merge-hash | Datum | Omschrijving |
|---|---|---|---|---|
| #360 | feat/hormoonprofiel-site | de54743 | 2026-11-21 | **Hormoonprofiel als informatiesite:** modus `standalone` voor hormoonprofiel.com in de bestaande legacy-domeinstap (register, mode, handle, override, matcher), interne route `/hp-site` met eigen 404, robots, sitemap en favicon, sectie `/hormoonprofiel` op TMC, 10 pagina's uit een inhoudsbron, redirect- en 410-mapping in `src/lib/hormoonprofiel/redirects.ts`, kennismakingsformulier `/api/leads/hormoonprofiel` op de intake-stroom, event `kennismaking_hormoonprofiel`, meetgrens, prijzentest. Bewust niet aangeraakt: DNS, Vercel-domeinen en Global Config-store, Supabase en migraties, `programma_intakes` (geen source-kolom), de TMC-sitemap in standalone, cross-domain meting, een rate limit. |
