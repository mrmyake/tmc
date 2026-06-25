# TMC Functioneel Ontwerpdocument

> Single source of truth voor wat de website en de member app van The Movement Club moeten bevatten en doen. Dit document is geen architectuur- of designspec; het beschrijft functionaliteit op capability-niveau, zo geformuleerd dat je het naast de gebouwde code kunt leggen, gaten kunt vinden, en er automatische tests op kunt baseren.

Versie: 1.0
Stack-aanname: Next.js 15 App Router, Tailwind 4, TypeScript, Sanity CMS, Supabase (DB plus auth plus RLS), Mollie, MailerLite, MailerSend, GA4 met Consent Mode v2, Vercel.

---

## 0. Doel en gebruik

Dit document dient drie doelen:

1. **Gap-analyse.** Leg elke capability naast de codebase en markeer de status. Wat niet bestaat, valt meteen op.
2. **Testbasis.** Elke capability heeft een acceptatiecriterium dat als test te schrijven is. Hoofdstuk 6 vertaalt die criteria naar een concrete teststrategie.
3. **Volledigheid.** Door alles te benoemen wat een boutique-studio plus member system nodig heeft, komen ontbrekende stukken bovendrijven voordat ze in productie pijn doen.

### Statuslegenda

Vul de statuskolom in tijdens de discovery-sessie (zie hoofdstuk 8). Startwaarden zijn ingevuld waar de huidige stand bekend is.

| Status | Betekenis |
|---|---|
| Gebouwd | Aanwezig en werkend, geverifieerd |
| Deels | Gedeeltelijk aanwezig, incompleet of ongetest |
| Ontbreekt | Nog niet gebouwd |
| Roadmap | Bewust uitgesteld, staat op de planning |
| Te verifiëren | Status onbekend tot discovery |
| N.v.t. | Niet van toepassing op TMC |

### Universele conventies (gelden overal in dit document en in alle output)

- User-facing copy is Nederlands.
- Geen em-dashes; gebruik komma, puntkomma, dubbele punt, of herstructureer.
- Prijzen altijd gelabeld als "per 4 weken", nooit "per maand".
- Copy-beslissingen die Marlon moet bevestigen, markeren met `// COPY: confirm with Marlon`.
- Admins dragen nooit de member-rol; admin-rechten subsumeren member-capabilities. Role-switch via avatar-dropdown.

---

## 1. Cross-cutting requirements

Dit zijn eisen die niet bij één scherm horen maar overal moeten kloppen. Ze zijn vaak het makkelijkst te vergeten en het duurst om achteraf in te bouwen.

