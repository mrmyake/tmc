# Discovery: Navigatie & Sitestructuur — Actuele Staat

**Datum:** 2026-07-13
**Scope:** Read-only inventarisatie. Geen code gewijzigd, geen branch aangemaakt.
**Methode:** Uitsluitend gebaseerd op wat nu in de code op `mockup/rooster-coverage-kleuren` (= main + lopend werk) staat. Eerdere specs (`navigation-refactor-spec.md`, CLAUDE.md) zijn NIET als bron gebruikt, alleen als vergelijkingsmateriaal waar relevant.

---

## A. Volledige inventarisatie per oppervlak

### A1. Marketing / publieke navigatie

**Bronbestanden:** `src/lib/constants.ts` (`NAV_LINKS`, `AANBOD_DROPDOWN`), `src/components/layout/Navbar.tsx`, `src/components/layout/Footer.tsx`, `src/components/layout/CampaignTeaser.tsx`, `src/components/layout/SiteShell.tsx`.

**Hoofdnav (`NAV_LINKS`, gedeeld door Navbar desktop + mobiel + Footer):**

| Label | Route | Zichtbaarheid |
|---|---|---|
| Home | `/` | Altijd |
| Aanbod | `/aanbod` (+ dropdown, zie hieronder) | Altijd |
| Prijzen | `/prijzen` | Altijd |
| Early Member | `/early-member` | Altijd; **label** wisselt naar "Word lid" als `campaignPhase === "closed"` (Navbar.tsx:108), href blijft gelijk |
| Over ons | `/over` | Altijd |
| Contact | `/contact` | Altijd |

**Aanbod-dropdown (`AANBOD_DROPDOWN`, desktop hover-menu / mobiel uitklap):**

| Label | Route |
|---|---|
| Groepslessen | `/aanbod#groepslessen` |
| Yoga | `/yoga` |
| Vrij trainen | `/aanbod#vrij-trainen` |
| All Access | `/aanbod#all-access` |
| Personal Training & Duo | `/aanbod#personal-training` |
| 12-weken programma | `/12-weken-programma` |

**Utility-items (niet in `NAV_LINKS`, wel in Navbar):**
- "Inloggen" → `/login` of "Ga naar app" → `/app`, client-side bepaald via Supabase auth-check (Navbar.tsx:64-82, 105-106). Rendert pas na auth-check (opacity-gate), voorkomt flits.
- "Plan je proefles" CTA-knop → `/proefles`, altijd zichtbaar.
- Campagne-teaserbalk (`CampaignTeaser.tsx`) boven de nav, site-wide, met eigen link naar `/early-member`. Verdwijnt volledig bij `phase === "closed"` of na dismiss (localStorage).

**Footer (`Footer.tsx`):**
- Herhaalt volledig `NAV_LINKS` (dus ook "Home") onder kop "Navigatie", plus "Plan je proefles".
- Eigen kolom "Gratis starten": `/beweeg-beter`, `/mobility-reset`, `/mobility-check`.
- Eigen kolom "Ook van Marlon": extern naar hormoonprofiel.com.
- Onderbalk: `/privacybeleid`, KvK/BTW.

**Publieke routes die bestaan maar NIET in enige nav/footer staan (alleen via een losse link of direct URL bereikbaar):**

| Route | Hoe wél bereikbaar | Bronbestand |
|---|---|---|
| `/rooster` (publiek weekrooster) | Eén link "Bekijk het volledige rooster" in de `ScheduleTeaser`-sectie op de homepage — niet in nav, footer, of Aanbod-dropdown | `src/components/blocks/ScheduleTeaser.tsx` |
| `/checkin` | Geen enkele link in de site; expliciet uitgesloten van SiteShell-chrome én van robots.txt (`DISALLOW`). Dit is bewust een kiosk/staff-route, geen navigatiegat. | `src/app/robots.ts`, `src/components/layout/SiteShell.tsx` |
| `/betaal/[token]` | Alleen bereikbaar via een verstuurde betaallink (mail/WhatsApp), geen nav-ingang. Bewust — transactionele link, geen navigatiegat. | `src/lib/orders/payment-link.ts` |
| `/proefles/annuleren/[token]` | Alleen via annuleer-link in bevestigingsmail. Bewust. | — |
| `/yoga/docenten`, `/yoga/docenten/[slug]`, `/yoga/rooster` | Bereikbaar via interne links vanaf `/yoga` zelf, niet vanuit de hoofdnav rechtstreeks (wel indirect via Aanbod-dropdown → Yoga → interne links). Geen probleem, gewoon een subniveau. | `src/app/yoga/*` |

