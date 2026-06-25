# TMC Full Audit — Claude Code prompt

**Versie:** 1.1 — 25 april 2026
**Scope:** themovementclub.nl (Next.js 15 + Tailwind 4 + Sanity + Supabase + Vercel)
**Doel:** een onafhankelijke, brede audit van de hele marketing-site. Niet alleen "werkt het", maar ook "wordt het gevonden", "voelt het zoals het hoort", en "wat ontbreekt er".

**Wijzigingen t.o.v. 1.0:** harde gate op design-skill aanwezigheid; forms-dry-run beleid (geen pollutie van MailerLite/Mollie); uitgebreide Lighthouse-budgets; nieuwe sub-audit "Platform & supply-chain health"; concrete missing-checks (error pages, OG image, Person schema); GSC-data analyse via `npm run audit:gsc`. Zie changelog onderaan.

Plak dit document in een **nieuwe** Claude Code sessie in de TMC repo root als eerste prompt. CC werkt het sequentieel af, fase voor fase, en stopt na elke fase voor jouw review.

---

## Context — lees dit eerst

Je voert een **read-only audit** uit op de TMC website. Drie dingen die je vooraf moet weten:

1. **Single source of truth voor het project** is `CLAUDE.md` in de repo root. Lees dat eerst, volledig. Het beschrijft wat er gebouwd is, wat er nog moet, brand, design tokens, analytics taxonomie, lead funnel, SEO targets, Sanity schemas. Behandel dat document als de specificatie waaraan de werkelijkheid getoetst wordt.

2. **Single source of truth voor design** is de skill `the-movement-club-design` (geïnstalleerd in `~/.claude/skills/the-movement-club-design/` of `.claude/skills/the-movement-club-design/`). Lees `SKILL.md` daar volledig. Alle visuele oordelen toets je hieraan — niet aan eigen interpretatie van "wat premium voelt".

3. **Wat NIET in scope is:**
   - De crowdfunding module-spec zelf (`tmc-crowdfunding-module.md` of `docs/crowdfunding/`). De pagina's `/crowdfunding` en `/crowdfunding/bedankt` in productie audit je wél, maar de implementatie-internals niet.
   - Het member systeem (`/app/*` routes, Supabase RLS, booking engine, check-in tablet flow, admin cockpit). Dat is een aparte audit-track. Branch `pr3e-wip-slim-bookings-status` raak je niet aan.
   - Sanity Studio internals (`/studio` route). Wel: of CMS-content correct render op publieke pagina's.

**Werkwijze:** vier fasen. Na elke fase: rapporteer in chat (kort), schrijf details naar bestand, **stop en wacht op `go fase X`** voordat je verder gaat. Maak nooit code-wijzigingen voordat fase 4 expliciet is goedgekeurd.

---

## Fase 0 — Setup & inventory (15 min werk, read-only)

### 0.1 Lees de specificatie

```bash
cat CLAUDE.md
```

Trek hieruit (in interne werkmemo, niet rapporteren):
- Lijst gebouwde pagina's en hun status
- Lijst nog-te-bouwen items
- Placeholder-waarden die nog vervangen moeten worden
- Brand pillars (Movement / Mobility / Strength)
- Design tokens (kleuren, typografie, spacing)
- Analytics event taxonomie
- SEO metadata per pagina
- Structured data spec

### 0.2 Lees de design skill (hard gate)

Probeer in volgorde:
1. `~/.claude/skills/the-movement-club-design/SKILL.md`
2. `.claude/skills/the-movement-club-design/SKILL.md` (project-lokaal)

**Als beide ontbreken:** stop niet, maar markeer dit zwaar. Rapporteer in chat onder fase 0:
> ⚠️ Design-skill `the-movement-club-design` niet gevonden. UX-audit (sectie 2.3) valt terug op design-tokens uit `CLAUDE.md` en `tailwind.config.*` + `globals.css`. Elk visueel oordeel wordt gemarkeerd als *"niet getoetst aan skill, alleen aan repo-tokens"*. Vraag Ilja: skill aanleveren vóór fase 2, of doorgaan met repo-fallback.

**Als skill wél aanwezig is**, trek eruit:
- Token-tabel (colors, typography, spacing, radius)
- Component-primitives en hun props
- Motion-defaults (duration, easing)
- A11y-defaults (focus rings, contrast)
- Voorbeeld-patronen voor hero/section/card/cta

In beide gevallen: in `00-inventory.md` één regel "Design-skill source: `<pad>` of `repo-fallback`".

### 0.3 Codebase inventory

```bash
# Routes
find src/app -name "page.tsx" -o -name "layout.tsx" -o -name "route.ts" | sort

# Componenten
find src/components -name "*.tsx" | sort

# Configs
ls -la next.config.* tailwind.config.* tsconfig.json package.json

# Analytics & SEO
find src -name "analytics*" -o -name "metadata*" -o -name "sitemap*" -o -name "robots*"

# Sanity
find . -path ./node_modules -prune -o -name "sanity.config.*" -print -o -name "schema*.ts" -print

# Public assets
ls -la public/ public/images/ 2>/dev/null
```