| ID | Capability | Acceptatiecriterium (testbaar) | Test | Status |
|---|---|---|---|---|
| X-01 | Taal en copy | Geen enkele user-facing string bevat een em-dash; prijzen tonen "per 4 weken" | Unit lint plus E2E assertie | Te verifiëren |
| X-02 | Rollen en rechten | Member kan geen admin-route of admin-action aanroepen; admin ziet en kan alles wat member kan plus meer; admin heeft nooit member-rol toegekend | Integration plus E2E | Te verifiëren |
| X-03 | Role-switch | Admin kan via avatar-dropdown naar member-weergave en terug zonder opnieuw in te loggen | E2E | Te verifiëren |
| X-04 | Design tokens | Kleuren, fonts en radius komen uit de design-tokens (warm black, stone, champagne, Fraunces, Inter), geen hardcoded waarden in componenten | Unit plus visuele inspectie | Te verifiëren |
| X-05 | Privacy en consent | Cookie- of consent-banner verschijnt voor niet-essentiële tracking; GA4 vuurt pas na consent (Consent Mode v2); meest privacy-vriendelijke optie is default | E2E plus network-assertie | Deels (Consent Mode v2 geconfigureerd) |
| X-06 | AVG-rechten | Member kan eigen data inzien en verwijdering aanvragen; er is een gedocumenteerd proces voor inzage en verwijdering | Handmatig plus procesdoc | Ontbreekt (te verifiëren) |
| X-07 | Security: server-only mutaties | Geen privileged mutatie draait client-side; service-role key komt nooit in de client; elke server action is input-gevalideerd | Integration plus code-review | Te verifiëren |
| X-08 | Security: RLS | Elke tabel met persoonsdata heeft RLS aan; member leest of muteert alleen eigen rijen; events-tabel staat geen update of delete toe | RLS-smoke (zie 6.4) | Deels (events-tabel volgt in PR4) |
| X-09 | Performance | Core Web Vitals in het groen op mobiel voor home, rooster, prijzen, en de discipline-pagina's | Lighthouse CI | Te verifiëren |
| X-10 | Toegankelijkheid | Geen kritieke axe-violations op publieke pagina's en op de boekingsflow; tap-targets en contrast voldoen aan WCAG AA | axe in Playwright | Te verifiëren |
| X-11 | SEO-baseline | Elke publieke pagina heeft unieke title plus meta-description, canonical, en correcte Open Graph; sitemap.xml en robots.txt aanwezig en kloppend | Unit metadata-assertie plus crawl | Deels (yoga live) |
| X-12 | Structured data | LocalBusiness JSON-LD op studio- en contactpagina; Service en FAQPage waar van toepassing; valideert zonder fouten | Schema-validator in CI | Deels |
| X-13 | Analytics-events | Kern-conversies (proefles-aanvraag, wachtlijst-inschrijving, lidmaatschap-start) vuren een GA4-event met consent | E2E network-assertie | Te verifiëren |
| X-14 | Error monitoring | Server-fouten landen in Vercel-logs; geen Sentry of andere externe error-tracker aanwezig | Code-review | Te verifiëren |
| X-15 | Event-driven foundation | Elke betekenisvolle state-wijziging schrijft een onveranderlijk event weg (append-only) | Integration (na PR4) | Roadmap (PR4) |
| X-16 | Responsiveness | Alle pagina's en de hele boekingsflow werken op mobiel zonder horizontaal scrollen of te kleine tap-targets | E2E op mobiel viewport | Te verifiëren |

---

## 2. Marketing website (publiek)

Doel: bezoeker informeren en omzetten naar proefles, wachtlijst, of lidmaatschap. De moat van TMC zit hier (brand, SEO, positionering), dus dit verdient testdekking op conversiepaden, niet alleen op cosmetiek.

### 2.1 Globaal en navigatie

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-01 | Hoofdnavigatie | Bevat routes naar disciplines, rooster, prijzen, trainers, over, contact; werkt op mobiel (hamburger) | E2E | Te verifiëren |
| W-02 | Dubbele CTA-intentie | Header toont twee CTA's met verschillende intentie: een voor wie wil starten (proefles of inschrijven), een voor wie nog oriënteert (rooster of wachtlijst) | E2E plus inspectie | Ontbreekt (te verifiëren) |
| W-03 | Footer | Bevat adres (Industrieweg 14P, Loosdrecht), contact, links naar privacy en voorwaarden, social | Unit plus inspectie | Te verifiëren |
| W-04 | 404 en error-pagina's | Eigen 404 en error-pagina in brand-stijl, met weg terug naar home | E2E | Te verifiëren |

### 2.2 Home en landing

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-10 | Hero met positionering | Headline communiceert Movement, Mobility, Strength en voor wie het is; primaire CTA boven de vouw | Inspectie plus E2E | Te verifiëren |
| W-11 | Social proof | Reviews, testimonials of resultaten zichtbaar op het beslismoment, niet als bijzaak onderaan | Inspectie | Ontbreekt (te verifiëren) |
| W-12 | Studio-sfeer | Beeld of video van de ruimte en de community, niet alleen apparatuur | Inspectie | Te verifiëren |
| W-13 | Trainer-credibility | Marlon als gezicht van het merk zichtbaar, met Kettlebell Master-certificering als E-E-A-T-signaal | Inspectie | Te verifiëren |

