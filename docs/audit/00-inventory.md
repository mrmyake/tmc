# Audit fase 0 — Inventory

**Datum:** 2026-04-25
**Scope:** marketing site `themovementclub.nl` (out: crowdfunding internals, `/app/*` member-systeem, `/studio` internals)
**Werkwijze:** read-only.

**Design-skill source:** `repo-fallback` — `the-movement-club-design` skill niet gevonden in `~/.claude/skills/` of `.claude/skills/`. Visuele oordelen vanaf fase 2 worden getoetst aan `src/app/tokens.css` + `src/app/globals.css` + `CLAUDE.md` "Design System". Elk visueel oordeel krijgt het label *"niet getoetst aan skill, alleen aan repo-tokens"*. Open vraag voor Ilja: skill aanleveren vóór fase 2, of doorgaan met repo-fallback.

**GSC-data:** geen — site nog niet aangemeld bij Search Console. GSC-analyse-blok in fase 2.1 wordt overgeslagen en gemarkeerd als "niet gedraaid (site nog niet geverifieerd)".

---

## 1. Routes gevonden (codebase)

### Marketing routes (in scope)

| Route | File | `metadata` export | Live status |
|---|---|---|---|
| `/` | `src/app/page.tsx` | ❌ ontbreekt (valt terug op `layout.tsx` defaults) | 200 |
| `/over` | `src/app/over/page.tsx` | ✅ | 200 |
| `/aanbod` | `src/app/aanbod/page.tsx` | ✅ | 200 |
| `/contact` | `src/app/contact/page.tsx` | ✅ | 200 |
| `/proefles` | `src/app/proefles/page.tsx` | ✅ | 200 |
| `/beweeg-beter` | `src/app/beweeg-beter/page.tsx` | ✅ | 200 |
| `/beweeg-beter/bedankt` | `src/app/beweeg-beter/bedankt/page.tsx` | (niet getest) | (niet getest) |
| `/mobility-reset` | `src/app/mobility-reset/page.tsx` | ✅ | 200 |
| `/mobility-reset/bedankt` | `src/app/mobility-reset/bedankt/page.tsx` | (niet getest) | (niet getest) |
| `/mobility-check` | `src/app/mobility-check/page.tsx` | ✅ | 200 |
| `/mobility-check/bedankt` | `src/app/mobility-check/bedankt/page.tsx` | (niet getest) | (niet getest) |
| `/crowdfunding` | `src/app/crowdfunding/page.tsx` | ✅ | 200 |
| `/crowdfunding/bedankt` | `src/app/crowdfunding/bedankt/page.tsx` | (niet getest) | (niet getest) |

### Marketing API-routes (in scope, nog niet end-to-end getest — geen destructieve calls in fase 0)

- `src/app/api/contact/route.ts` — gebruikt `@/lib/mailerlite` (groep-tag bij subscribe)
- `src/app/api/proefles/route.ts` — `@/lib/mailerlite`
- `src/app/api/leads/beweeg-beter/route.ts` — `@/lib/mailerlite`
- `src/app/api/leads/mobility-reset/route.ts` — `@/lib/mailerlite`
- `src/app/api/leads/mobility-check/route.ts` — `@/lib/mailerlite`
- `src/app/api/crowdfunding/checkout/route.ts` — Mollie checkout (audit beperkt: alleen interface)
- `src/app/api/crowdfunding/webhook/route.ts` — Mollie webhook + MailerLite tagging
- `src/app/api/mollie/webhook/route.ts` — (vermoedelijk legacy, naast crowdfunding/webhook — drift-kandidaat)

### Out-of-scope routes (niet auditen)

- `/app/**` — member-systeem (admin, trainer, member, abonnement, boekingen, profiel, PT, rooster, vrij-trainen)
- `/studio/[[...tool]]` — Sanity Studio
- `/checkin` — tablet check-in flow
- `/auth/callback`, `/login`, `/rooster` — auth keten + redirect
- `src/app/api/cron/*` — scheduled cron-jobs voor het member-systeem
- `src/app/api/admin/trainers/[id]/invoice` — admin