### 0.4 Live site fingerprint

```bash
# HTML van homepage en alle hoofdpagina's
for path in / /over /aanbod /contact /proefles /crowdfunding; do
  curl -sL "https://www.themovementclub.nl${path}" -o "/tmp/tmc-audit-$(echo $path | tr '/' '_').html"
  echo "Fetched: $path"
done

# robots.txt en sitemap
curl -sL https://www.themovementclub.nl/robots.txt > /tmp/tmc-audit-robots.txt
curl -sL https://www.themovementclub.nl/sitemap.xml > /tmp/tmc-audit-sitemap.xml
```

### 0.5 Google Search Console data

Check of er recente GSC-data klaarstaat in `docs/audit/data/gsc/`:

```bash
ls docs/audit/data/gsc/_meta.json 2>/dev/null && cat docs/audit/data/gsc/_meta.json
```

**Als `_meta.json` ontbreekt of ouder dan 7 dagen is:** vraag in chat:
> Geen recente GSC-data gevonden in `docs/audit/data/gsc/`. Draai eerst `npm run audit:gsc` (zie `scripts/audit-gsc.mjs` — vereist OAuth Desktop client en drie env-vars: `GSC_SITE_URL`, `GSC_OAUTH_CLIENT_PATH`, `GSC_TOKEN_PATH`). Of antwoord `skip GSC` om door te gaan zonder Search Console data.

Wacht op antwoord. Bij `skip GSC`: ga door en noteer in fase 2.1 dat GSC-analyse niet is gedraaid.

### 0.6 Rapporteer fase 0

Schrijf naar `docs/audit/00-inventory.md`:

```md
# Audit fase 0 — Inventory

## Routes gevonden (codebase)
[lijst, met status: heeft `metadata` export ja/nee]

## Componenten (top-level)
[lijst, gegroepeerd per folder]

## Live pagina's bereikbaar (HTTP 200)
[lijst]

## Live pagina's met afwijkingen
[404/500/redirect/blank]

## Configs aanwezig
[checklist]

## Sanity datasets & schemas in repo
[lijst]

## Discrepanties tussen CLAUDE.md status en werkelijkheid
[CLAUDE.md zegt "live", werkelijkheid zegt iets anders]
```

In chat: 5-regelige samenvatting plus `STOP — fase 0 klaar, wacht op "go fase 1"`.

---

## Fase 1 — De vier-luik audit (read-only, ~2 uur werk)

Dit is het hart. Vier categorieën, elk met eigen criteria. Bij elke bevinding: **bestand:regel** (codebase) of **URL + selector** (live site). Geen vage observaties.

### 1.1 The Good — wat werkt en waarom

Identificeer concrete sterke punten. Niet generiek ("ziet er goed uit") maar specifiek ("de hero op `/` gebruikt skill-token `--color-bg-deep` correct, animation duration 800ms zoals voorgeschreven, en de CTA-hierarchie matcht het pricing-model"). Per item: bestandsverwijzing + waarom het werkt + welke skill/CLAUDE.md regel het respecteert.

Categorieën om te bekijken:
- Brand consistency (tone of voice in copy, visuele rust)
- Componentgebruik (hergebruik, geen duplicatie)
- Performance wins (waar al goed)
- Accessibility wins (waar al goed)
- Lead funnel logica (waar de UX van funnel + intent klopt)

Doel: **5 tot 10 concrete wins.** Niet meer, niet minder. Geen filler.

### 1.2 The Bad — issues maar oplosbaar

Issues die de site niet stuk maken maar wel afbreuk doen aan kwaliteit, conversie, vindbaarheid of brand. Per bevinding:

```
**Bevinding:** [korte titel]
**Locatie:** src/path/file.tsx:42  (of:  https://www.themovementclub.nl/aanbod, sectie "Mobility")
**Wat is er:** [feitelijk wat je ziet]
**Waarom is het bad:** [verwijzing naar CLAUDE.md regel of skill-token of best practice]
**Impact:** [conversie / SEO / brand / UX / a11y / performance]
**Fix-effort:** S / M / L
```