`/beweeg-beter`, `/mobility-reset`, `/mobility-check` staan wél in de Footer maar NIET in de hoofdnav of Aanbod-dropdown — bereikbaar, maar alleen via scrollen naar de footer.

---

### A2. Lid-app navigatie (MemberNav + AppChrome + TrainerNav)

**Bronbestanden:** `src/app/app/layout.tsx` (auth-guard + data-fetch), `src/app/app/AppChrome.tsx` (client chrome-switch), `src/components/nav/MemberNav.tsx`, `src/components/nav/TrainerNav.tsx`, `src/components/nav/AvatarDropdown.tsx`, `src/components/nav/MobileAccountActions.tsx`.

**MemberNav — vaste items (`BASE_ITEMS`, MemberNav.tsx:26-65):**

| Label (desktop) | Label (mobiel tab) | Route | Match-prefixes |
|---|---|---|---|
| Rooster | Rooster | `/app/rooster` | `/app/rooster` |
| Mijn lessen | Lessen | `/app/boekingen` | `/app/boekingen` |
| Lidmaatschap | Abbo | `/app/abonnement` | `/app/abonnement`, `/app/facturen` |
| Schema | Schema | `/app/schema` | `/app/schema` |
| Profiel | Profiel | `/app/profiel` | `/app/profiel` |
| Support | Support | `/app/support` | `/app/support` |

**Conditioneel item:**

| Label | Route | Conditie |
|---|---|---|
| Vrij trainen | `/app/vrij-trainen` | `eligibleForVrijTrainen` — waar op `memberships.covered_pillars` bevat `'vrij_trainen'`, membership status `active` of `paused` (berekend server-side in `src/app/app/layout.tsx:59-81`). Wordt tussen "Rooster" en "Mijn lessen" ingevoegd (MemberNav.tsx:96-98). |

**Logo/wordmark** (MemberNav.tsx:117-122) linkt naar `/app` (het dashboard), niet naar de marketing-homepage.

**TrainerNav — vaste items (TrainerNav.tsx:15-27):**

| Label | Route |
|---|---|
| Mijn sessies | `/app/trainer/sessies` |
| Profiel | `/app/profiel` |

**AppChrome-routing (AppChrome.tsx:33-49):** kiest puur op `pathname`-prefix: `/app/admin/**` krijgt geen chrome (eigen shell verderop), `/app/trainer/**` krijgt `TrainerNav`, al het overige `/app/**` krijgt `MemberNav`.

**`/app`-routes die bestaan maar NIET in MemberNav/TrainerNav staan:**

| Route | Hoe bereikbaar | Bronbestand |
|---|---|---|
| `/app` (dashboard-landing zelf) | Alleen via de MemberNav-logo/wordmark (desktop) — **geen item in de bottom-tab bar mobiel**. Sinds de "landing-flip 2026-07-12" (zie `auth/callback/route.ts` comment) is dit ook het daadwerkelijke post-login target voor members (`roleRedirect()` retourneert `/app`, niet `/app/rooster` zoals CLAUDE.md nog beschrijft). | `src/app/auth/callback/route.ts:14`, `src/app/app/page.tsx` |
| `/app/producten` | Alleen via een kaart-knop op het dashboard (`DashboardCredits.tsx`), via `/app/abonnement`-tabs, en via `/prijzen`/`/login?next=/app/producten` voor ingelogde leden. Geen item in MemberNav. | `src/app/app/_components/DashboardCredits.tsx:45`, `src/app/prijzen/PrijzenContent.tsx` |
| `/app/pt` (PT-boekingsflow) | **Geen enkele nav-, dashboard- of marketing-link wijst hierheen.** De enige interne referenties zijn de pagina zelf en zijn eigen `/app/pt/bedankt`-bevestigingspagina (die na afronden terug linkt naar `/app/pt`, niet ergens anders naartoe). Ook `/aanbod#personal-training` (de marketing-sectie voor PT) heeft geen CTA naar `/app/pt`. Dit is een volledig verweesde route in de huidige navigatiegraaf. | `src/app/app/pt/page.tsx`, `src/app/app/pt/bedankt/page.tsx`, `src/lib/catalogue.ts`, `src/lib/member/pt-booking-actions.ts` |
| `/app/vrij-trainen` | Wel bereikbaar (conditioneel nav-item + interne links vanuit `/app/rooster` en de check-in flow), maar alleen zichtbaar in nav als eligible — geen probleem, werkt naar spec. | — |
| `/app/schema/geschiedenis`, `/app/schema/[dayId]/workout` | Bereikbaar via interne links binnen `/app/schema`, geen apart nav-item nodig. | — |