### 2.3 Discipline-pagina's

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-20 | Yoga-microsite (/yoga/) | Live, geïndexeerd, met eigen metadata en structured data; CTA naar wachtlijst of proefles | Crawl plus metadata-assertie | Gebouwd (live) |
| W-21 | Kettlebell-cluster (/kettlebell) | Pillar-pagina plus subpagina's conform spec-kettlebell-cluster; Service en FAQPage JSON-LD; CTA default naar MailerLite-wachtlijst tot bookings live is | Crawl plus schema-validatie | Roadmap (Phase 1 en 2) |
| W-22 | Discipline-consistentie | Elke discipline-pagina heeft dezelfde bouwstenen: wat het is, voor wie, schema-link, prijs (per 4 weken), CTA | Inspectie plus metadata-assertie | Te verifiëren |
| W-23 | Lokale SEO-framing | Pagina's claimen "yoga in Loosdrecht" en "personal training Loosdrecht"; Hilversum via nabijheid, zonder locatie verkeerd voor te stellen | Inspectie | Deels (yoga) |

### 2.4 Rooster (publiek)

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-30 | Publiek rooster | Bezoeker ziet lesrooster zonder login, leesbaar op mobiel | E2E | Te verifiëren |
| W-31 | Rooster naar boeking | Vanuit het rooster is er een directe, naadloze stap naar boeken of inschrijven; geen jarring overgang van design | E2E | Te verifiëren |
| W-32 | Roosterbron | Rooster komt uit één bron (Supabase of Sanity), niet handmatig dubbel onderhouden | Code-review | Te verifiëren |

### 2.5 Prijzen

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-40 | Prijsweergave | Alle prijzen "per 4 weken"; geen "per maand" | Unit string-assertie | Te verifiëren |
| W-41 | Prijslogica | Eventuele berekening (bijvoorbeeld pro-rata of strippenkaart) is centraal en getest | Unit | Te verifiëren |
| W-42 | Prijs naar actie | Elke prijsoptie heeft een CTA naar inschrijven of proefles | E2E | Te verifiëren |

### 2.6 Trainers

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-50 | Trainerprofielen | Profiel per trainer met foto, korte bio, coaching-stijl, en specialisme; niet alleen naam plus kwalificatie | Inspectie | Te verifiëren |
| W-51 | Yoga-instructeurs | Annouschka (Yin), Bionda (Restorative), Kim (Flow) opgenomen; Connie of Constanze Fluhme (Nidra of iRest) pas publiceren na bevestiging samenwerking | Inspectie | Deels `// COPY: confirm with Marlon` (Connie) |
| W-52 | CMS-gedreven | Trainers komen uit Sanity, niet hardcoded | Code-review | Te verifiëren |

### 2.7 Over, studio, locatie

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-60 | Over-pagina | Merkverhaal en waarom-TMC; framing als empowerment, niet druk | Inspectie | Te verifiëren |
| W-61 | Locatie | Adres Industrieweg 14P Loosdrecht, kaart of route, openingstijden | Inspectie plus LocalBusiness JSON-LD | Te verifiëren |

### 2.8 Content en blog

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-70 | Blog of artikelen | Content uit Sanity, met eigen metadata per artikel, ondersteunt de SEO-clusters | Crawl plus metadata-assertie | Te verifiëren |
| W-71 | Interne links | Artikelen linken naar de relevante discipline-clusters om domain authority te consolideren | Crawl | Te verifiëren |

### 2.9 Lead capture

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-80 | Wachtlijst | Inschrijving schrijft contact naar MailerLite; bevestiging zichtbaar; GA4-event vuurt na consent | E2E plus integration | Te verifiëren |
| W-81 | Proefles-aanvraag | Aanvraag komt aan (e-mail of record), bezoeker krijgt bevestiging, conversie-event vuurt | E2E | Ontbreekt (te verifiëren) |
| W-82 | Contactformulier | Verzending valideert input server-side, voorkomt spam, en bevestigt; reikt nooit een form aan dat via untrusted content is bereikt | E2E plus integration | Te verifiëren |
| W-83 | Formulier-privacy | Persoonsdata komt nooit in URL-parameters; formulier post naar eigen endpoint | Code-review | Te verifiëren |