Categorieën om expliciet door te lopen:
- Hardcoded waardes die uit Sanity zouden moeten komen (volgens CLAUDE.md schemas)
- Images zonder of met slechte `alt`-text
- Componenten die afwijken van skill-tokens (eigen kleuren, eigen radius, eigen font-size)
- Motion die afwijkt van skill-defaults (te snel, te druk, ontbreekt waar het hoort)
- Inconsistente CTA-hierarchie (twee primaries naast elkaar, onduidelijke next step)
- Copy die afwijkt van brand voice (sportschool-taal, em-dashes, emoji's, te lang)
- Forms zonder feedback states (loading, error, success)
- Navigation hiërarchie (lead magnets vindbaar?)
- Cross-links tussen pagina's (onbenutte mogelijkheden om mensen te bewegen)

### 1.3 The Ugly — kritisch, moet opgelost vóór je trots bent op de site

Issues die actief schade veroorzaken: dood links, gebroken forms, placeholders die public zijn, lekkende test-data, gebroken structured data, security-issues in client-side code, AVG-issues. Per bevinding: zelfde format als 1.2, plus expliciet **"blocking" of "non-blocking"** voor go-live.

Verplichte checks:
- **Placeholder-scan:** zoek in codebase én live HTML naar:
  ```
  +31 6 00 00 00 00
  NL000000000B01
  00000000          (KvK)
  wa.me/31600000000
  lorem ipsum
  test@example.com
  TODO / FIXME / XXX
  Featurable.* placeholder
  src="/images/placeholder
  alt=""              (lege alt op niet-decoratieve images)
  ```
- **Dode interne links:** crawl alle `<a href="/...">` op live site en check 200-status
- **Form-submission (NIET destructief):** test contact + proefles forms read-only — vul ze in, inspecteer payload via devtools Network-tab vóór submit, **klik nooit definitief op submit**. Geen echte MailerLite-records, geen Mollie-payments, geen Resend/MailerSend mails. Als end-to-end echt nodig: parkeer als open vraag voor Ilja met voorstel "schaduw-endpoint of staging-tag". Beoordelen op statische analyse: validatie-zod-schema, fout-states, success-state, redirect na submit, idempotentie van API-route.
- **Cookie consent:** is er een banner? Default-state denied vóór keuze? Worden GA4-hits écht geblokkeerd vóór toestemming (verifieer in devtools Network-tab dat `G-2VFCDM4KRZ` géén requests doet bij eerste page-load zonder consent)? Werkt opt-out (banner opnieuw kunnen openen → terugzetten naar denied)? `localStorage` key `tmc-cookie-consent` aanwezig en juist (`accepted`/`declined`)?
- **Cookie scan:** open `/` met clean session, accepteer cookies, dump `document.cookie` + `Application → Cookies` in devtools. Welke cookies staan er? Welke zijn first-party, welke third-party (GA, Vercel, Sanity, Featurable)? Komt elke cookie voor in de privacyverklaring?
- **GA4 firing:** verifieer in network-tab dat `G-2VFCDM4KRZ` requests doet ná consent. Doe hetzelfde op `/contact` en `/proefles` op `form_start` (eerste field-interactie). `generate_lead` testen mag pas na expliciete go van Ilja (raakt MailerLite).
- **Anti-bot bescherming forms:** rate-limiting op `/api/contact`, `/api/proefles`, `/api/leads`? Honeypot-veld of equivalent? Server-side validatie aanwezig (zod schema in route handler) los van client-validatie?
- **Email deliverability:** SPF/DKIM/DMARC voor `themovementclub.nl` (en eventuele subdomeinen) ingesteld voor de actieve ESP. CLAUDE.md noemt Resend als forms-backend, maar `package.json` heeft `mailersend` — verifieer welke daadwerkelijk verstuurt en of DKIM-record klopt. Test via `dig TXT _dmarc.themovementclub.nl` + `dig TXT default._domainkey.themovementclub.nl` (of een online MX-tool).
- **404 + error pages:** bestaat `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`? Renderen ze on-brand (skill-tokens, navbar/footer behouden, terug-naar-home CTA)? Test live: `curl -I https://www.themovementclub.nl/dit-bestaat-niet` → moet `404` geven, niet `500` of soft-200.
- **Security headers:** check `https://securityheaders.com/?q=themovementclub.nl` (of `curl -I`). CSP, X-Frame-Options, Referrer-Policy, HSTS, Permissions-Policy aanwezig? CSP staat third-party origins toe die de site écht laadt (GA, MailerLite forms, Sanity media-CDN, Featurable)?
- **AVG/legal:** is er een privacyverklaring? Cookieverklaring? Algemene voorwaarden? Worden ze duidelijk gelinkt vanuit de footer? Vermeldt de privacyverklaring álle ingezette verwerkers (MailerLite, GA4, Vercel logging, Resend/MailerSend, Sanity, Mollie, Supabase)?

### 1.4 Missing — wat is specced maar niet gebouwd

Vergelijk CLAUDE.md "Wat nog gebouwd moet worden" lijst met de werkelijkheid. Per ontbrekend item:
- Wat staat in CLAUDE.md
- Wat is er in werkelijkheid (niets / placeholder / half af)
- Impact als het ontbreekt (conversie, SEO, brand)
- Geschatte effort om het wél te bouwen

Verwachte missers (verifieer):
- `/beweeg-beter`, `/mobility-reset`, `/mobility-check` + `/bedankt` varianten
- API routes voor lead capture
- Slide-in banner + footer CTA banner
- Cookie consent (Consent Mode v2)
- `analytics.ts` event helper + tracking op alle CTA's en forms
- `robots.txt` (CLAUDE.md noemt `next-sitemap`; verifieer ook of de werkelijke `src/app/sitemap.ts` met de spec consistent is — drift = bevinding)
- Structured data (`GymOrHealthClub` in `layout.tsx`) + `Person` schema voor Marlon (founder/trainer) als losse aanvulling
- Open Graph tags per pagina (verifieer via `<meta property="og:*">` in de live HTML) **én** of `/og-image.jpg` (of equivalent) bestaat in `public/` met dimensies 1200×630
- Favicon-set compleet: `favicon.ico`, `apple-touch-icon`, `manifest.json`, `theme-color`
- `error.tsx` + `global-error.tsx` (Next.js App Router fout-grenzen, los van de `not-found.tsx`)
- MailerLite automations actief (PDF flow + 7-dagen sequence)
- Featurable widget ID
- Echte foto's i.p.v. placeholders

**Drift-checks spec ↔ repo:** noteer expliciet als bevinding wanneer:
- CLAUDE.md zegt "Resend voor transactionele emails" maar `package.json` heeft een andere ESP (bv. `mailersend`)
- CLAUDE.md noemt `next-sitemap` maar de repo gebruikt Next.js native `sitemap.ts`
- CLAUDE.md noemt schema's in `sanity/schemas/` die niet in de repo staan, of andersom
- Een dependency uit `package.json` wordt in geen enkel bestand geïmporteerd (dead dep)

### 1.5 Rapporteer fase 1

Schrijf vier files naar `docs/audit/`:
- `01-the-good.md`
- `02-the-bad.md`
- `03-the-ugly.md`
- `04-missing.md`

In chat: voor elke categorie 3 tot 5 zinnen prose (geen lijstjes). Plus `STOP — fase 1 klaar, wacht op "go fase 2"`.

---

## Fase 2 — Discoverability & UX audit (read-only, ~1.5 uur werk)

Drie sub-audits.

### 2.1 SEO discoverability

**Technische SEO:**
- `robots.txt` aanwezig en geen onbedoelde `Disallow`?
- `sitemap.xml` actueel? Bevat alle public routes (inclusief lead magnet pagina's wanneer die er zijn)? Geen `/studio`, `/api/*`, `/app/*` erin?
- Canonical URLs op elke pagina?
- Structured data: `GymOrHealthClub` aanwezig en valide? Test via `https://search.google.com/test/rich-results?url=https%3A%2F%2Fwww.themovementclub.nl`. Rapporteer wat erin zit en wat eruit moet/in moet.
- Open Graph + Twitter Card per pagina? Per route checken. OG-image bestaat (1200×630), absolute URL, niet 404?
- Image `alt`-text scan: hoeveel images hebben betekenisvolle alt-text vs leeg vs decoratief?
- Page titles + meta descriptions per route — match ze de spec in CLAUDE.md sectie "SEO metadata per page"?
- Heading-hiërarchie: één `h1` per pagina, logische `h2`/`h3` opbouw, geen overgeslagen niveaus?
- Internal linking: wordt elk lead-magnet/aanbod-element vanuit minstens 1 andere pagina gelinkt?
- Redirects + canonicalization: `themovementclub.nl` → `www.themovementclub.nl` (of v.v.) consistent? `http` → `https` 301? Trailing-slash policy consistent (Next.js default = no slash)? `curl -IL` op `/`, `/aanbod`, `/aanbod/` om de redirect-keten te zien.
- **Image optimalisatie (Next.js):** worden hero/above-the-fold images via `next/image` met `priority` geladen? Hebben alle `<Image>`-instanties een `sizes`-attribuut waar de breedte non-vast is? AVIF/WebP geserveerd (controleer `Content-Type` in devtools)?
- **Sanity ISR-webhook:** is er een revalidate-route (bv. `/api/revalidate`) en is in Sanity (project `hn9lkvte`) een webhook geconfigureerd die hem aanspreekt? Test door een veld in Studio te wijzigen en publiceren — verschijnt het binnen 5-10s op de live site? Als geen revalidate-keten bestaat: bevinding.
- **Core Web Vitals (mobile + desktop):**
  ```
  npx lighthouse https://www.themovementclub.nl \
    --form-factor=mobile --throttling.cpuSlowdownMultiplier=4 \
    --quiet --output=json --output-path=/tmp/lh-mobile-home.json
  npx lighthouse https://www.themovementclub.nl/aanbod \
    --form-factor=mobile --quiet --output=json --output-path=/tmp/lh-mobile-aanbod.json
  ```
  Voer **alle vier** categorieën uit (performance, accessibility, best-practices, SEO — geen `--only-categories`). Trek per route uit:
  - Performance: LCP (target <2.5s), CLS (<0.1), INP (<200ms), TBT, Speed Index, Total Bytes
  - Accessibility score (target ≥95)
  - Best practices score (target ≥95)
  - SEO score (target =100)
  Vergelijk tegen budgets in CLAUDE.md "Polish" sectie. Elke afwijking is een bevinding met file:line waar de kosten zitten (zwaar component, ongeoptimaliseerde image, render-blocking CSS, etc.).
- **Vercel Speed Insights / Analytics actief?** `@vercel/speed-insights` zit in `package.json` — verifieer in productie HTML of de Speed-Insights script-tag wordt geserveerd. Vercel Analytics auto-injectie aan?

**Local SEO:**
- NAP (Name/Address/Phone) consistent op homepage, contact, footer, structured data?
- Plaatsnamen "Loosdrecht" en "Wijdemeren" in copy verwerkt op meerdere pagina's?
- Google Business Profile bestaat? (geef antwoord o.b.v. zoekopdracht "the movement club loosdrecht" + Google Maps check)
- Komt het correcte adres terug in structured data + footer + contactpagina (`Industrieweg 14P, 1231 MX Loosdrecht`)?

**Content-SEO:**
- Welke long-tail queries zou deze site moeten ranken voor (boutique gym loosdrecht, mobility training wijdemeren, personal trainer loosdrecht vrouw, etc.)? Maak een lijst van **8-12 queries** en zeg per query: heeft de site daar nu een pagina voor of niet?
- Welke pagina's missen voor SEO-redenen? (bv. een "Personal training" pagina die expliciet op die zoekterm rankt, los van het algemene `/aanbod`)
- Is er een blog actief, of staat het schema er wel maar zijn er geen posts? (CLAUDE.md heeft `blogPost` schema)

**GSC-data analyse** (alleen als `docs/audit/data/gsc/_meta.json` bestaat — anders skip met notitie):
- Lees `_meta.json` voor `fetched_at` en zet die datum in het rapport.
- Top 20 queries (uit `queries-90d.json`): clicks, impressions, CTR, avg position. Welke vallen op door hoge impressies + lage CTR (<2%)? Dat zijn title/meta optimalisatie-kansen.
- Queries op positie 8-20 met >50 impressies/90d: hier kan content-tweak rankings naar top 5 brengen. Lijst er max 10.
- Pages-data (`pages-90d.json`): welke pagina's krijgen 0 impressies? Mogelijk orphan / niet geïndexeerd. Cross-check met `sitemap.xml` — staat hij erin?
- Lead-magnet routes (`/beweeg-beter`, `/mobility-reset`, `/mobility-check`) als ze in de data voorkomen: krijgen ze al impressies? Welke queries triggeren ze?
- Branded vs non-branded split: groepeer queries op `themovementclub|movement club|marlon` → vergelijk volume tegen non-branded long-tail (`mobility loosdrecht` etc.). Hoge branded-share = de site wordt al gevonden door wie 'm zoekt, maar acquisitie via SEO werkt nog niet — kritische bevinding voor groei.
- Vergelijk de **8-12 voorspelde long-tail queries** uit het vorige punt tegen de werkelijke top 50 in GSC. Welke voorspelde queries krijgen al traffic? Welke zijn pure aannames die in de data nergens opduiken?
- Sitemap status (`sitemaps.json`): is er een ingediende sitemap, wanneer voor het laatst gefetched, errors-aantal, indexed-aantal?
- Device-split (`device-90d.json`) en country-split (`country-90d.json`): mobile vs desktop verhouding klopt voor doelgroep? Niet-NL traffic substantieel of negligible?

### 2.2 AI discoverability (AEO/GEO/LLM SEO)

Dit is een nieuwe layer naast klassiek SEO. Doel: als iemand ChatGPT, Claude, Gemini of Perplexity vraagt "waar kan ik mobility training doen in Loosdrecht?", moet The Movement Club genoemd worden, met juiste info.

**Crawler-toegang:**
- Staat in `robots.txt` toestemming voor: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-Web`, `anthropic-ai`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`?
- Of staat het juist op disallow? Beslissing: voor een lokale boutique gym wil je gevonden worden — alle AI-crawlers expliciet toestaan.
- Aanbeveling: levert de juiste regels voor `robots.txt`.

**Content-structuur voor LLMs:**
- Heeft de site een duidelijke "wie/wat/waar/wanneer/hoeveel" beantwoording in semantische HTML? Concreet: kan een LLM in één pagina-fetch antwoord vinden op:
  - Wie is The Movement Club?
  - Waar zit het?
  - Wat kost een lidmaatschap?
  - Wat zijn de openingstijden?
  - Wie is de trainer?
  - Wat is het verschil met andere studios?
  - Voor wie is het wel/niet?
- Is er een `/faq`-pagina of FAQ-sectie met `FAQPage` structured data? Dat is goud voor AEO.
- Zijn pricing tiers in **plain text** zichtbaar in de HTML (niet alleen in afbeeldingen of via JS-rendering)?
- Zijn openingstijden in plain text op de pagina én in `OpeningHoursSpecification` structured data?

**Structured data uitbreidingen voor AI:**
- `LocalBusiness` of `GymOrHealthClub` met volledige `address`, `geo`, `telephone`, `priceRange`, `openingHoursSpecification`, `image`, `sameAs` (Instagram), `aggregateRating` als reviews aanwezig
- `Person` schema voor Marlon (founder + trainer)
- `Service` schema voor PT, Small Group, Mobility, Strength
- `FAQPage` schema voor de FAQ-sectie
- `Review` schema voor testimonials
- `BreadcrumbList` per pagina

Audit elk van bovenstaande: aanwezig/incomplete/afwezig. Geef per ontbrekend schema een minimaal voorbeeld dat wij straks kunnen implementeren.

**llms.txt (optioneel maar relevant):**
- Bestaat `https://www.themovementclub.nl/llms.txt`? Dit is een opkomend standaardje (zie `llmstxt.org`) waarmee je een LLM-vriendelijke sitemap kunt aanleveren met je belangrijkste content in markdown. Voor een 5-pagina marketing-site is dit overzichtelijk te realiseren. Geef advies of het de moeite is en wat erin zou staan.

**Citatie-vriendelijkheid:**
- Is er content die uniek genoeg is om geciteerd te worden door een LLM? (een kort manifest, een specifieke trainingsfilosofie, het verhaal van de oprichtster)
- Is er per pagina één duidelijke "quotable" alinea — kort genoeg om geciteerd te worden, lang genoeg om context te geven?
- Heeft Marlon een schrijfbare trainer-bio die als bron kan worden gebruikt?

**Live test:**
- Doe drie testqueries via web search en kijk of de site of een vermelding ervan opduikt in:
  - "boutique gym loosdrecht"
  - "personal trainer loosdrecht vrouw"
  - "mobility training wijdemeren"
- Rapporteer of TMC voorkomt, op welke positie, en met welke snippet.

### 2.3 UX audit volgens design system

Loop **elke publieke pagina** door. Per pagina, score op zes dimensies, met file:line of section-reference:

**a) Visuele consistentie met skill-tokens**
- Worden kleuren uit `--color-*` tokens gebruikt of zijn er hardcoded hex-waardes?
- Klopt typografie (font-family, scale, line-height) met skill?
- Klopt spacing-ritme (`--space-*` tokens)?
- Klopt radius (consistente waardes uit token-set)?
- Klopt button-hierarchie (primary/secondary/ghost zoals in skill)?

**b) Hierarchie & flow**
- Is er één duidelijke primary action per viewport?
- Klopt de scroll-narrative? (intro → reden om te blijven → bewijs → CTA)
- Werkt de pagina als losse landingspagina als iemand er via Instagram link op komt?