---

## 2. Componenten (top-level, in scope)

### Layout
- `Container.tsx`, `Section.tsx`, `SiteShell.tsx` — page chrome
- `Navbar.tsx` (transparent → solid on scroll volgens spec)
- `Footer.tsx`
- `CookieConsent.tsx` — banner aanwezig
- `LeadPageLayout.tsx` — minimale chrome voor lead-magnet pagina's
- `PageTransition.tsx`
- `UtmTracker.tsx` — UTM-attribution naar sessionStorage
- `AuthListener.tsx` (out-of-scope)

### Blocks (homepage + marketing)
- `Hero.tsx`, `PhilosophyGrid.tsx`, `OfferingCards.tsx`, `PricingTable.tsx`
- `StudioSection.tsx`, `TrainerSpotlight.tsx`, `TestimonialCarousel.tsx`
- `ContactSection.tsx`, `ContactForm.tsx`
- `FooterCTA.tsx`, `LeadMagnetBanner.tsx` — slide-in CTA + footer-CTA-strip
- `ScheduleTeaser.tsx`

### Blocks (crowdfunding — in scope alleen voor publieke render-audit)
- `CrowdfundingHero.tsx`, `CrowdfundingContent.tsx`, `CrowdfundingFaq.tsx`, `CrowdfundingFooterCta.tsx`
- `BackersSection.tsx`, `OfferingPills.tsx`, `ProgressPanel.tsx`, `StorySection.tsx`
- `TierGrid.tsx`, `TierCard.tsx`, `CheckoutModal.tsx`, `Confetti.tsx`, `PurchaseTracker.tsx`, `ShareButtons.tsx`

### UI primitives
- `Button.tsx`, `Card.tsx`, `Chip.tsx`, `Dialog.tsx`, `Field.tsx`, `AdminField.tsx`
- `SectionHeading.tsx`, `ScrollReveal.tsx`, `StatusBadge.tsx`
- `GoogleReviewsBadge.tsx` — Featurable / `react-google-reviews` widget
- `QuietLink.tsx`, `TrackedLink.tsx` — analytics-gewikkelde link

### Nav (member-systeem — out of scope)
- `MemberNav`, `TrainerNav`, `AdminHeader`, `AdminMobileBlock`, `AvatarDropdown`, `MobileAccountActions`, `PauzeRequestBell`

---

## 3. Live pagina's bereikbaar

Alle 9 publieke marketing-routes geven HTTP 200:
`/`, `/over`, `/aanbod`, `/contact`, `/proefles`, `/crowdfunding`, `/beweeg-beter`, `/mobility-reset`, `/mobility-check`.

**404-handling:** `https://www.themovementclub.nl/dit-bestaat-niet-404-test` → `404` (correct).

---

## 4. Live pagina's met afwijkingen

Geen 4xx/5xx of soft-200's gevonden in de marketing-set.

**Wel gesignaleerde afwijkingen (door te zetten naar fase 1):**

- **www/non-www split.** `https://themovementclub.nl/` en `http://themovementclub.nl/` redirecten allebei correct naar `https://www.themovementclub.nl/`. **Maar** alle interne SEO-signals wijzen naar non-www: `robots.txt` → `Sitemap: https://themovementclub.nl/sitemap.xml`, `<link rel="canonical">` → `https://themovementclub.nl`, OG-image URL → non-www, JSON-LD `url` → non-www, sitemap-entries → non-www. Dit verzwakt SEO en geeft een mismatch tussen geserveerde URL en gedeclareerde canonical. → fase 1.2 The Bad.
- **Trailing-slash policy is "soft 200".** `https://www.themovementclub.nl/aanbod/` → 200 (geen 308-redirect naar `/aanbod`). Volgens Next.js-default zou een redirect of 404 verwacht worden; hier serveert de site beide URLs als 200 wat een canonical-duplicate kan worden. → fase 2.1 SEO.
- **Homepage mist `metadata` export.** `src/app/page.tsx` valt terug op `layout.tsx` defaults. Title (`The Movement Club | Boutique Training Studio Loosdrecht`) en og:* worden uit de root-layout gehaald, dus livesite is niet stuk, maar er is geen pagina-specifieke description (CLAUDE.md schrijft die wél voor). → fase 1.4 Missing.