### 2.10 Juridisch

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| W-90 | Privacyverklaring | Aanwezig, bereikbaar vanuit footer, AVG-conform, noemt welke data en welke verwerkers (Supabase, Mollie, MailerLite, MailerSend, GA4) | Inspectie | Ontbreekt (te verifiëren) |
| W-91 | Algemene voorwaarden | Aanwezig, bereikbaar, dekt lidmaatschap, opzegging, incasso, no-show-beleid | Inspectie | Ontbreekt (te verifiëren) |

---

## 3. Member system en app (ingelogd)

Doel: lid laat zelfstandig boeken, betalen, en beheren. Dit is de commodity-laag waar de meeste regressierisico's zitten omdat geld en toegang erin omgaan.

### 3.1 Authenticatie

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-01 | Registratie | Nieuw lid maakt account; e-mailverificatie via MailerSend; geen account-aanmaak die Claude of een bot automatisch doorloopt | E2E plus integration | Te verifiëren |
| M-02 | Login | Geldige credentials geven sessie; ongeldige worden geweigerd; SSR-cookies blijven intact na refresh en na deploy | E2E | Te verifiëren |
| M-03 | Wachtwoord-reset | Reset-link via MailerSend, eenmalig bruikbaar, verloopt | E2E plus integration | Te verifiëren |
| M-04 | Sessie en logout | Logout beëindigt sessie; verlopen sessie leidt naar login | E2E | Te verifiëren |

### 3.2 Onboarding en profiel

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-10 | Onboarding-flow | Nieuw lid wordt door de eerste stappen geleid (profiel, lidmaatschap, eerste boeking); geautomatiseerde welkomstcommunicatie vuurt | E2E plus integration | Te verifiëren |
| M-11 | Profielbeheer | Lid bewerkt eigen gegevens; wijziging persisteert en is RLS-beschermd | Integration plus E2E | Te verifiëren |

### 3.3 Lidmaatschap

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-20 | Lidmaatschap inzien | Lid ziet huidig lidmaatschap, prijs (per 4 weken), en status | E2E | Te verifiëren |
| M-21 | Pauzeren of upgraden | Indien aangeboden: lid pauzeert of upgradet; effect op incasso klopt | Integration plus E2E | Roadmap of te verifiëren |
| M-22 | Opzeggen | Lid zegt op binnen de voorwaarden; mandaat-revocatie en stopzetting incasso gebeuren correct | Integration | Ontbreekt (te verifiëren) |

### 3.4 Rooster en boeken

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-30 | Rooster (ingelogd) | Lid ziet beschikbare lessen met capaciteit en resterende plekken | E2E | Te verifiëren |
| M-31 | Boeken | Lid boekt een les; capaciteit telt af; dubbele boeking wordt voorkomen | Integration plus E2E | Gebouwd (PR3e, te verifiëren na merge) |
| M-32 | Hard cap | Boeking boven de harde capaciteit wordt geweigerd | Unit plus integration | Gebouwd (PR3a-d) |
| M-33 | Annuleren | Lid annuleert binnen het venster; plek komt vrij; release-cron geeft plek door | Integration plus E2E | Gebouwd (release-cron, te verifiëren) |
| M-34 | Wachtlijst | Volle les biedt wachtlijst; vrijgekomen plek wordt aangeboden volgens regel | Integration plus E2E | Ontbreekt (te verifiëren) |
| M-35 | Boekingshistorie | Lid ziet eigen boekingsgeschiedenis | E2E | Gebouwd (PR3e, te verifiëren) |