**c) Motion & interactie**
- Animation duration valt binnen skill-defaults (500-800ms)?
- Easing-curve consistent (cubic-bezier zoals skill voorschrijft)?
- Zijn er micro-interacties die niet aanwezig zijn maar wel zouden moeten (hover op cards, focus-ring op forms, scroll-reveal)?
- Zijn er motion-effecten die te druk of te snel zijn voor de premium boutique aesthetic?

**d) Copy-tone vs brand**
- Voldoet aan brand voice (warm, premium, zelfverzeker, geen sportschooltaal)?
- Geen em-dashes (volgens skill)?
- Geen emoji's (volgens skill)?
- Pakt elke sectie één idee, niet drie tegelijk?
- Klopt elke CTA-tekst (geen "Klik hier", wel "Ervaar de Mobility Check")?

**e) Mobile UX (test op 375px en 414px viewport)**
- Hero leesbaar zonder horizontaal scrollen?
- CTA's bereikbaar met duim (boven de fold + onderin)?
- Tap-targets minimaal 44x44 px?
- Form fields niet onder mobile keyboard verstopt?
- Navbar transitie van transparant naar solid werkt op scroll?

**f) Accessibility**
- Contrast minimum WCAG AA voor body text (4.5:1) en UI-elements (3:1)?
- Focus-rings zichtbaar op alle interactieve elementen?
- Form labels expliciet (geen alleen-placeholder labels)?
- Heading-volgorde logisch?
- Images met betekenis hebben alt-text, decoratieve images expliciet `alt=""`?
- Keyboard-only navigation werkt door hele site?
- `prefers-reduced-motion` gerespecteerd?