---

### A3. Admin navigatie

**Bronbestanden:** `src/app/app/admin/layout.tsx`, `src/app/app/admin/_components/AdminSidebar.tsx`, `src/components/nav/AdminHeader.tsx`, `src/components/nav/AdminMobileBlock.tsx`.

**Sidebar — "Daily" groep (AdminSidebar.tsx:42-47):**

| Label | Route |
|---|---|
| Dashboard | `/app/admin` |
| Rooster | `/app/admin/rooster` |
| Leden | `/app/admin/leden` |
| Trainers | `/app/admin/trainers` |

**Sidebar — "Secondary" groep, na horizontale scheider (AdminSidebar.tsx:49-64):**

| Label | Route |
|---|---|
| Betaalverzoeken | `/app/admin/betaalverzoeken` |
| Pauzes | `/app/admin/pauzes` |
| Aankondigingen | `/app/admin/aankondigingen` |
| Oefeningen | `/app/admin/oefeningen` |
| Lestypes | `/app/admin/lestypes` |
| Instellingen | `/app/admin/instellingen` |

**Sidebar — extern (AdminSidebar.tsx:66-68):** "Content ↗" → `/studio`, opent in nieuw tabblad (`target="_blank"`).

**AdminHeader:** TMC·Admin-wordmark (géén link — puur tekst/span, dus geen dubbele-home-situatie zoals in de marketing nav), `DropoffBell`, `PauzeRequestBell`, `AvatarDropdown` (context-switcher).

**Admin-routes die bestaan maar niet in de sidebar staan:**

| Route | Hoe bereikbaar |
|---|---|
| `/app/admin/leden/[id]` en `/app/admin/leden/[id]/schema/[programId]` | Via klik op een lid in de Leden-lijst — verwacht drill-down, geen nav-gat. |
| `/app/admin/sessies/[id]` | Via klik vanuit Rooster — verwacht drill-down. |
| `/app/admin/dropoff` | Alleen via de `DropoffBell` in de header (badge/link naar drop-off-lijst), niet in de sidebar zelf. Vergelijkbaar patroon als `PauzeRequestBell` → `/app/admin/pauzes` (die WEL ook in de sidebar staat). `Dropoff` heeft dus alleen de bell als ingang. |

**Mobiel:** `AdminMobileBlock.tsx` toont onder `lg:` een "Desktop vereist"-scherm i.p.v. de admin-UI, met één link terug naar `/app`. Dit is bewust (spec: Marlon werkt op desktop).

---

## B. Verificatie van de door Ilja genoemde symptomen

### 4. Dubbele "Home" — **BEVESTIGD**

Er zijn zelfs **drie** ingangen naar `/` op elke marketing-pagina, niet twee:

1. **Logo/wordmark** — linkt naar `/` (`Navbar.tsx:120-134`, `<Link href="/">` om "TMC · The Movement Club").
2. **"Home"-nav-item** — apart item in `NAV_LINKS` (`src/lib/constants.ts:57`: `{ label: "Home", href: "/" }`), gerenderd in zowel de desktop-nav (`Navbar.tsx:137-204`) als het mobiele uitklapmenu (`Navbar.tsx:243-309`).
3. **Footer "Navigatie"-kolom** herhaalt dezelfde `NAV_LINKS`-lijst inclusief "Home" (`Footer.tsx:40-44`).

De "Home"-knop doet **niets anders** dan het logo — beide zijn een kale `<Link href="/">`, zonder verschil in gedrag, tracking, of doel. Dit is een pure, functieloze duplicatie.

### 5. 12-weken-programma-microsite — **BEVESTIGD, doelbewust maar zonder weg terug**

`/12-weken-programma` en `/12-weken-programma/intake` krijgen een volledig eigen layout (`src/app/12-weken-programma/layout.tsx`) met eigen `ProgrammaTopbar` en `ProgrammaFooter`, expliciet ontworpen om NIET de standaard Navbar/Footer te tonen (`SiteShell.tsx:60-68`, met commentaar dat dit bewust is om een eerdere dubbele-header-bug op `/beweeg-beter` niet te herhalen).