### 3.5 Check-in

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-40 | Check-in | Lid checkt in voor een geboekte les; check-in wordt geregistreerd | Integration plus E2E | Gebouwd (PR3e, te verifiëren) |
| M-41 | QR of toegang | Indien van toepassing: check-in via QR; toekomstige koppeling met Akiles-deurtoegang | E2E | Roadmap (Akiles) |

### 3.6 Betalingen (Mollie)

> Mollie-flow: de eerste betaling (first payment) verkrijgt een SEPA Direct Debit-mandaat. Daarna lopen incasso's recurring via dat mandaat zonder browsersessie. Statusupdates komen via webhook. Let op in test: een SEPA-betaling blijft in test op pending; gebruik creditcard in test om de recurring-flow te valideren.

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-50 | First payment en mandaat | Eerste betaling via iDEAL of creditcard vestigt een geldig mandaat; mandaat is opvraagbaar | Integration (test mode) | Te verifiëren |
| M-51 | Recurring incasso | Vervolgincasso loopt recurring op het mandaat; bedrag en periode (per 4 weken) kloppen | Integration | Te verifiëren |
| M-52 | Webhook-verwerking | Mollie-webhook update de betaalstatus idempotent; herhaalde of out-of-order calls breken niets | Contract plus integration | Te verifiëren (bestaat handler?) |
| M-53 | Mislukte betaling en retry | Mislukte incasso wordt herkend, status gezet, en volgens beleid opnieuw geprobeerd | Integration | Ontbreekt (te verifiëren) |
| M-54 | Facturen | Lid ziet facturen of betaalhistorie in de app | E2E | Te verifiëren |
| M-55 | Geen credentials in client | Mollie-key is server-only; geen betaalgegevens client-side gelogd | Code-review | Te verifiëren |

### 3.7 Notificaties en PWA

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| M-60 | E-mailnotificaties | Boekingsbevestiging, annulering, en betaalbevestiging gaan via MailerSend | Integration | Te verifiëren |
| M-61 | Push (PWA) | Indien PWA live: push voor herinneringen en wachtlijst-plek | E2E | Roadmap (PWA) |
| M-62 | PWA-laag | App installeerbaar, offline shell, als voorloper op Capacitor | Lighthouse PWA-audit | Roadmap |

---

## 4. Admin

Doel: Marlon of beheerder runt de studio. Voor een eenmansstudio is een deel hiervan licht; payroll is bewust laag geprioriteerd.

| ID | Capability | Acceptatiecriterium | Test | Status |
|---|---|---|---|---|
| A-01 | Ledenbeheer | Admin ziet, zoekt, en bewerkt leden; admin draagt nooit de member-rol | Integration plus E2E | Te verifiëren |
| A-02 | Attendance | Admin registreert check-in, no-show, en kan een member-boeking overschrijven | Integration plus E2E | Gebouwd (PR3e, te verifiëren) |
| A-03 | No-show-beheer | No-show wordt vastgelegd en heeft het beoogde gevolg (bijvoorbeeld telling of beleid) | Integration | Gebouwd (PR3e, te verifiëren) |
| A-04 | Roosterbeheer | Admin maakt en bewerkt lessen, capaciteit, en harde cap | Integration plus E2E | Te verifiëren |
| A-05 | Release-cron | Geplande job geeft plekken vrij volgens regel; draait betrouwbaar op Vercel | Integration plus log-inspectie | Gebouwd (PR3a-d, te verifiëren) |
| A-06 | Boekingsoverzicht | Admin ziet boekingen per les en per lid | E2E | Gebouwd (PR3e boekingen/page, te verifiëren) |
| A-07 | Financieel overzicht | Admin ziet omzet, openstaande en mislukte incasso's | Integration plus E2E | Ontbreekt (te verifiëren) |
| A-08 | Content (Sanity) | Beheerder bewerkt site-content via Sanity Studio op /studio | Handmatig | Te verifiëren |
| A-09 | Rapportage | Basis-inzicht in leden, bezetting, en retentie | E2E | Roadmap |

---

## 5. Integraties

