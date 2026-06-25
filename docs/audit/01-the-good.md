# Audit fase 1.1 — The Good

**Datum:** 2026-05-01
**Scope:** marketing site `themovementclub.nl`
**Doel:** 5-10 concrete sterke punten met file/url-referentie + waarom-het-werkt.

---

### Wat: Design system tokens 1:1 geïmplementeerd (en zelfs uitgebreid)

**Bewijs:** `src/app/tokens.css:1-90` (volledig), `src/app/globals.css:5-49` (Tailwind theme bindings)
**Waarom het werkt:** matcht `the-movement-club-design/colors_and_type.css` byte-voor-byte op kleuren (ink/stone/champagne) en typografie. De repo voegt ook bewust toe: `--warning #CC9146` semantische kleur + `--color-ink-500..900`/`--color-stone-100..600` Tailwind utilities (clean short-form ipv `border-[color:var(--ink-500)]`). Zelf-host fonts via `next/font/google` ipv gstatic CDN — voorkomt third-party weight én privacy-leak.
**Categorie:** componentgebruik / performance

### Wat: Bewust gescheiden Mollie-webhooks (crowdfunding ↔ member-systeem)

**Bewijs:** `src/app/api/mollie/webhook/route.ts:47` (code-comment), `src/app/api/crowdfunding/webhook/route.ts`
**Waarom het werkt:** twee webhooks delen geen tabel (`crowdfunding_backers` vs `memberships`+`payments`+`pt_bookings`), geen group-tag (CROWDFUNDING_BACKER vs niets), geen recurring-flow. Mollie's `webhookUrl` wordt per-payment geset, dus elke betaling weet exact welk endpoint hij aanspreekt. Kruisbesmetting onmogelijk. Domein-scheiding ipv nieuwe code-coupling — exact wat een audit had voorgeschreven als advies, hier is het al beslist.
**Categorie:** componentgebruik

### Wat: MailerLite GROUP-IDs in code matchen live groepen exact

**Bewijs:** `src/lib/mailerlite.ts:64-69` (PDF_LEAD `184521718447998634`, MOBILITY_RESET `184521727523423599`, MOBILITY_CHECK `184521735663519061`, PROEFLES `184521743018230980`, CONTACT `184521748487603774`) ↔ live MailerLite API `/groups` response
**Waarom het werkt:** elke ID matcht naam én ID in MailerLite. Zero drift tussen code en service. Env-driven IDs (`MAILERLITE_CROWDFUNDING_BACKER_GROUP_ID`, `MAILERLITE_MEMBERS_GROUP_ID`) gebruiken `?? ""` graceful-degradation pattern: leeg = geen MailerLite-sync, code blijft werken (lib comments leggen dat ook uit). Dit is hoe je het bouwt: hardcoded IDs voor stabiele groepen, env-driven voor groepen die per omgeving kunnen verschillen.
**Categorie:** componentgebruik / lead-funnel

### Wat: CSS-only fade-up animatie ipv framer-motion above-the-fold

**Bewijs:** `src/app/globals.css:81-89` (`.tmc-fade-up` keyframe) — gebruikt door Hero, eyebrows, H1 zonder JS-hydratie
**Waarom het werkt:** skill spec zegt "easing-curves long, duration 500-800ms, cubic-bezier(0.2,0.7,0.1,1)" — keyframe gebruikt `0.8s cubic-bezier(0.2, 0.7, 0.1, 1) both` exact volgens spec. Hero paint vóór JS bundle laadt = LCP-win. Honoreert tegelijkertijd `prefers-reduced-motion` via globale rule in `globals.css:72-79`.
**Categorie:** performance / a11y

### Wat: ScrollReveal met `@media (scripting: none)` fallback

**Bewijs:** `src/app/globals.css:118-136`, `src/components/ui/ScrollReveal.tsx`
**Waarom het werkt:** progressive enhancement. Default state = hidden (`opacity: 0; translateY(20px)`), JS flipt `data-revealed="true"` via Intersection Observer. Als JS uitstaat (bots, low-end, accessibility-modus), `scripting: none` query forceert content visible. Niemand mist content door techniek. Skill-conform: 600ms duration, cubic-bezier curve, fade+12px translate.
**Categorie:** a11y / performance

### Wat: Volledige analytics-taxonomie in `lib/analytics.ts` exact volgens CLAUDE.md spec