**g) Error states**
- 404-pagina (`not-found.tsx`) on-brand: skill-tokens, navbar/footer behouden, duidelijke "terug naar home" CTA, geen generiek Next-default scherm?
- `error.tsx` (route-level recovery) en `global-error.tsx` (root-level) aanwezig en on-brand?
- Forms tonen on-brand error-states bij netwerkfout / validatiefout (geen browser-default tooltip alleen)?
- Loading-states bij Sanity-ISR misses zichtbaar (Suspense fallback, skeleton, of stilte)?

### 2.4 Platform & supply-chain health

Korte technische sub-audit naast de drie grote. Bedoeld om regressies en stille rot te vangen die niet in SEO/UX/AI vallen.

**Vercel-platform:**
- Recente deployments groen? (gebruik `gh` of vraag Ilja `vercel ls` te draaien — niet zelf inloggen)
- `vercel.json` crons aanwezig — staan ze in de marketing-scope of in `/app/*` (member-systeem)? Marketing-audit raakt geen `/app/*`-crons aan, maar noteer wel als een cron faalt en daardoor publieke content stuk gaat (bv. een revalidate-cron).
- `next.config.ts` overrides nog effectief: `removeConsole` in productie, `optimizePackageImports` voor lucide-react/framer-motion/@react-email/components — verifieer in een productie-bundle dat barrel-imports niet zijn teruggekropen.
- Image-domains in `next.config.ts` `remotePatterns` matchen alle live image-bronnen (Sanity CDN, Supabase Storage indien relevant).

