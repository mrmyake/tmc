# Performance Audit Report

**Date:** 2026-04-23
**Baseline Lighthouse (mobile):** Performance 72 · LCP 6.0s · FCP 2.3s · TBT 60ms

---

## 1. Executive summary

1. **Fonts load twice — van `fonts.gstatic.com` via een raw `@font-face` in `src/app/tokens.css`, en via `next/font/google` in `src/app/layout.tsx`.** De tokens.css regel registreert `"Fraunces"` / `"Inter"` families waar het design-system aan refereert (`var(--font-serif-display)` en `var(--font-sans)`), dus de self-gehoste next/font versie wordt effectief genegeerd. Dit verklaart het 377ms gstatic-request én de LCP render-delay op alle serif-koppen. **Dubbele payload, blocking render.**
2. **`Fraunces({ axes: ["opsz", "SOFT"] })` zonder `weight`-pinning** pakt de volledige multi-axis variable font — opsz 9-144, SOFT 0-100, weight 100-900. Dat is 100-150 KiB waar 25 KiB voldoende is voor onze 400+ use-case.
3. **Manuele `<link rel="preconnect" href="https://fonts.gstatic.com">` in `src/app/layout.tsx:98`** houdt een connectie open naar een host die post-fix niets meer moet serveren. Preconnect bij "unused origin" draagt 100-300ms wasted connection overhead.
4. **Geen `experimental.optimizePackageImports`** in `next.config.ts` — `lucide-react` (20+ files) en `framer-motion` laden niet optimaal per icon/export. Geschatte besparing: 15-30 KiB gzipped.
5. **Geen `browserslist` config** in `package.json` of `.browserslistrc`. Next's default target (~0.3% coverage) sleept ~14 KiB legacy polyfills mee die in 2026-browsers overbodig zijn.

---

## 2. Image issues

### 2.1 Inventory

| File:Line | Purpose | `sizes` | Rendered (mobile/tablet/desktop) | Source | `priority`? | Issue |
|---|---|---|---|---|---|---|
| `src/components/blocks/Hero.tsx:71` | Homepage LCP hero | `100vw` | 412 / 768 / 1440px | Sanity srcset 640/1024/1600/1920 | `fetchPriority=high`, `loading=eager`, raw `<img>` | **OK** — responsive srcset, bewust géén `next/image` (cold optimizer = 35s LCP) |
| `src/app/page.tsx:50` | Hero preload | via `ReactDOM.preload` imageSrcSet | Matches Hero srcset | Matches Hero | `fetchPriority: "high"` | **OK** |
| `src/components/blocks/crowdfunding/CrowdfundingHero.tsx:39` | Crowdfunding LCP | fixed `width(1920)`, geen sizes/srcset | 412 / 768 / 1920 alle crossed-over | 1920w altijd | `loading=eager` | **Issue** — 1920w op mobile = ~400 KiB waste. Geen responsive srcset |
| `src/components/blocks/StudioSection.tsx:30` | Studio sectie | `(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw` | 412 / 768 / 720 | Sanity 960×720 via next/image | nee | Minor: eerste twee breakpoints overlappen → `(max-width: 1024px) 100vw, 50vw` |
| `src/components/blocks/TrainerSpotlight.tsx:74` | Trainer foto | `(max-width: 1024px) 100vw, 600px` | 412 / 768 / ~600px | Sanity via next/image | nee | **OK** |
| `src/components/blocks/OfferingCards.tsx:35` | Offering-card foto | `(max-width: 768px) 100vw, 50vw` | 412 / 384 / 720 | Sanity 960×600 via next/image | nee | **OK** |
| `src/app/over/OverContent.tsx:43` | Marlon foto | `(max-width: 1024px) 100vw, 50vw` | 412 / 768 / 720 | Sanity 1200×900 | nee | **OK** |
| `src/app/over/OverContent.tsx:162` | Galerij tile | `(max-width: 768px) 50vw, 33vw` | 206 / 384 / 480 | Sanity 800×800 | nee | **OK** |
| `src/app/over/OverContent.tsx:234` | Hormoonprofiel | `(max-width: 1024px) 100vw, 50vw` | 412 / 768 / 720 | Sanity 1200×900 | nee | **OK** |
| `src/app/aanbod/AanbodContent.tsx:149` | Aanbod tegel | `(max-width: 1024px) 100vw, 50vw` | 412 / 768 / 720 | Sanity 1200×900 | nee | Eerste card is LCP op /aanbod maar mist `priority` |
| `src/app/beweeg-beter/BeweegBeterContent.tsx:72` | Lead-magnet cover | `(max-width: 1024px) 100vw, 50vw` | 412 / 768 / 720 | Sanity 900×1200 (3:4) | nee | **OK** |
| `src/app/mobility-reset/MobilityResetContent.tsx:88` | Video thumb | `(max-width: 1024px) 100vw, 50vw` | 412 / 768 / 720 | Sanity 1280×720 | nee | **OK** |
| `src/app/app/profiel/AvatarUpload.tsx:45` | Eigen avatar | `112px` | 112 | Supabase Storage | nee | **OK** |
| `src/app/app/_shared/attendance/AvatarBubble.tsx:33` | Lijst avatar | `${size}px` (inline) | variable (32-40) | Supabase | nee | **OK** |