**Bewijs:** `src/lib/analytics.ts:16-117` exporteert `trackEvent`, `trackLead`, `trackCTA`, `trackContact`, `trackFormStart`, `trackOutbound`, `trackViewItemList`, `trackSelectItem`, `trackBeginCheckout`, `trackPurchase`, `trackShare`
**Waarom het werkt:** elke event-helper komt 1:1 voor in CLAUDE.md "Analytics Helper" sectie + "Crowdfunding events" tabel. Single source of truth, gtype-veilig, geen ad-hoc `gtag('event', ...)` verspreid door de codebase. Crowdfunding-specifiek: `purchase` event includeert `currency: 'EUR'` + `transaction_id` exact zoals spec voorschrijft. (Wiring-gaps zijn een aparte bevinding in The Bad — de bibliotheek-laag is goud.)
**Categorie:** lead-funnel / componentgebruik

### Wat: Footer biedt complete cross-linking voor lead-funnel

**Bewijs:** `src/components/layout/Footer.tsx:50-78` ("Gratis starten" sectie linkt naar `/beweeg-beter`, `/mobility-reset`, `/mobility-check`; "Ook van Marlon" linkt naar hormoonprofiel.com)
**Waarom het werkt:** voldoet aan CLAUDE.md "Primaire CTA's per pagina" tabel én "Cross-link naar hormoonprofiel.com" eis op `/over`. Alle drie lead magnets zijn vindbaar zonder dat de gebruiker eerst de homepage hoeft te scrollen. Sitemap-strategie en navigatie-strategie matchen.
**Categorie:** lead-funnel / brand

### Wat: Volledig Twitter-card + OG-meta op elke marketing-pagina

**Bewijs:** `/tmp/tmc-live/{root,over,aanbod,contact,proefles,beweeg-beter,mobility-reset,mobility-check,crowdfunding}.html` — elk heeft `og:title`, `og:description`, `twitter:card="summary_large_image"`
**Waarom het werkt:** elk page heeft een eigen, niet-generieke `og:title` en `og:description` die matchen met CLAUDE.md "SEO" sectie. `og:locale="nl_NL"` consistent. (Caveat: het `og:image` URL is 404 → zie The Ugly — maar de meta-architectuur zelf is correct opgezet.)
**Categorie:** SEO

### Wat: Structured data `GymOrHealthClub` + `WebSite` + `OpeningHoursSpecification`

**Bewijs:** `/tmp/tmc-live/root.html` (JSON-LD blocks), `src/lib/structuredData.ts`
**Waarom het werkt:** matcht CLAUDE.md "Structured Data" spec inclusief `address`, `geo` (52.2049, 5.0822), `priceRange "€€€"`, `sameAs` met Instagram + hormoonprofiel.com. Plus `openingHoursSpecification` met dagen+tijden volgens Sanity `openingHours` schema. Voor lokaal SEO én AEO is dit het minimum-niveau dat Google + Claude/ChatGPT nodig hebben om correct te citeren. (Caveat: `telephone` en `image` lekken placeholders/404 — zie The Bad/Ugly.)
**Categorie:** SEO / AI-discoverability

### Wat: HSTS actief op productie met realistische TTL

**Bewijs:** `curl -sI https://www.themovementclub.nl/` → `strict-transport-security: max-age=63072000` (2 jaar)
**Waarom het werkt:** twee jaar TTL is de aanbevolen waarde voor HSTS (1 jaar = minimum, langer = sterker maar pas omkeerbaar via HSTS preload-removal). Browser onthoudt: voor 2 jaar, alleen via HTTPS, ook bij eerste hit. Combineert goed met de 307 non-www → www redirect om gemixt-content te vermijden.
**Categorie:** performance / security

### Wat: Sitemap dekt alle 9 marketing-pagina's inclusief lead magnets

**Bewijs:** `/tmp/tmc-live/sitemap.xml` (9 entries: root, over, aanbod, contact, proefles, beweeg-beter, mobility-reset, mobility-check, crowdfunding)
**Waarom het werkt:** geen orphan-pagina's. `/proefles` en `/mobility-check` hebben `priority: 0.9` (hoogste conversie-pages na home), `/crowdfunding` `changefreq: daily` (passend bij lopende campagne), de rest `monthly`. `lastmod` 2026-04-24. Member-systeem (`/app/*`) en Studio (`/studio/*`) zijn correct uitgesloten. (Caveat: `loc` URLs gebruiken non-www — zie The Bad.)
**Categorie:** SEO