**Dependencies:**
- `npm audit --omit=dev` — kritieke en hoge severity meldingen rapporteren met versie + transitief pad
- `npm outdated` — major-version achterstanden op `next`, `react`, `sanity`, `framer-motion`, `tailwindcss` apart noemen met release-datum vs. installed
- Dead deps: dependency uit `package.json` die in geen enkel `src/`-bestand wordt geïmporteerd
- License-conflicten: scan voor non-MIT/Apache-2/BSD licenses op directe deps (relevanter voor commercieel SaaS, hier vooral sanity-check)

**Bundle-size signalen:**
- Trek uit een productie-build (`npm run build`) de top 5 grootste route-bundles. Identificeer of een marketing-pagina een onnodig zware client-bundle krijgt (bv. `framer-motion` op een pagina zonder animatie, of de Sanity Studio-bundle die per ongeluk in een marketing-route is gelekt).

Rapporteer in een eigen sectie van `08-platform-health.md`.

### 2.5 Rapporteer fase 2

Schrijf naar `docs/audit/`:
- `05-seo.md`
- `06-ai-discoverability.md`
- `07-ux-design-system.md` — een tabel per pagina met de zeven scores plus narrative
- `08-platform-health.md`

In chat: 8-10 zinnen prose voor de vier sub-audits samen, plus topvinding per sub-audit. Plus `STOP — fase 2 klaar, wacht op "go fase 3"`.