### 2.2 Recommendations

**Hoog**: `CrowdfundingHero.tsx` krijgt dezelfde `buildSources()` helper als `Hero.tsx` — responsive srcset in plaats van vaste 1920w. **Estimated save on mobile: ~350 KiB.**

**Laag**: `/aanbod` eerste image krijgt `priority={true}` zodat Next `fetchpriority=high` zet. **Estimated save: ~200ms LCP.**

**Cosmetisch**: `StudioSection` sizes-attribute collapse eerste twee branches.

Alle Sanity-URLs erven al `auto=format&q=75` via central `urlFor()` default — AVIF op ondersteunende browsers.

---

## 3. Font issues

### 3.1 Current state

**`src/app/layout.tsx:15-26`** — next/font/google imports:

```ts
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  axes: ["opsz", "SOFT"],          // geen weight-pin → volledige variable
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",                 // geen weight-pin
});
```

**`src/app/tokens.css:17-34`** — raw @font-face die gstatic.com aanroept:

```css
@font-face {
  font-family: "Fraunces";
  font-weight: 200 900;
  src: url("https://fonts.gstatic.com/s/fraunces/v32/...woff2") format("woff2");
}
@font-face {
  font-family: "Inter";
  font-weight: 100 900;
  src: url("https://fonts.gstatic.com/s/inter/v19/...woff2") format("woff2");
}
```

**`src/app/tokens.css:90-92`** — design-token families resolveren naar de gstatic-families:

```css
--font-serif-display: "Fraunces", "Canela", "GT Super", ...
--font-sans:          "Inter", "Söhne", ...
```

De meeste componenten gebruiken `font-family: var(--font-sans)` of `var(--font-serif-display)`. Deze resolveren naar de literal namen `"Fraunces"` / `"Inter"` die ALLEEN geregistreerd zijn in de tokens.css @font-face → **gstatic.com is de feitelijke font-bron**, niet next/font.

De `font-[family-name:var(--font-playfair)]` Tailwind-calls (o.a. Hero H1, Navbar wordmark, alle serif-koppen) verwijzen naar next/font's hashed family → dat laadt óók. **Dubbel gebruik.**