- `ProgrammaTopbar.tsx`: bevat alleen het merk-wordmark (linkt terug naar `/12-weken-programma` zelf, niet naar `/`) en één CTA-knop naar `/12-weken-programma/intake`. **Geen enkele link naar de rest van de site.**
- `ProgrammaFooter.tsx`: bevat alleen merknaam, adres en een gezondheidsdisclaimer. **Geen navigatielinks.**

Conclusie: eenmaal op deze microsite is er **geen enkele in-site link** terug naar de hoofdnavigatie (Aanbod, Prijzen, Over ons, Contact, etc.) of naar de homepage. De enige uitgang is de browser-back-knop of het handmatig aanpassen van de URL. Dit is expliciet zo ontworpen (comments in de code bevestigen de intentie: losstaande funnel-pagina, "geen 3-koloms nav-footer... hoort niet bij deze losse, funnel-achtige pagina"), maar het is wel degelijk een doodlopende weg vanuit het perspectief van sitenavigatie.

### 6. Schema-item conditie — **NIET GEÏMPLEMENTEERD; item toont zich altijd**

Een repo-brede zoekactie naar het woord "protocol" (de term uit het besluit "ooit protocol gehad EN nog lid") levert **nul treffers** op in de hele `src/`-boom. Er bestaat geen gate van dit type in de code.

De feitelijke code in `MemberNav.tsx:26-65`:

```ts
const BASE_ITEMS: NavItem[] = [
  { href: "/app/rooster", label: "Rooster", ... },
  { href: "/app/boekingen", label: "Mijn lessen", ... },
  { href: "/app/abonnement", label: "Lidmaatschap", ... },
  {
    href: "/app/schema",
    label: "Schema",
    icon: Dumbbell,
    matchPrefixes: ["/app/schema"],
  },
  { href: "/app/profiel", label: "Profiel", ... },
  { href: "/app/support", label: "Support", ... },
];
```

"Schema" staat onvoorwaardelijk in `BASE_ITEMS` — dezelfde array die voor élke ingelogde member wordt gebruikt, ongeacht membership-historie. Er is geen `eligibleForSchema`-achtige prop, geen server-side check op een ooit-actief-protocol. De enige conditionele nav-logica in dit bestand betreft "Vrij trainen" (`eligibleForVrijTrainen`), niet Schema.

Ter bevestiging: de `/app/schema`-pagina zelf (`src/app/app/schema/page.tsx:22,49-57`) gate't ook niet — een member zonder programma ziet gewoon een lege-staat-tekst ("Je hebt nog geen trainingsschema...") in plaats van geredirect of verborgen te worden.

**Conclusie: het besluit is niet (meer) geïmplementeerd. Het item toont zich voor elk lid, inclusief leden die nog nooit een trainingsprotocol hebben gehad.**

### 7. Early Member-pagina bereikbaarheid — **Ruim bereikbaar, correct fase-afhankelijk gelabeld**

`/early-member` is via meerdere permanente ingangen bereikbaar, ongeacht campagnefase:

1. Hoofdnav-item (`NAV_LINKS`), zowel desktop als mobiel — **label** wisselt van "Early Member" naar "Word lid" zodra `campaignPhase === "closed"` (`Navbar.tsx:108`), maar de **href blijft altijd `/early-member`** — het item verdwijnt dus nooit uit de nav, het wordt alleen herlabeld.
2. Site-wide `CampaignTeaser`-balk boven de nav (`CampaignTeaser.tsx`), met eigen "Word Early Member →"-link naar dezelfde route. Deze balk verdwijnt volledig wanneer `phase === "closed"` (return `null`, regel 36) — dus dán is deze specifieke ingang weg, maar de nav-ingang (1) blijft staan.
3. Twee CTA-knoppen op `/prijzen` (`PrijzenContent.tsx:215, 706`) die naar `/early-member` linken, niet zichtbaar fase-afhankelijk gemaakt in de grep-resultaten (verdere content-fasering van die pagina zelf viel buiten deze navigatie-scoped discovery).

Conclusie: de navigatie-ingang naar `/early-member` is structureel niet aan campagnefase gekoppeld (behalve het label-woord) — alleen de teaserbalk-ingang is dat wél. Dit is consistent gedrag, geen gevonden bug op navigatieniveau.

---

## C. Dubbels, doodlopers, gaten

### 8. Dubbele ingangen