---

## Fase 3 — Synthese: het rapport (read-only, ~1 uur werk)

Schrijf één rapport dat alles samentrekt: `docs/audit/00-EXECUTIVE-REPORT.md`.

### Structuur

```md
# TMC Website Audit — Executive Report

**Datum:** [ISO]
**Scope:** marketing website themovementclub.nl
**Out of scope:** crowdfunding internals, member systeem, Sanity Studio

---

## TL;DR (5 bullets max)
[de vijf belangrijkste bevindingen, geen jargon]

## State of the site (1 pagina)
[wat staat er, wat is de gezondheid, op een schaal van rood/oranje/geel/groen per pagina]

## The Good — top 5
[korte verwijzing naar 01-the-good.md]

## The Bad — top 10 met prioriteit
[gesorteerd op impact × inverse-effort]

## The Ugly — alles, want dit moet weg
[alles uit 03-the-ugly.md, gesorteerd: blocking eerst]

## Missing — gesorteerd naar conversie-impact
[hoogste impact eerst]

## SEO opportuniteit-stack
[3 quick wins, 5 medium, 3 lange termijn]

## AI-discoverability opportuniteit-stack
[zelfde format]

## UX/design-system top fixes
[per pagina: maximale 3 aanpassingen die de grootste impact hebben]

## Voorgestelde remediation roadmap
[fase A: blockers - 1 week werk
 fase B: SEO + AI fundamenten - 1 week
 fase C: UX polish + missing pages - 2 weken
 fase D: nice-to-haves]

## Risico's & open vragen voor Ilja
[strategische beslissingen die niet door CC genomen kunnen worden:
 - Featurable widget vervangen of activeren?
 - Blog activeren of schema verwijderen?
 - llms.txt wel/niet?
 - Welke long-tail queries prioriteren?
 - Foto's: stock vergelijkbare boutique studios of moeten er nieuwe shoots komen?]

## Verwijzing
- Volledige bevindingen: `docs/audit/01..08.md`
- Inventory: `docs/audit/00-inventory.md`
```

### Regels voor het rapport

- Per bevinding altijd een concrete file/url-referentie. Geen vage beweringen.
- Per aanbeveling: verwacht impact (conversie %, LCP-ms, brand-aligning, AI-citatiekans).
- Geen lijstjes met meer dan 7 items zonder uitleg per item.
- Geen aanbevelingen zonder duidelijke "wat-waarom-hoe".
- Tone is zakelijk en direct, geen boilerplate ("over het algemeen ziet de site er goed uit, maar...").

### In chat (na schrijven van het rapport)

Geef de TL;DR (5 bullets) plus drie zinnen prose over de gezondheid van de site. Plus:

```
STOP — Fase 3 klaar.

Het rapport staat in docs/audit/00-EXECUTIVE-REPORT.md. Lees het, en geef per
sectie aan welke aanbevelingen je wilt uitvoeren in fase 4 (en in welke
volgorde). Ik raak geen code aan tot je expliciet "go fase 4 met scope X"
zegt.
```

---

## Fase 4 — Implementatie (alleen na expliciete approval per scope)

Pas in fase 4 mag je code aanraken. Strikt:

1. **Geen scope-creep.** Als de gebruiker zegt "go fase 4 met scope: SEO quick wins en placeholders", doe je alleen die. Niet en passant ook UX-fixes meenemen.
2. **Per scope: één commit-blok.** Commit-message format: `audit-fix: [scope] — [korte titel]`. Eén PR per fase 4 ronde.
3. **Geen nieuwe dependencies** zonder vooraf te vragen. Alleen wat al in `package.json` staat.
4. **Geen design-system afwijkingen.** Alle visuele wijzigingen via skill-tokens.
5. **Geen copy-wijzigingen** zonder Marlon's tekst te krijgen — als copy moet veranderen maar er is geen bron, voeg een `// COPY: confirm with Marlon` comment toe en laat de oude tekst staan.
6. **Geen analytics-event taxonomie wijzigen.** Alleen events toevoegen die al in CLAUDE.md staan.
7. **Geen Sanity-schemas wijzigen.** Als de audit zegt "deze tekst hoort uit Sanity te komen", connect de bestaande schema in plaats van het schema uit te breiden. Schema-wijzigingen zijn een aparte beslissing.
8. **Geen wijzigingen in `/crowdfunding/*` of `/app/*` of `/studio/*`.**
9. **Geen wijzigingen in branch `pr3e-wip-slim-bookings-status` of andere WIP-branches.** Audit-fixes gaan op een nieuwe branch, gebaseerd op `main`.
10. **Verifieer per fix:** `npm run typecheck && npm run lint && npm run build` moet groen zijn voor je commit.

### Na elke fase 4-ronde

Schrijf een changelog naar `docs/audit/CHANGELOG-fase4.md` waarin staat:
- Welke bevindingen uit het rapport zijn opgelost
- Welke files zijn aangeraakt
- Welke beslissingen zijn genomen en waarom
- Wat blijft openstaan

In chat: 5 regels samenvatting plus "Klaar voor de volgende ronde?".

---

## Globale spelregels (gelden in elke fase)

- **Werktaal output rapport:** Nederlands voor alle copy-gerelateerde bevindingen, technische findings mogen Engels.
- **Zoek-eerst-mentaliteit:** voor je aannames doet over wat er live staat, fetch het. Voor je aannames doet over wat in een file staat, lees het.
- **Geen aannames over de gebruiker.** Als iets niet kan zonder beslissing van Ilja: parkeer in "Risico's & open vragen", niet zelf invullen.
- **Concreet > abstract.** Een bevinding zonder file/url-referentie is geen bevinding.
- **Een rapport zonder een prioriteit is geen rapport.** Elke aanbeveling krijgt impact + effort.
- **Read-only fase 0-3.** Punt.
- **Geen destructieve externe calls.** Geen echte form-submits, geen MailerLite-subscribe, geen Mollie-payment, geen Resend/MailerSend-mail, geen Sanity-mutaties — ook niet "even testen". Statische analyse + devtools-inspectie van de payload is genoeg. Als end-to-end echt nodig is voor een conclusie: parkeer in "Risico's & open vragen" met voorstel voor staging-/schaduw-aanpak.

---

## Sanity-check op deze prompt

Voor je begint, stel deze vier vragen aan jezelf:

1. Heb ik CLAUDE.md gelezen en weet ik wat de spec zegt over staat van de site?
2. Heb ik de design-skill gevonden, of staat de fallback (repo-tokens) helder in mijn fase-0 rapport?
3. Heb ik begrepen wat NIET in scope is (crowdfunding internals, member systeem `/app/*`, Sanity Studio)?
4. Heb ik begrepen dat ik geen destructieve externe calls mag doen (geen real form-submits, geen MailerLite/Mollie/Resend/MailerSend hits)?

Als één hiervan "nee" is: stop, vraag, voor je verder gaat.

Als alle vier "ja" is: begin met fase 0.

---

## Changelog

**v1.1 — 25 april 2026**
- Fase 0.2: harde gate op design-skill + expliciete repo-fallback
- Fase 0.5: nieuwe stap — GSC-data check (`npm run audit:gsc`) of `skip GSC`; oude 0.5 hernummerd naar 0.6
- Fase 1.3: forms-dry-run beleid (geen pollutie van MailerLite/Mollie); cookie scan toegevoegd; email deliverability (DKIM/DMARC); anti-bot bescherming; 404/error pages
- Fase 1.4: extra missing-checks (`error.tsx`, `global-error.tsx`, OG image, favicon set, `Person` schema voor Marlon); drift-checks tussen `CLAUDE.md` en repo (Resend↔MailerSend, `next-sitemap`↔`sitemap.ts`, dead deps)
- Fase 2.1: Lighthouse alle vier categorieën met budgets uit CLAUDE.md; image-optimalisatie via `next/image`; redirects/canonical/trailing-slash; Sanity ISR-revalidate keten; Speed Insights wired check; **GSC-data analyse blok** (top queries, low-CTR opportunities, branded vs non-branded split, voorspelde vs werkelijke long-tail)
- Fase 2.3: zevende UX-dimensie "Error states"
- Nieuwe sub-audit 2.4 "Platform & supply-chain health" → `08-platform-health.md`; oude 2.4 hernummerd naar 2.5
- Globale spelregel: geen destructieve externe calls
- Sanity-check: vierde vraag over destructive-call-policy
- Tooling: `scripts/audit-gsc.mjs` toegevoegd, `googleapis` als devDependency, `npm run audit:gsc`, `docs/audit/data/gsc/` in `.gitignore`

**v1.0 — 25 april 2026**
- Eerste versie