---

## 5. Configs aanwezig

| Config | Aanwezig | Notitie |
|---|---|---|
| `next.config.ts` | ✅ | Modern stack: `images.remotePatterns` voor Sanity CDN + Supabase Storage. `optimizePackageImports` voor `lucide-react`, `framer-motion`, `@react-email/components`. `removeConsole` in productie. `serverActions.bodySizeLimit: 3mb`. |
| `tsconfig.json` | ✅ | |
| `package.json` | ✅ | Next 16.2.3, React 19.2.4, Tailwind 4. |
| `tailwind.config.*` | ❌ niet aanwezig — Tailwind 4 gebruikt CSS-only `@theme` directive | OK voor Tailwind 4 |
| `next-sitemap.config.*` | ❌ niet aanwezig — repo gebruikt native `src/app/sitemap.ts` + `src/app/robots.ts` | **Drift met CLAUDE.md** dat `next-sitemap` voorschrijft |
| `src/app/sitemap.ts` | ✅ | 9 routes. **Domain non-www** (zie afwijking hierboven). |
| `src/app/robots.ts` | ✅ | `User-Agent: *` + Allow `/`. Geen disallow voor `/api/*`, `/app/*`, `/studio/*` (potentieel issue → fase 2.1). Geen expliciete AI-crawler regels (→ fase 2.2). |
| `src/lib/analytics.ts` | ✅ | `trackEvent`, `trackLead`, `trackCTA`, `trackContact`, `trackFormStart`, `trackOutbound`, `trackBeginCheckout`, `trackPurchase`, `trackShare` — matched grotendeels CLAUDE.md taxonomie (audit op call-sites in fase 1). |
| `src/lib/consent.ts` | ✅ | Consent Mode v2 helper aanwezig (`wait_for_update` zichtbaar in live HTML). Effectiviteit van consent → fase 1.3 The Ugly. |
| `src/lib/structuredData.ts` | ✅ | `getLocalBusinessSchema` (`GymOrHealthClub`) + `getWebsiteSchema`. Geen `Person` (Marlon), `FAQPage`, `Service`, `BreadcrumbList`, `Review`. → fase 2.2. |
| `src/lib/email.ts` | ✅ | Gebruikt `mailersend` SDK | **Drift met CLAUDE.md** dat Resend voorschrijft |
| `src/lib/mailerlite.ts` | ✅ | List-subscribe wrapper |
| `sanity.config.ts` | ✅ | |
| `.env.local` | (niet ingelezen — bevat secrets) | |

### Designtokens (`src/app/tokens.css`)

Volledige token-set aanwezig:
- `--font-serif-display`, `--font-sans`, `--font-mono` (mapped op `--font-playfair` / `--font-dm-sans`)
- `--space-1` t/m `--space-12` (4px → 224px ladder)
- `--radius-xs` (2px) / `--radius-sm` (4px) / `--radius-md` (8px) / `--radius-lg` (16px)
- Color-tokens, motion-tokens (niet volledig uitgelezen — fase 2.3 dieper)

Repo-fallback voor design-skill: deze tokens + `globals.css` + CLAUDE.md "Design System" zijn de single-source-of-truth voor visuele oordelen in fase 2.3.

---

## 6. Sanity datasets & schemas in repo

**Project:** `hn9lkvte` · **Dataset:** `production` · **Studio:** `/studio` (out of scope)