| Dubbel | Locaties |
|---|---|
| **Home** (3x) | Logo, "Home"-navitem (desktop+mobiel), Footer-navigatielijst |
| **Context-switch-logica** gedupliceerd | `AvatarDropdown.targetsFor()` (`AvatarDropdown.tsx:37-49`) en `MobileAccountActions.targetsFor()` (`MobileAccountActions.tsx:22-32`) zijn functioneel identieke kopieën — geen gedeelde bron. Geen zichtbaar gedragsverschil vandaag, wel een onderhoudsrisico (raken makkelijk uit sync bij een toekomstige rol-wijziging). |
| **Dropoff-toegang** | `/app/admin/dropoff` alleen via `DropoffBell`, niet via sidebar — vergelijkbare notificatie-bell (`PauzeRequestBell`) heeft wél ook een sidebar-item (Pauzes). Inconsistent patroon, geen echte "dubbel" maar wel een asymmetrie. |

### 9. Doodlopers (geen weg terug/verder)

| Doodloper | Beschrijving |
|---|---|
| `/12-weken-programma` (+ `/intake`) | Zie punt 5 — geen enkele link terug naar hoofdnav/homepage. |
| Ingelogde app-gebruiker → marketing-site | Zie punt 11 hieronder — geen enkele link vanuit `/app/**` terug naar de publieke site zolang je ingelogd blijft. |
| Mobiele member zonder pad terug naar dashboard | Zie punt 10 — `/app` (dashboard) heeft geen bottom-tab-item; alleen bereikbaar via de desktop-logo-link, dus op mobiel na de eerste landing effectief een "doodloper" terug naar het dashboard zonder browser-back. |

### 10. Verweesde routes (bestaan, staan nergens in nav)

- **`/app/pt`** (PT-boekingsflow) — volledig verweesd, zie A2. Geen enkele nav-, dashboard- of marketing-ingang.
- **`/rooster`** (publieke weekrooster-pagina) — bereikbaar, maar alleen via één link in een homepage-widget (`ScheduleTeaser`), niet via hoofdnav, footer, of Aanbod-dropdown. Vanaf elke andere marketingpagina is dit rooster niet bereikbaar zonder eerst terug naar de homepage te gaan.
- **`/beweeg-beter`, `/mobility-reset`, `/mobility-check`** — bereikbaar, maar alleen via de Footer, niet via hoofdnav of Aanbod-dropdown, ondanks dat dit (per CLAUDE.md-strategie) de primaire lead-funnel is.

### Mobiele bottom-tab cap — bevestigd, overschrijdt de 5-item-vuistregel

`MemberNav.tsx:26-73,99-109` bevat een expliciete `GRID_COLS`-lookup voor 4 t/m 7 kolommen, met de eigen code-comment: *"BASE_ITEMS heeft 6 items (incl. Support); met Vrij trainen erbij is dat 7."*

- **Niet-eligible member:** 6 tabs (Rooster, Lessen, Abbo, Schema, Profiel, Support).
- **Eligible-for-Vrij-Trainen member:** 7 tabs (+ Vrij).

Beide zitten ruim boven de gangbare 5-item-grens voor bottom-tab-bars. Omdat Schema zich (zie punt 6) áltijd toont — ook voor leden die het nooit zouden moeten zien — draagt die ongeconditioneerde item direct bij aan de overvolle balk: zonder de Schema-bug zou de basis 5 items zijn (net binnen de grens), met Vrij Trainen 6.

`/app/producten` zit hier inderdaad niet in — die ingang is, zoals aangegeven, bewust uitgesteld en alleen via een dashboard-kaart en de abonnement/prijzen-flow bereikbaar, niet via de tab-bar.

### Gaten en overbodigheden op structuurniveau

**Ontbrekend / niet logisch vindbaar:**
- Een lid dat op mobiel van tab wisselt, kan niet meer terug naar het dashboard (`/app`) — er is geen "Home"/"Dashboard"-tab in de bottom-bar, en de enige ingang (logo) bestaat alleen in de desktop-header.
- Een lid dat een PT-sessie wil boeken vindt daar nergens een knop voor — `/app/pt` bestaat en werkt vermoedelijk, maar is vanuit de UI onvindbaar (zie punt 8/A2).
- Vanuit de admin-cockpit is er geen link naar `/app/admin/dropoff` behalve de bell — een admin die de bell mist (of wiens badge op 0 staat) heeft geen andere ingang naar die pagina.