**`src/app/layout.tsx:98-102`** — manuele preconnect naar gstatic.com:

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
```

### 3.2 Impact

- 377ms wasted connection setup tot gstatic.com
- Dubbele .woff2 download (self-hosted + gstatic)
- Fraunces variable font zonder weight-pin: ~120 KiB. Een enkele weight (400) gesubset op Latin: ~25 KiB. Savings: ~95 KiB.
- Inter idem: ~90 KiB → ~20 KiB. Savings: ~70 KiB.

### 3.3 Fix

1. Verwijder de twee `@font-face` blocks uit `tokens.css:17-34`.
2. Wijzig `tokens.css:90-92`:
   ```css
   --font-serif-display: var(--font-playfair), "Canela", "GT Super", ...
   --font-sans:          var(--font-dm-sans), "Söhne", ...
   ```
3. Verwijder `<link rel="preconnect" href="https://fonts.gstatic.com">` uit `layout.tsx:98-102`.
4. Pin weights op next/font: Fraunces `weight: ["400", "500"]` (zie CLAUDE.md: gebruik 400+), Inter `weight: ["400", "500", "600"]` + overweeg `axes` weg te halen als SOFT variatie niet door de site wordt geëxerciteerd (verder onderzoek nodig).

**Estimated LCP impact: 1.5-2.5s op mobile 4G.**

### 3.4 SOFT/opsz axes check

Grep over codebase: geen enkele component stelt `font-variation-settings` of `opsz` expliciet in, behalve tokens.css line 25 (`"opsz" 144, "SOFT" 0`). Die regel gaat verdwijnen als we @font-face verwijderen. Conclusie: axes zijn **niet gebruikt in praktijk**. Kan weg voor next/font.

---

## 4. Bundle & third-party issues

### 4.1 `next.config.ts`

Huidige config (`next.config.ts:1-22`):

```ts
const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [/* sanity + supabase */],
  },
};
```

Ontbrekend:

- `experimental.optimizePackageImports: ["lucide-react", "framer-motion", "@react-email/components"]`
- `compiler: { removeConsole: process.env.NODE_ENV === "production" }` — strips console.log in prod (onze codebase heeft ~15 console.error/warn voor telemetry, maar debug `console.log` zou weg moeten)

### 4.2 Framer-motion

Homepage-components (Hero, PhilosophyGrid, ScheduleTeaser, StudioSection, TrainerSpotlight, OfferingCards) importeren **géén** framer-motion — goed werk uit eerdere perf-ronde.

Wel motion:
- `src/components/blocks/LeadMagnetBanner.tsx:5` — dynamisch geladen via SiteShell met `ssr:false` ✅
- `src/components/blocks/crowdfunding/CrowdfundingHero.tsx:57+` — alleen op `/crowdfunding`
- `src/components/blocks/crowdfunding/CheckoutModal.tsx` — alleen op crowdfunding
- Admin + member-app shells — client-only, na auth

**Geen `LazyMotion` + `m.*` pattern in gebruik.** Overwegen voor crowdfunding hero: `<LazyMotion features={domAnimation}><m.div ... /></LazyMotion>` bespaart ~20 KiB door alleen domAnimation features te laden ipv het volledige motion-bundle. Impact: alleen `/crowdfunding` LCP.

### 4.3 `react-google-reviews` (Featurable)

- Dynamisch geladen via `src/app/page.tsx:24-28` (goede isolatie)
- Maar: **geen intersection-observer gating**. Zodra de hydration klaar is mount React de component, triggert de remote fetch (~230 KiB avatars) en bouwt de slick-carousel DOM (12,300px track, ~1,500 nodes).
- On mobile 4G: dit land 2-3 seconden na hydration, potentieel terwijl user nog in hero zit — concurrent met LCP-image fetch.

**Recommendation:** wrap in een intersection-observer die alleen mount wanneer de sectie in viewport komt. Bestaande `ScrollReveal` pattern is de juiste primitive.

### 4.4 Barrel imports

`lucide-react` is per-component geïmporteerd (`import { Bell, X } from "lucide-react"`). Sommige files importeren 8+ icons. Zonder `optimizePackageImports` kan bundler deze niet altijd individueel tree-shaken. Savings: ~10-15 KiB gzipped wanneer aangezet.

### 4.5 Browserslist / polyfills

Geen `browserslist` field in `package.json`, geen `.browserslistrc`. Next default targets te conservatief voor 2026. Toevoegen:

```json
"browserslist": [
  "> 0.5%, last 2 versions, not dead, not ie 11"
]
```

Of strikter: `Chrome >= 100, Safari >= 16, Firefox >= 100, Edge >= 100`. Savings: ~14 KiB legacy polyfills.

---

## 5. DOM & rendering issues

### 5.1 Featurable DOM

- Carousel track: 12,300px × 170px met ~15 review-items à 100 DOM nodes = 1,500 nodes alleen in de review-sectie
- Verborgen slides zijn DOM-present maar `display:none`/`aria-hidden` — tellen mee voor de total-element count
- Lighthouse flagt "Avoid an excessive DOM size" — 1,832 elements is net boven threshold (1,500)

**Recommendation:** 
- **Opt 1 (quick win):** intersection-observer gating zoals §4.3. Grote DOM pas na viewport-entry → eerste-paint niet meer belast.
- **Opt 2 (groter):** vervang Featurable door een custom carousel met max 3-5 reviews in DOM, rest via paginering. Reviews uit Google Places API (we hebben al place ID). Past beter bij het editorial karakter van de site + kleinere footprint.

### 5.2 Above-the-fold waste

`SiteShell` laadt `LeadMagnetBanner` + `CookieConsent` dynamisch met `ssr:false` — beide verschijnen eerst ná hydration. **OK.**

### 5.3 Forced reflow

Lighthouse 42ms forced reflow. `ScrollReveal` gebruikt IntersectionObserver (geen reflow). `Navbar` heeft een scroll-listener die `scrolled` state toggle't op basis van `window.scrollY` — potentieel getriggered op elke scroll event zonder `{ passive: true }`. Check of dat throttled is.

**Quick check in `src/components/layout/Navbar.tsx`:** scroll-listener gebruikt geen rAF of throttle → 42ms forced reflow matches. Fix: rAF-batched update of passive listener met throttle.

---

## 6. Prioritized action plan

### 🔴 Tier 1 — biggest LCP impact, zero-risk

| # | Task | Files | Est. impact |
|---|---|---|---|
| **A** | Strip @font-face uit tokens.css + preconnect uit layout.tsx; route design-tokens naar next/font vars | `tokens.css:17-34,90-92`, `layout.tsx:98-102` | **LCP -1.5-2.5s**, 377ms gstatic gone, ~165 KiB font weight |
| **B** | Pin `Fraunces({ weight: ["400", "500"] })` zonder axes (niet gebruikt) + `Inter({ weight: ["400", "500", "600"] })` | `layout.tsx:15-26` | Onderdeel van A: garandeert kleine payload |

### 🟠 Tier 2 — meaningful perf, kleine veranderingen

| # | Task | Files | Est. impact |
|---|---|---|---|
| **C** | Voeg `experimental.optimizePackageImports` + `compiler.removeConsole` toe aan next.config.ts | `next.config.ts` | ~15-30 KiB JS, cleanere build output |
| **D** | Browserslist in package.json | `package.json` | ~14 KiB polyfill reductie |
| **E** | CrowdfundingHero: responsive srcset via `buildSources` (copy van Hero.tsx) | `CrowdfundingHero.tsx` | ~350 KiB mobile /crowdfunding |
| **F** | `/aanbod` eerste card → `priority` | `AanbodContent.tsx` | ~200ms LCP op /aanbod |

### 🟡 Tier 3 — gedragsveranderingen, vraagt input

| # | Task | Files | Decision |
|---|---|---|---|
| **G** | Featurable gating via IntersectionObserver — mount bij scroll | `page.tsx` of nieuwe `<VisibleOnScroll>` wrapper | **Needs approval**: vertraagt review-sectie 0.5-1s na intersectie (flash visible). Alternatief: skeleton placeholder. |
| **H** | Navbar scroll-listener rAF-batchen of throttlen | `Navbar.tsx` | Veilig, kleine win (42ms TBT) |

### 🟢 Tier 4 — overwegingen, optioneel

| # | Task | Files | Trade-off |
|---|---|---|---|
| **I** | Featurable vervangen door custom reviews-carousel o.b.v. Google Places API | nieuwe component + API-integratie | **Needs approval**: grote scope, design-system win, maar eigen onderhoud. Savings: ~243 KiB, ~1500 DOM nodes. |
| **J** | LazyMotion op crowdfunding-hero | `CrowdfundingHero.tsx` | ~20 KiB op /crowdfunding; refactor van motion.* → m.* |

---

## 7. Design-system alignment check

Alle voorgestelde wijzigingen respecteren CLAUDE.md:

- **A/B (fonts):** Blijven Fraunces + Inter (identieke families aan huidig). Alleen weight-ruimte versmallen. Geen visuele drift. SOFT 0 axis is in tokens.css declared maar niet aangeroepen — eerdere snel-check: geen enkele component overschrijft `font-variation-settings`. Als na deploy een character zichtbaar anders lijkt, herstelt `font-variation-settings: "opsz" 144, "SOFT" 0` op body het terug.
- **C (bundler):** puur build-config, geen zichtbare wijziging.
- **D (browserslist):** evergreen browsers — accepterend voor 99%+ van de TMC-doelgroep (Loosdrecht, 30-55 jaar, premium doelgroep gebruikt moderne devices).
- **E (crowdfunding responsive):** matcht het Hero-patroon dat al op main-site draait. Hetzelfde editorial gedrag.
- **F (priority):** puur technisch, geen visuele impact.
- **G (Featurable gating):** reviews sectie verschijnt zoals nu maar na een 0.5-1s delay bij scrollen ernaartoe. Geen visuele regressie als we een subtle skeleton gebruiken (bg-bg-elevated, champagne-hairline).
- **I (custom reviews):** **design-system win** — huidige Featurable widget drijft weg van boutique/editorial. Custom variant kan Fraunces serif quotes + stone divide-y layout gebruiken, past bij /over testimonials aesthetic.

---

## 8. Out-of-scope / needs decision

- **G — Featurable intersection-gating**: kleine UX-impact (flash delay). Akkoord?
- **I — Featurable volledig vervangen**: grote scope. Aparte beslissing, grotere win maar meer werk.
- **J — LazyMotion refactor op /crowdfunding**: kleine win op een nu al okay pagina. Niet urgent.
- **Navbar DOM-count** (1,832 elements): niet gevonden wat de echte oorzaak is — vermoedelijk de testimonial carousel zoals genoemd. Verdere diepteduik alleen als het na Tier 1+2 niet onder 1,500 zakt.
- **Vercel Analytics + Speed Insights**: blijven staan (CLAUDE.md noemt ze). Geen actie.

---

**Einde rapport. Wacht op goedkeuring per tier voordat implementatie start.**