**Schemas fysiek aanwezig** (in `sanity/schemas/`):
- `siteSettings`, `siteImages`, `openingHours`
- `trainer`, `offering`, `pricingTier`, `faq`
- `crowdfundingSettings`, `crowdfundingTier`

**Schemas geregistreerd** (in `sanity/schemas/index.ts`):
- Alle 9 hierboven.

**Schemas in CLAUDE.md genoemd maar NIET in repo** (drift):
- `testimonial` — comment in `index.ts` legt uit: niet meer geregistreerd, homepage toont Google Reviews via `react-google-reviews`. → drift met CLAUDE.md, intentioneel volgens code-comment.
- `blogPost` — comment legt uit: geen `/blog`-pagina gebouwd, dus schema verwijderd. → drift met CLAUDE.md, intentioneel.

**Sanity helpers:** `sanity/lib/client.ts`, `sanity/lib/fetch.ts`, `sanity/lib/queries.ts`, `sanity/seed.ts`.

---

## 7. Public assets

```
public/
  downloads/beweeg-beter-guide.pdf       ← lead-magnet PDF aanwezig
  file.svg, globe.svg, next.svg, vercel.svg, window.svg   ← Next-default placeholders, niet gebruikt door eigen code
  (geen public/images/ folder)
```

**Gevolg (door te zetten naar fase 1):**
- JSON-LD verwijst naar `https://themovementclub.nl/images/hero/studio.jpg` — dat **bestaat niet** in het repo. Live HTTP-check is door te zetten naar fase 1.3 (kapotte image-URL in structured data).
- OG-default verwijst naar `https://themovementclub.nl/images/og-default.jpg` — ook niet in repo. → fase 1.3 The Ugly.
- Geen `apple-touch-icon`, geen `manifest.json`, geen `theme-color` op homepage. Wel `favicon.ico`. → fase 1.4 Missing.

---

## 8. Foundationele audit-signals (vooruitwijzingen voor fase 1-2)

| Signaal | Status |
|---|---|
| GA4 (`G-2VFCDM4KRZ`) script-tag in HTML | ✅ via `@next/third-parties/google` in `layout.tsx:160` |
| Cookie consent banner | ✅ component aanwezig + `wait_for_update` in HTML — effectiviteit te valideren in fase 1.3 (blokkeert GA4 vóór consent?) |
| Structured data `GymOrHealthClub` op homepage | ✅ aanwezig; bevat placeholder phone `+31 6 00 00 00 00` en kapotte image-URL → fase 1.3 |
| Open Graph + Twitter Card | ✅ op homepage; per-page validatie in fase 2.1 |
| `metadataBase` in root layout | ✅ `new URL("https://themovementclub.nl")` (non-www) |
| `<link rel="canonical">` | ✅ homepage; **maar non-www** (drift met serving-domain) |
| Vercel Speed Insights script | (`@vercel/speed-insights` in deps — render-check in fase 2.1) |
| `error.tsx` voor marketing | ❌ alleen `src/app/app/error.tsx` (member-systeem) |
| `global-error.tsx` | ❌ niet aanwezig |
| `not-found.tsx` (marketing) | ✅ `src/app/not-found.tsx` |
| `loading.tsx` voor marketing | ❌ alleen onder `/app/*` |

---

## 9. Discrepanties tussen CLAUDE.md status en werkelijkheid

CLAUDE.md "Wat nog gebouwd moet worden" lijst is op meerdere punten **achterhaald** — het meeste werk is gedaan. Belangrijkste discrepanties:

| CLAUDE.md zegt | Werkelijkheid |
|---|---|
| Lead magnet pagina's `/beweeg-beter`, `/mobility-reset`, `/mobility-check` nog te bouwen | ✅ alledrie bestaan en geven HTTP 200 (incl. `/bedankt`-varianten) |
| Analytics event tracking nog te bouwen | ✅ `src/lib/analytics.ts` bestaat met de volledige event-helper-set |
| Cookie consent banner nog te bouwen | ✅ `CookieConsent.tsx` aanwezig, Consent Mode v2 in HTML zichtbaar |
| GA4 script integratie via `@next/third-parties` | ✅ `@next/third-parties` geïnstalleerd, `<GoogleAnalytics>` in `layout.tsx` |
| MailerLite automations | (niet zichtbaar in code — dit is config in MailerLite-account, audit in fase 1 op API-call structure) |
| Beweeg Beter PDF | ✅ `public/downloads/beweeg-beter-guide.pdf` aanwezig |
| Homepage lead magnet integratie (slide-in popup + footer CTA) | ✅ `LeadMagnetBanner.tsx` + `FooterCTA.tsx` bestaan — render-validatie in fase 1.1/2.3 |
| Structured data `GymOrHealthClub` | ✅ in `layout.tsx` via `src/lib/structuredData.ts` (met placeholder + dead image) |
| Sitemap.xml + robots.txt via `next-sitemap` | ⚠️ **drift**: native `src/app/sitemap.ts` + `src/app/robots.ts` |
| Open Graph tags per pagina | ✅ op homepage via root layout — per-page in fase 2.1 |
| Placeholders vervangen (telefoon, KvK, BTW, WhatsApp) | ❌ nog steeds hardcoded in `src/lib/constants.ts:7-19`, lekt naar live HTML + structured data |
| Featurable widget ID | (niet onderzocht in fase 0 — fase 1) |
| Foto's i.p.v. placeholders | ❌ `public/images/` is leeg; structured data + OG-image zijn 404's |

**Drift-checks tussen CLAUDE.md en repo:**
1. **Email-backend.** CLAUDE.md noemt "Resend voor transactionele emails (indien van toepassing)". `package.json` heeft `mailersend@^2.8.0`, geen `resend`. `src/lib/email.ts` importeert uit `mailersend`. → CLAUDE.md is achter, of er is een eerdere keuze omgegooid.
2. **Sitemap-tooling.** CLAUDE.md schrijft `next-sitemap` voor. Repo gebruikt native Next.js `sitemap.ts`. CLAUDE.md update aanbevolen, of (minder aannemelijk) terug naar `next-sitemap` als er ooit reden voor was.
3. **Sanity schemas `testimonial` en `blogPost`.** CLAUDE.md noemt ze als "al aanwezig". Werkelijkheid: bewust niet meer geregistreerd, met code-comment in `sanity/schemas/index.ts:11-19` die de reden uitlegt. CLAUDE.md update aanbevolen.
4. **Crowdfunding webhook-routes.** Er zijn twee webhook-routes: `src/app/api/crowdfunding/webhook/route.ts` en `src/app/api/mollie/webhook/route.ts`. Mogelijk legacy + actief naast elkaar. → fase 1.4 onderzoeken (welke is de actieve, draait er één voor niets?).
5. **Domain canonicalization.** Spec en code zeggen `https://www.themovementclub.nl` als productie-URL, maar `metadataBase`, `SITE.url`, `sitemap`, `robots.txt` referencen allemaal `https://themovementclub.nl`. Vercel doet de redirect, maar interne signals zijn niet alligned. → fase 1.2 The Bad.

---

## 10. Open vragen voor Ilja (vóór fase 1)

1. **Design-skill:** lever je `the-movement-club-design` aan vóór fase 2.3, of doorgaan met repo-tokens als single-source-of-truth? (Aanbeveling: doorgaan met repo-fallback — `tokens.css` is gestructureerd genoeg om visuele drift te detecteren.)
2. **Twee Mollie-webhooks** (`/api/crowdfunding/webhook` vs `/api/mollie/webhook`) — bewust naast elkaar of legacy? Beïnvloedt fase 1.4 missing-rapport.
3. **MailerLite automations** — kan ik in MailerLite-dashboard meekijken (read-only) om de automations te valideren, of laat ik die als "niet geverifieerd, alleen API-call structure"?