**Staat er iets in de nav dat er niet hoort:**
- De losse "Home"-nav-item is, gegeven het altijd-aanwezige logo, puur ruis — geen andere marketingpagina in de nav heeft een dergelijke 1-op-1 duplicaat.
- Verder niets gevonden dat structureel misplaatst is (geen dode links, geen 404-wijzende items in de onderzochte navs).

---

## D. Relatie tussen de drie oppervlakken

**Marketing → App:**
- "Inloggen"/"Ga naar app" utility-link in Navbar (client-side auth-check, desktop + mobiel).
- `/login`-pagina zelf, met `next`-param support voor deep-links (bv. `/login?next=/app/producten` vanaf `/prijzen` voor niet-ingelogde bezoekers, `PrijzenContent.tsx`).
- Na login: `auth/callback/route.ts` bepaalt rol-gebaseerde landing (`/app/admin`, `/app/trainer/sessies`, of bare `/app` voor members — zie A2 discrepantie met CLAUDE.md).

**App → Marketing: GEEN ENKELE LINK GEVONDEN.**
Een repo-brede zoekactie naar `href="/"` binnen `src/app/app/**` en `src/components/nav/**` levert nul treffers op. `SiteShell.tsx` sluit `/app/**` bewust uit van de marketing-Navbar/Footer (`isApp`-check), en geen enkel app-nav-component (MemberNav, TrainerNav, AdminHeader, AvatarDropdown) bevat een link terug naar de publieke site. De enige weg terug is: uitloggen → land op `/login` → die pagina heeft zelf wél een link naar `/` (`src/app/login/page.tsx:62`). Zolang je ingelogd bent, is er dus geen manier om even naar de marketingsite te gaan (bijvoorbeeld om `/contact` te checken) zonder uit te loggen.

**App ↔ Admin (role-switch):**
- Consistent voor desktop (`AvatarDropdown`) en mobiel (`MobileAccountActions`), zie punt 8 voor de gedupliceerde implementatie.
- Alleen zichtbaar voor `role === "admin"`; toont de twee ándere contexten (nooit de huidige).
- `AdminMobileBlock` linkt bij te smal scherm terug naar `/app` (member-dashboard), niet naar de vorige context — voor een admin die op mobiel in de trainer-view zat, is dat een kleine context-sprong (trainer → member i.p.v. terug naar trainer), maar functioneel geen doodloper.

**Samenvatting:** de overgang marketing → app is soepel en dubbel geborgd (nav-link + login-pagina zelf). De overgang app → admin en terug is consistent geïmplementeerd (al dubbel gecodeerd). De overgang app → marketing ontbreekt structureel — dat is het enige echte gat in de relatie tussen de drie werelden.

---

## OORDEEL

**(a) Ingetogen opruimen volstaat.** Geen van de bevindingen wijst op een informatie-architectuur die fundamenteel niet meer klopt. De drie oppervlakken (marketing, member-app, admin) hebben elk een coherente, begrijpelijke eigen navigatiestructuur met een duidelijke rolscheiding (single-string `role`, layout-guards, geen middleware-complexiteit). Er is geen sprake van concurrerende navigatiepatronen, geen inconsistente rol-modellen, en geen brede overlap tussen oppervlakken die op een architectuurniveau zou moeten worden herzien. Alle gevonden problemen zijn **losse, goed afgebakende reparaties**:

- Ze zijn stuk voor stuk lokaal op te lossen (één component, één conditie, één link) zonder de driedeling of de rol-gebaseerde routing aan te raken.
- De ernstigste bevinding (Schema-conditie ontbreekt volledig) is een regressie/nooit-gebouwd stuk logica, geen ontwerpfout — de infrastructuur ervoor (`eligibleForVrijTrainen`-patroon) bestaat al en is direct herbruikbaar als voorbeeld.
- De microsite-doodloop (12-weken-programma) is een **bewuste** ontwerpkeuze in de code-comments, geen abuis — of dat zo moet blijven is een productbeslissing, geen structuurprobleem.

**Reparaties, gegroepeerd per oppervlak:**

**Marketing:**
1. Verwijder het losse "Home"-nav-item (desktop, mobiel, footer) — het logo dekt deze functie al volledig.
2. Beslis bewust of `/rooster`, `/beweeg-beter`, `/mobility-reset`, `/mobility-check` een structurele nav/dropdown-ingang verdienen, of dat de huidige footer/homepage-widget-only bereikbaarheid acceptabel is (dit is een productkeuze, geen bug).
3. Als de 12-weken-programma-microsite toch een weg terug moet krijgen: één kleine link in `ProgrammaTopbar`/`ProgrammaFooter` volstaat — geen layout-herziening nodig.