Per integratie: wat te verifiëren en hoe het faalt. Integraties zijn waar verrassingen vandaan komen, dus elke krijgt minimaal een contract- of smoke-test.

| ID | Integratie | Wat verifiëren | Faalmodus om te testen | Status |
|---|---|---|---|---|
| I-01 | Supabase (DB plus auth) | RLS aan op persoonsdata; SSR-cookies stabiel; service-role alleen server-side | RLS-lek (member leest andermans rij); cookie-breuk na refresh | Te verifiëren |
| I-02 | Sanity CMS | Content-fetch werkt; preview en publish gescheiden; project hn9lkvte dataset production | Lege of stale content; broken reference | Te verifiëren |
| I-03 | Mollie | First payment, mandaat, recurring, webhook idempotent | Out-of-order webhook; mislukte incasso; test-mode SEPA pending | Te verifiëren |
| I-04 | MailerLite | Wachtlijst- en marketing-contact landt; geen dubbele inschrijving | API-fout slikt inschrijving stil | Te verifiëren |
| I-05 | MailerSend | Transactionele mail (verificatie, reset, bevestiging) komt aan | Mail verdwijnt; verkeerde template | Te verifiëren |
| I-06 | GA4 plus Consent Mode v2 | Events vuren pas na consent; meting klopt (G-2VFCDM4KRZ) | Tracking voor consent; event mist | Deels |
| I-07 | Vercel | Build, env (vercel env pull), logs als error-monitoring | Ontbrekende env-var in productie; cron draait niet | Te verifiëren |
| I-08 | Akiles (deurtoegang) | Toekomstig: Mobile SDK in de TMC-app; verzekeraar geraadpleegd voor smart lock | n.v.t. tot gebouwd | Roadmap |
| I-09 | Studio-tech (Sonos, lighting) | Toekomstig: control panel app, zones | n.v.t. tot gebouwd | Roadmap |

---

## 6. Teststrategie

Toegespitst op de stack. Het doel is niet maximale coverage, maar het vangen van regressies die geld of toegang kosten, zonder een tweede codebase te onderhouden.

### 6.1 Tooling

- **Vitest plus React Testing Library** voor unit en lichte integration: server actions, Zod-validatie, business-logica, synchrone Server Components en Client Components.
- **Playwright** voor E2E en voor async Server Components. Belangrijk: Vitest kan async Server Components nog niet renderen; die gaan naar Playwright. Dit is een capability-gap van de tool, geen keuze.
- **MSW** om Supabase-auth-calls en externe API's te mocken waar je geen echte call wilt.
- Geen Sentry; fouten via Vercel-logs.

### 6.2 Wat waar testen

| Laag | Tool | Dekt |
|---|---|---|
| Unit | Vitest | Boekingsregels, harde cap (M-32), rol-logica (X-02), prijslogica per 4 weken (W-41), no-show-regel, copy-lint (X-01) |
| Integration | Vitest of Playwright | Server actions, RLS-smoke (I-01), Mollie-webhook idempotentie (M-52), Sanity-fetch (I-02), mail-verzending (I-05) |
| E2E | Playwright | Kritieke flows: registratie tot eerste boeking, betaalflow, annuleren plus release, admin-override, lead capture |
| Contract | Playwright of Vitest | Webhook-payloads (Mollie nu, interne events na PR4) |
| Accessibility | axe in Playwright | Publieke pagina's plus boekingsflow (X-10) |
| Performance | Lighthouse CI | Home, rooster, prijzen, discipline-pagina's (X-09) |

### 6.3 Kritieke E2E-flows (de must-haves)

Dit zijn de flows die echt geld kosten als ze breken. Begin hier.

1. **Registratie tot eerste boeking.** Account, verificatie, login, lidmaatschap kiezen, les boeken, bevestiging.
2. **Betaalflow.** First payment plus mandaat, daarna een recurring incasso. Test recurring in test-mode via creditcard (SEPA blijft pending in test).
3. **Annuleren plus release.** Boeking annuleren, plek komt vrij, release-cron of wachtlijst geeft door.
4. **Admin-override en no-show.** Admin overschrijft een boeking en registreert een no-show; member ziet het juiste resultaat.
5. **Lead capture.** Wachtlijst-inschrijving landt in MailerLite en vuurt een GA4-conversie na consent.