**Lid-app (member):**
4. Implementeer de ontbrekende Schema-conditie ("ooit protocol gehad EN nog lid"), naar analogie van het bestaande `eligibleForVrijTrainen`-patroon in `src/app/app/layout.tsx` + `MemberNav.tsx`.
5. Los daarmee grotendeels de mobiele tab-cap op (met de fix zakt de basis terug naar 5, met Vrij Trainen 6 — nog steeds het overwegen waard om "Support" evt. te verplaatsen naar het profiel-scherm i.p.v. een eigen tab).
6. Voeg een link naar `/app/pt` toe op een logische plek (dashboard-kaart, en/of vanuit `/aanbod#personal-training` voor ingelogde leden) — momenteel volledig onvindbaar.
7. Overweeg een "Dashboard"/logo-equivalent in de mobiele bottom-tab-bar, of accepteer expliciet dat `/app` alleen via desktop-logo bereikbaar is.
8. Update CLAUDE.md's beschrijving van de post-login landing (`/app/rooster`) naar de huidige werkelijkheid (`/app`, sinds de landing-flip van 2026-07-12) — een documentatie-fix, geen code-fix.

**App ↔ Marketing:**
9. Voeg een link terug naar de marketingsite toe binnen de ingelogde chrome (bijvoorbeeld in `AvatarDropdown`/`MobileAccountActions`, naast "Mijn profiel"/"Uitloggen") zodat een lid niet hoeft uit te loggen om even naar `/contact` of `/aanbod` te gaan.

**Admin:**
10. Optioneel: voeg `/app/admin/dropoff` toe aan de sidebar naast de bell, voor consistentie met het Pauzes-patroon.
11. Optioneel: dedupliceer `targetsFor()` in `AvatarDropdown.tsx` en `MobileAccountActions.tsx` naar één gedeelde functie.

Geen van deze reparaties vereist het aanraken van de layout-driedeling, de rol-guards, of de route-boomstructuur zelf.

---

## Besluiten & doorgevoerde reparaties (chore/nav-cleanup)

**Status:** PR open, nog niet gemerged. Merge-hash hieronder invullen zodra de PR daadwerkelijk gemerged is.
**Merge-hash:** _TBD — in te vullen na merge._

### Marketing

- **Home verwijderd uit de top-nav en de footer-lijst hergebruikt niet langer dezelfde array.** `NAV_LINKS` (`src/lib/constants.ts`) bevat nu alleen het content-cluster: Aanbod, Prijzen, Early Member, Over ons. Een nieuwe `FOOTER_NAV_LINKS` (Home + content-cluster + Contact) is losgetrokken voor de footer, zodat Home en Contact daar blijven bestaan zonder in de top-nav te staan. Pagina's `/` en `/contact` zelf zijn niet aangeraakt.
- **Contact verplaatst naar footer-only**, zoals hierboven.
- **Top-nav visueel gesplitst** in content-cluster (Aanbod/Prijzen/Early Member/Over ons) en actie-cluster (Inloggen + Plan je proefles), gescheiden door een verticale divider (`border-l border-bg-subtle`, bestaande token). Desktop én mobiel.
- **"Inloggen" vervangt de vroegere "Ga naar app"/"Inloggen"-wissel.** De client-side Supabase auth-check (useState/useEffect met lazy-imported client, plus de opacity-gate tegen flitsen) is verwijderd uit `Navbar.tsx`. Eén statische link naar `/app` werkt voor zowel uitgelogde als ingelogde bezoekers, omdat `/app` zelf al naar `/login` redirect als er geen sessie is (`src/app/app/layout.tsx`).
- **12-weken-programma-microsite heeft een terugroute gekregen** (`ProgrammaTopbar.tsx`, "← Terug naar aanbod" → `/aanbod`). Discovery-bevinding (punt 5 hierboven, herbevestigd): de microsite wordt uitsluitend binnengekomen via het "12-weken programma"-item in de Aanbod-dropdown (`AANBOD_DROPDOWN`) — er is geen aparte sectie/anchor op `/aanbod` zelf — dus de terugroute wijst naar `/aanbod` als geheel. De rest van de microsite (geen standaard Navbar/Footer) is ongewijzigd.

### Lid-app (member)

- **Schema-conditie hersteld.** Discovery-bevinding (punt 6, herbevestigd): het item toonde zich onvoorwaardelijk voor elk lid; een repo-brede zoekactie naar "protocol" leverde nul treffers op, het besluit was nooit geïmplementeerd. Nu berekend in `src/app/app/layout.tsx` als `everHadProgram && isActiveMember`:
  - `everHadProgram` = een actieve `training_programs`-rij **of** minstens één `workout_sessions`-rij. Reden voor de OR: RLS-policy `training_programs_self_active_read` laat een lid alleen de eigen `active`-rij lezen, geen `archived` — een gearchiveerd (afgerond) protocol is dus niet direct navraagbaar. `workout_sessions_self_read` kent geen status-filter, dus een gelogde workout bewijst een protocol uit het verleden ook als het programma inmiddels is gearchiveerd.
  - `isActiveMember` = membership-rij met status `active`/`paused` (dezelfde soort check als de eerdere `eligibleForVrijTrainen`).
- **PT (`/app/pt`) heeft een nav-ingang gekregen** via "Meer" — was volledig verweesd (discovery punt 10, herbevestigd: geen enkele nav-, dashboard- of marketing-link wees hierheen, ook niet vanuit `/aanbod#personal-training`). Conditie bewust minimaal gehouden op `isActiveMember` (geen nieuwe business-rule); een fijnmaziger `hasPtCredits`-check bestaat al voor de dashboard-entitlements maar is bewust niet hier toegepast — zie CLAUDE.md.
- **MemberNav herbouwd naar exact 5 vaste tabs**: Home (`/app`), Rooster, Boekingen (label gewijzigd van "Mijn lessen"/"Lessen"; paginatitel blijft "Mijn boekingen"), Producten (`/app/producten`, was ook al verweesd qua nav — nu wel bereikbaar), Meer.
- **"Meer"-overloopmenu** (nieuw component `MemberMoreMenu.tsx`, zelfde interactiepatroon/styling als de bestaande `AvatarDropdown`): Profiel, Account en instellingen (voorheen "Lidmaatschap", nu wijzend naar `/app/abonnement`), Schema (conditioneel), PT (conditioneel), Support, en een externe link terug naar de marketingsite.
  - **Inferentie, niet expliciet in de opdracht:** "Support" stond niet in de opgegeven Meer-lijst. Weglaten zou `/app/support` opnieuw orphanen (exact het soort regressie dat deze cleanup moet oplossen) — toegevoegd als zesde Meer-item.
  - **Inferentie:** "Account en instellingen" is de nieuwe naam voor de oude "Lidmaatschap"-ingang (`/app/abonnement`) — er bestaat geen aparte route die beter bij die naam past.
  - **Inferentie:** "Vrij trainen" had geen aangewezen plek in de nieuwe structuur (niet in de 5 vaste tabs, niet in de Meer-lijst). Verwijderd als nav-item; de bestaande in-page link vanuit `/app/rooster` blijft de ingang. Dit is ook precies wat de mobiele tab-cap (discovery punt 9) veroorzaakte, dus dit lost dat gelijk mee op.
  - De externe link opent `/` (relatief, niet het harde `themovementclub.nl`-domein) in een nieuw tabblad — zodat hij ook op preview-deployments naar de juiste omgeving wijst i.p.v. altijd naar productie.
- De bestaande `AvatarDropdown` (desktop, "Hoi, {firstName}" met "Mijn profiel"/"Uitloggen"/context-switcher) is **niet aangeraakt** — "Profiel" is dus zowel via Meer als via de avatar-dropdown bereikbaar. Kleine, onschadelijke overlap; niet opgelost in deze PR.

### Admin

- Uitsluitend documentatie: CLAUDE.md's beschrijving van de member post-login-landing is gecorrigeerd van `/app/rooster` naar `/app`. Geen code-wijziging in de admin-nav zelf.

### Niet in deze PR (bewust uitgesteld, zie OORDEEL hierboven)

- `/rooster`, `/beweeg-beter`, `/mobility-reset`, `/mobility-check` krijgen geen nieuwe nav/dropdown-ingang — blijft een productbeslissing.
- Dedupliceren van `targetsFor()` tussen `AvatarDropdown.tsx` en `MobileAccountActions.tsx`.
- `/app/admin/dropoff` toevoegen aan de admin-sidebar naast de bell.
- Fijnmazige `hasPtCredits`-conditie voor de PT-Meer-item.