### 6.4 RLS-smoke-patroon

Twee users, één rij, één assertie, tegen staging. User A maakt een rij; user B mag die niet lezen of muteren. Voer dit uit voor elke tabel met persoonsdata. Voor de events-tabel (na PR4) test je bovendien dat update en delete geweigerd worden, ook voor admin.

### 6.5 CI-opzet

- Draai op GitHub Actions, deploy via Vercel.
- Zet `workers: 1` in CI wanneer tests een gedeelde test-database raken; Playwright parallelliseert standaard en dat geeft foreign-key-botsingen op één Supabase-project.
- Gebruik een staging- of test-Supabase, nooit productie, voor destructieve of muterende tests.
- Test migraties tegen een test-database: pas toe, verifieer schema, en check of bestaande data behouden blijft. Dit dekt precies het PR3e-migratierisico.

### 6.6 Coverage en wat niet te testen

- Hoge dekking op kritieke paden: auth, betalingen, datamutaties, rollen. Circa 80 procent als baseline daar.
- Niet testen: code van derden (Mollie, Supabase zelf), pure type-definities, statische synchrone componenten die al door een Playwright-paginatest gedekt zijn, en visuele regressie op fonts (flaky).

---

## 7. Open punten en bekende gaten

Punten die het onderzoek opwierp en die in de discovery bevestiging of actie vragen.

- **Mollie-webhook handler.** Bestaat er al een handler die statusupdates idempotent verwerkt? Zo nee, dit is een hard gat voor recurring incasso (M-52, M-53).
- **Opzeg- en mandaat-revocatie.** Is er een opzegflow die ook het SEPA-mandaat netjes intrekt (M-22)?
- **Juridische pagina's.** Privacyverklaring en algemene voorwaarden lijken te ontbreken (W-90, W-91); nodig voor AVG en voor incasso-voorwaarden.
- **AVG-inzage en verwijdering.** Is er een proces voor data-inzage en verwijdering (X-06)?
- **Wachtlijst.** Member-wachtlijst (M-34) lijkt nog niet aanwezig terwijl het rooster vol kan lopen.
- **Proefles-aanvraag.** Aparte proefles-flow (W-81) los van wachtlijst is een sterk conversiepad en mogelijk nog niet gebouwd.
- **Dubbele CTA-intentie.** Header met twee intenties (W-02) is een bewezen conversie-element en de moeite van het toevoegen waard.
- **Connie of Constanze Fluhme.** Niet publiceren tot samenwerking bevestigd is. `// COPY: confirm with Marlon`
- **Kettlebell-schema, groepsgrootte, prijzen, certificering, foto's.** Open items voor Marlon voordat de kettlebell-cluster live kan.

---

## 8. Werkwijze voor de gap-analyse

Dit document is bedoeld voor een discovery-first Claude Code-sessie. De aanpak:

1. Laat Claude Code de codebase doorlopen en per capability-ID de status zetten (Gebouwd, Deels, Ontbreekt), met verwijzing naar het bestand of de route. Schrijf nog geen code.
2. Laat Claude Code een reconciliation-tabel teruggeven: ID, capability, status, vindplaats, en bij Deels of Ontbreekt een korte notitie wat er mist.
3. Beoordeel de tabel, prioriteer de gaten, en maak per gat of per testlaag een aparte PR-prompt (één PR per feature, conform jullie conventie).
4. Bouw de teststrategie uit hoofdstuk 6 incrementeel op: begin met de vijf kritieke E2E-flows en de RLS-smoke, breid daarna uit.

Universele regels voor die sessie staan bovenaan dit document onder de conventies; neem ze letterlijk over in de Claude Code-prompt.
