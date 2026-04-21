# CLAUDE.md — The Movement Club

Context document voor Claude Code sessies op het TMC project. Dekt de volledige website (design, pagina's, lead funnel, analytics, SEO, CMS). De crowdfunding module zelf staat in een aparte spec (`tmc-crowdfunding-module.md`), maar de analytics events voor de crowdfunding flow zijn hier wél opgenomen zodat de tracking compleet is.

---

## Project Status

- **Domein:** themovementclub.nl
- **Productie:** https://www.themovementclub.nl
- **Hosting:** Vercel
- **Repo locatie:** `~/projects/tmc`
- **GA4 Measurement ID:** `G-2VFCDM4KRZ`
- **Sanity project:** `hn9lkvte` (dataset: `production`), studio op `/studio`
- **Supabase project:** `cdkgjiotqlxnoxhfcjic.supabase.co` (alleen voor crowdfunding backers + forms)
- **Email tool:** MailerLite (`MAILERLITE_API_KEY` in env)

### Wat al gebouwd is (niet opnieuw bouwen)

- [x] Homepage (hero, filosofie, studio, trainer, aanbod, pricing, testimonials, locatie)
- [x] `/over` — verhaal, visie, studio galerij, cross-link naar hormoonprofiel.com
- [x] `/aanbod` — PT, Small Group, Mobility, Strength + FAQ
- [x] `/contact` — formulier, adres, routebeschrijving, WhatsApp
- [x] `/proefles` — aanmeldformulier, gratis & vrijblijvend
- [x] Navbar (transparant → solid on scroll) + Footer
- [x] Contact + proefles formulieren (via MailerLite + Resend)
- [x] Vercel deployment live
- [x] Sanity CMS geïnstalleerd (schemas: siteSettings, siteImages, openingHours, trainer, offering, pricingTier, testimonial, faq, blogPost)

### Wat nog gebouwd moet worden

- [ ] **Lead magnet pagina's** (`/beweeg-beter`, `/mobility-reset`, `/mobility-check`)
- [ ] **Analytics event tracking** (custom events op formulieren, CTAs, crowdfunding flow)
- [ ] **Cookie consent banner** (AVG/GDPR, Consent Mode v2)
- [ ] **GA4 script integratie** via `@next/third-parties` (als nog niet actief)
- [ ] **MailerLite automations** (PDF → 7-dagen sequence → Mobility Check CTA)
- [ ] **PDF "Beweeg Beter" guide** (design + hosting in `/public/downloads/`)
- [ ] **Homepage lead magnet integratie** (slide-in popup + footer CTA)
- [ ] **Structured data** (`GymOrHealthClub` schema in `layout.tsx`)
- [ ] **Sitemap.xml + robots.txt** (check `next-sitemap`)
- [ ] **Open Graph tags per pagina**

### Placeholders die nog ingevuld moeten worden

| Placeholder | Locatie |
|---|---|
| Telefoonnummer `+31 6 00 00 00 00` | Footer, contact, structured data |
| KvK `00000000` | Footer |
| BTW `NL000000000B01` | Footer |
| WhatsApp `wa.me/31600000000` | Navbar CTA, contact, footer |
| Featurable widget ID | Google Reviews widget op homepage |
| Foto's | Alle `/public/images/` placeholders |

---

## Brand & Positionering

- **Naam:** The Movement Club
- **Locatie:** Industrieweg 14P, 1231 MX Loosdrecht
- **Head trainer:** Marlon (vrouw, oprichtster, ook achter hormoonprofiel.com)
- **Positionering:** Luxe, besloten, boutique, max 6 per groep
- **Pijlers:** Movement / Mobility / Strength
- **Doelgroep:** 30-55 jaar, bovengemiddeld inkomen, kwaliteitsgericht
- **Tone:** Warm, premium, zelfverzekerd. Geen sportschool-taal.

### Copy richtlijnen

- **Taal:** Nederlands primair, eventueel Engelse taglines
- **Vermijd:** "Kom nu!", "Aanbieding!", "Gainz", "No pain no gain"
- **Gebruik:** "Ontdek", "Ervaar", "Jouw traject", "Persoonlijk", "Op maat"
- **Lengte:** Kort en krachtig — liever één sterke zin dan een alinea
- **NAP consistent:** zelfde adres/telefoon op elke pagina (voor local SEO)

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router, TypeScript)
- **Styling:** Tailwind CSS 4
- **Animaties:** Framer Motion
- **Hosting:** Vercel (auto-deploy via GitHub)
- **CMS:** Sanity (project `hn9lkvte`, studio op `/studio`)
- **Email:** MailerLite (forms + automations)
- **Forms backend:** Resend voor transactionele emails (indien van toepassing)
- **Analytics:** GA4 + Vercel Analytics
- **Taal:** Nederlands

### File Structure

```
~/projects/tmc/
  src/
    app/
      layout.tsx           -- GA4 + structured data + consent
      page.tsx             -- Homepage
      over/page.tsx
      aanbod/page.tsx
      contact/page.tsx
      proefles/page.tsx
      beweeg-beter/page.tsx     -- NIEUW
      mobility-reset/page.tsx   -- NIEUW
      mobility-check/page.tsx   -- NIEUW
      crowdfunding/
        page.tsx                 -- uit crowdfunding spec
        bedankt/page.tsx         -- uit crowdfunding spec
      studio/[[...tool]]/page.tsx  -- Sanity Studio
      api/
        contact/route.ts
        proefles/route.ts
        leads/route.ts        -- MailerLite subscribe endpoint
    components/
      ui/
      layout/         -- Navbar, Footer, CookieBanner
      blocks/         -- hero, sections
      forms/          -- ContactForm, ProeflesForm, LeadMagnetForm
    lib/
      constants.ts    -- Site-wide teksten, contactgegevens
      metadata.ts     -- SEO defaults
      analytics.ts    -- GA4 event helpers (zie Analytics sectie)
      sanity.ts       -- Sanity client
      mailerlite.ts   -- MailerLite API wrapper
    styles/
      globals.css
  public/
    downloads/
      beweeg-beter-guide.pdf
    images/
  sanity/
    schemas/
  CLAUDE.md          -- dit bestand
```

---

## Design System

### Kleurenpalet

- **Primair:** Donker (near-black `#0B0B0B` achtergrond)
- **Accent:** Warm goud (`#C9A86B` voor CTA's, highlights, progress)
- **Tekst op donker:** Off-white (`#F5F2EC`)
- **Secundair donker:** `#1A1814` voor cards/sections
- **Subtle borders:** `#2A2622`

### Typografie

- **Display/headings:** Playfair Display (serif, premium)
- **Body:** DM Sans (sans-serif, clean)
- **Géén:** Inter, Roboto, Arial — te generiek

### Framer Motion patronen

- Page load: staggered fade-in van secties
- Hero: subtle letter-by-letter reveal op tagline
- Section entries: `whileInView` fade + translate-Y
- Cards: hover lift (`y: -4`, subtle shadow groei)
- CTA buttons: scale op hover (1.02), tap (0.98)
- Menu mobiel: slide-in vanuit rechts

### Responsive Breakpoints

```
sm:  640px   -- Mobiel landscape
md:  768px   -- Tablet
lg:  1024px  -- Desktop
xl:  1280px  -- Wide desktop
2xl: 1536px  -- Ultra-wide
```

### Referentie sites (voor inspiratie, niet kopiëren)

- equinox.com
- barrys.com
- thewell.com
- sohohouse.com

---

## Lead Magnet Funnel

Drie lead magnets die als funnel werken: PDF (laagste drempel) → 7-dagen email sequence → gratis Mobility Check in de studio.

### 1. PDF "Beweeg Beter" Guide

**Landing:** `/beweeg-beter` (standalone voor ads/social traffic, geen navbar voor focus)
**Homepage integratie:** slide-in popup vanuit rechtsonder na 30s OF 50% scroll + footer CTA

**Inhoud PDF (ontwerp apart, host in `/public/downloads/beweeg-beter-guide.pdf`):**
1. Cover (branded)
2. Intro van Marlon (foto + persoonlijke noot)
3. Waarom mobiliteit de basis is
4. Oefening 1: Hip 90/90 Stretch
5. Oefening 2: Dead Hang
6. Oefening 3: World's Greatest Stretch
7. Oefening 4: Goblet Squat Hold
8. Oefening 5: Thoracic Rotation
9. Hoe je deze routine inbouwt (ochtend, 10 min)
10. CTA pagina: "Klaar voor de volgende stap? Boek je gratis Mobility Check"

Per oefening: foto/illustratie, 3-4 zinnen uitleg, sets/duur, "let op" tip.

**Form fields:** Voornaam + Email
**Na submit:** PDF direct als download + bevestigingsmail + tag "PDF Lead" in MailerLite

### 2. 7-Dagen Mobility Reset (Email Sequence)

**Landing:** `/mobility-reset` (standalone opt-in OF auto-trigger 1 dag na PDF download)
**Format:** 7 emails, 1 per dag, elke mail met korte video (2-3 min, YouTube unlisted) + tekst

| Dag | Onderwerp | Thema |
|---|---|---|
| 0 | Je Mobility Reset start morgen | Welkom, intro Marlon |
| 1 | Maak je heupen los | Hip CARs, 90/90, pigeon |
| 2 | Open je schouders | Shoulder CARs, thoracic rotation, wall slides |
| 3 | De basis die iedereen vergeet | Diafragmatisch ademen, dead bug |
| 4 | Je fundament | Enkel mobiliteit, teen spreiding |
| 5 | Alles samenvoegen | Full body flow |
| 6 | Mobiliteit + kracht = resultaat | Goblet squat, RDL, push-up |
| 7 | Dit was nog maar het begin | Recap + CTA naar `/mobility-check` |

**Form fields:** Voornaam + Email
**Trigger:** direct na PDF download OF standalone opt-in
**MailerLite tag:** "Mobility Reset"
**Dag 9 follow-up:** als niet geklikt op CTA dag 7, stuur "Heb je vragen?"

### 3. Gratis Mobility Check (Fysieke Assessment)

**Landing:** `/mobility-check` (hoogste waarde lead magnet, vervangt functioneel `/proefles` voor nieuwe traffic)
**Format:** 20-30 min 1-op-1 met Marlon in de studio, resultaat = persoonlijk Mobility Profiel (digitaal per email)

**Form fields:** Voornaam, Achternaam, Email, Telefoon, Voorkeursdag, Bericht (optioneel)
**Na submit:** email naar Marlon + auto-reply "Bedankt! Marlon neemt binnen 24 uur contact op"
**MailerLite tag:** "Mobility Check Lead"
**Follow-up (niet lid na 7 dagen):** "Hoe gaat het met de oefeningen uit je profiel?"

### Primaire CTA's per pagina

| Pagina | Primaire CTA | Secundaire CTA |
|---|---|---|
| Homepage hero | Boek je Mobility Check | Download Beweeg Beter guide |
| Homepage mid | Bekijk het aanbod | Start de 7-Dagen Reset |
| /over | Boek je Mobility Check | — |
| /aanbod | Boek een proefles | Download guide |
| /contact | Contactformulier | — |
| /beweeg-beter | Download PDF | — |
| /mobility-reset | Start de Reset | — |
| /mobility-check | Plan je Check | — |

---

## Email Automation (MailerLite)

### Lijsten/Tags

- `PDF Lead` — downloaded guide
- `Mobility Reset` — gestart met sequence
- `Mobility Check Lead` — aangevraagd
- `Proefles Lead` — aangevraagd
- `Contact Lead` — via contactformulier
- `Crowdfunding Backer` — betaalde crowdfunding tier (automatisch getagd via webhook)
- `Member` — bestaand lid (exclude van alle lead magnets)

### Automations

1. **PDF download** → tag "PDF Lead" → wacht 1 dag → start Mobility Reset sequence
2. **Mobility Reset dag 7** → CTA naar `/mobility-check`
3. **Mobility Reset dag 9 (geen klik)** → follow-up "Heb je vragen?"
4. **Mobility Check aanvraag** → email naar Marlon + auto-reply naar klant
5. **Mobility Check no-show na 7 dagen** → follow-up email
6. **Proefles aanvraag** → auto-reply + intern notificatie

**Env var:** `MAILERLITE_API_KEY` (al aanwezig in `.env.local`, terug te halen via `vercel env pull`)

---

## Analytics & Measurement

### GA4 Script Setup

Gebruik `@next/third-parties/google` voor optimale performance:

```bash
npm install @next/third-parties
```

In `src/app/layout.tsx`:

```tsx
import { GoogleAnalytics } from '@next/third-parties/google'

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
      <GoogleAnalytics gaId="G-2VFCDM4KRZ" />
    </html>
  )
}
```

### Cookie Consent (AVG/GDPR + Consent Mode v2)

Verplicht voor NL sinds maart 2024. GA4 mag pas laden NÁ consent.

**Tool:** custom lightweight banner (geen Cookiebot nodig bij dit volume). Implementeer in `components/layout/CookieBanner.tsx`.

```tsx
// Default state voor consent (altijd, vóór banner keuze)
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});

// Na acceptatie
gtag('consent', 'update', {
  'analytics_storage': 'granted'
});
```

Bewaar keuze in `localStorage` key `tmc-cookie-consent` (`'accepted'` | `'declined'`).

### Analytics Helper (`src/lib/analytics.ts`)

Centrale helper voor alle custom events. CC bouwt dit één keer en hergebruikt overal.

```typescript
type EventParams = {
  event_category?: string;
  event_label?: string;
  value?: number;
  [key: string]: string | number | undefined;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export const trackEvent = (eventName: string, params?: EventParams) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
};

// Lead conversion (PDF, email sequence, booking, contact)
export const trackLead = (type: string, value: number = 1) => {
  trackEvent('generate_lead', {
    event_category: 'lead_magnet',
    event_label: type,
    value,
  });
};

// CTA button clicks
export const trackCTA = (buttonText: string, page: string) => {
  trackEvent('cta_click', {
    event_category: 'engagement',
    event_label: buttonText,
    page_location: page,
  });
};

// Contact method clicks
export const trackContact = (method: 'phone' | 'whatsapp' | 'email') => {
  trackEvent(`click_${method}`, {
    event_category: 'contact',
    event_label: `${method}_click`,
  });
};

// Form started (first field interaction)
export const trackFormStart = (formName: string) => {
  trackEvent('form_start', {
    event_category: 'engagement',
    event_label: formName,
  });
};

// Outbound link clicks (Instagram, Google Maps)
export const trackOutbound = (destination: string) => {
  trackEvent('click_outbound', {
    event_category: 'navigation',
    event_label: destination,
  });
};

// Crowdfunding — tier CTA clicked, redirect naar Mollie
export const trackBeginCheckout = (tierId: string, tierName: string, value: number) => {
  trackEvent('begin_checkout', {
    event_category: 'crowdfunding',
    event_label: tierName,
    tier_id: tierId,
    value,
    currency: 'EUR',
  });
};

// Crowdfunding — betaling bevestigd op /crowdfunding/bedankt
export const trackPurchase = (params: {
  transactionId: string;
  tierId: string;
  tierName: string;
  value: number;
}) => {
  trackEvent('purchase', {
    event_category: 'crowdfunding',
    transaction_id: params.transactionId,
    tier_id: params.tierId,
    event_label: params.tierName,
    value: params.value,
    currency: 'EUR',
  });
};

// Crowdfunding — social share op bedankpagina
export const trackShare = (method: 'whatsapp' | 'instagram' | 'facebook' | 'copy') => {
  trackEvent('share', {
    event_category: 'crowdfunding',
    event_label: `share_${method}`,
    method,
  });
};
```

### Events om te tracken

**Lead events — markeren als conversies in GA4:**

| Event | Trigger | Label | Value |
|---|---|---|---|
| `generate_lead` | PDF download form submit | `pdf_beweeg_beter` | 1 |
| `generate_lead` | Mobility Reset opt-in submit | `mobility_reset_optin` | 5 |
| `generate_lead` | Mobility Check form submit | `mobility_check_booking` | 25 |
| `generate_lead` | Contact form submit | `contact_form` | 10 |
| `generate_lead` | Proefles form submit | `proefles_booking` | 20 |

**Engagement events:**

| Event | Trigger | Details |
|---|---|---|
| `cta_click` | Alle gold CTA buttons | button text + page |
| `click_phone` | Telefoon link klik | — |
| `click_whatsapp` | WhatsApp link klik | — |
| `click_email` | Email link klik | — |
| `form_start` | Eerste interactie met formulier | form name |
| `section_view` | Homepage sectie in viewport | section name (via Intersection Observer) |
| `click_outbound` | Instagram / Google Maps link | destination |

**Crowdfunding events — markeren als conversies (alleen `purchase`):**

| Event | Trigger | Label/Params |
|---|---|---|
| `page_view` | `/crowdfunding` page load | auto via GA4 |
| `view_item_list` | Tier grid komt in viewport | `item_list_name: 'crowdfunding_tiers'` |
| `select_item` | Tier card click (niet CTA) | `tier_id`, `tier_name` |
| `begin_checkout` | Tier "Kies deze tier" CTA click | `tier_id`, `tier_name`, `value`, `currency: 'EUR'` |
| `purchase` | `/crowdfunding/bedankt` na Mollie webhook succes | `transaction_id` (Mollie payment ID), `tier_id`, `value`, `currency: 'EUR'` |
| `share` | Social share buttons op bedankpagina | `method: whatsapp/instagram/facebook/copy` |

**Implementatie hints voor crowdfunding purchase event:**
- Vuur `purchase` alleen op de bedankpagina, niet in de webhook (die draait server-side, geen GA toegang)
- Geef transaction details mee via URL params of server component props vanuit Supabase lookup op Mollie payment ID
- Voorkom dubbel-vuren bij page refresh: check `sessionStorage.getItem('purchase_fired_' + transactionId)` en zet na vuur

### Enhanced Measurement (GA4 Admin)

Activeer in GA4 → Admin → Data Streams → Web → Enhanced Measurement:

- [x] Page views
- [x] Scrolls (25/50/75/90%)
- [x] Outbound clicks
- [x] File downloads (vangt PDF download automatisch)

### Conversies markeren in GA4

Ga naar GA4 → Admin → Events → markeer als conversion:
- `generate_lead`
- `purchase`

### UTM Naming Convention

Gebruik consistent voor alle campagnes:

```
utm_source   = kanaal        (instagram, facebook, email, flyer, whatsapp, google)
utm_medium   = type          (social, email, print, cpc, referral)
utm_campaign = campagne naam (crowdfunding_launch, mobility_reset, beweeg_beter_ad)
utm_content  = variant       (story_v1, post_v2, bannerA)
```

Voorbeelden:
```
?utm_source=instagram&utm_medium=social&utm_campaign=crowdfunding_launch&utm_content=story_v1
?utm_source=mailerlite&utm_medium=email&utm_campaign=mobility_reset&utm_content=day7_cta
```

Bewaar UTM's in `sessionStorage` bij eerste pageview zodat ze later meegestuurd kunnen worden bij form submits (attribution over meerdere pageviews).

### KPI Framework (maandelijks rapporteren)

**Primair:**

| KPI | Doel | Bron |
|---|---|---|
| Mobility Check aanvragen | 10+/maand | `generate_lead` (mobility_check_booking) |
| PDF downloads | 50+/maand | `generate_lead` (pdf_beweeg_beter) |
| Mobility Reset opt-ins | 30+/maand | `generate_lead` (mobility_reset_optin) |
| Contactformulier submits | 5+/maand | `generate_lead` (contact_form) |
| Conversieratio bezoeker → lead | >5% | Berekend |

**Secundair:**

| KPI | Doel | Bron |
|---|---|---|
| Unieke bezoekers/maand | Groeiend | GA4 |
| Gem. sessieduur | >2 min | GA4 |
| Bounce rate homepage | <50% | GA4 |
| Pagina's per sessie | >2.5 | GA4 |
| `/mobility-check` conversieratio | >15% | GA4 funnel |
| `/beweeg-beter` conversieratio | >25% | GA4 funnel |
| Email open rate (Reset sequence) | >50% | MailerLite |
| Email click rate dag 7 CTA | >10% | MailerLite |

**Crowdfunding specifiek (tijdens campagne):**

| KPI | Bron |
|---|---|
| `/crowdfunding` unieke pageviews per kanaal | GA4 + UTM |
| Checkout conversion (begin_checkout → purchase) | GA4 funnel |
| Gem. orderwaarde per tier | GA4 `purchase` event |
| Top traffic source voor `purchase` events | GA4 attribution |

### Vercel Analytics (aanvullend)

Naast GA4, activeer Vercel Analytics voor:
- Core Web Vitals (LCP, CLS, INP)
- Real User Monitoring
- Geen cookie consent nodig (privacy-friendly)
- Gratis bij Vercel Hobby plan

Auto-enabled op Vercel; optioneel `@vercel/analytics` package voor custom events.

---

## SEO

### Meta tags (per pagina in `generateMetadata`)

```
Homepage:
  title: "The Movement Club | Boutique Gym & Personal Training Loosdrecht"
  description: "Persoonlijke begeleiding door trainer Marlon in een luxe, besloten studio. Movement, Mobility en Strength op maat."

Over:
  title: "Over Marlon | The Movement Club Loosdrecht"
  description: "Ontmoet Marlon, oprichtster en head trainer van The Movement Club. Haar visie op training en waarom klein, persoonlijk en besloten werkt."

Aanbod:
  title: "Trainingsaanbod | Personal Training & Small Group | The Movement Club"
  description: "Van personal training tot mobility sessions. Ontdek ons aanbod en vind de training die bij jou past."

Contact:
  title: "Contact | The Movement Club Loosdrecht"
  description: "Neem contact op met The Movement Club. Industrieweg 14P, Loosdrecht. Boek een proefles of stel je vraag."

Beweeg Beter:
  title: "Gratis Beweeg Beter Guide | The Movement Club"
  description: "Download 5 oefeningen voor betere mobiliteit. Direct toepasbaar, uitgelegd door trainer Marlon."

Mobility Reset:
  title: "7-Dagen Mobility Reset | The Movement Club"
  description: "7 dagen, 7 video's. Beweeg vrijer, sta sterker. Gratis email programma van Marlon."

Mobility Check:
  title: "Gratis Mobility Check | The Movement Club Loosdrecht"
  description: "20 minuten, 1-op-1 met Marlon. Ontdek waar jouw bewegingspatroon beter kan. Gratis en vrijblijvend."
```

### Structured Data (in `layout.tsx`)

```tsx
const structuredData = {
  "@context": "https://schema.org",
  "@type": "GymOrHealthClub",
  "name": "The Movement Club",
  "description": "Boutique training studio in Loosdrecht. Personal training, small group sessions, mobility en strength.",
  "url": "https://www.themovementclub.nl",
  "telephone": "+31 6 00 00 00 00",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Industrieweg 14P",
    "addressLocality": "Loosdrecht",
    "postalCode": "1231 MX",
    "addressCountry": "NL"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 52.2049,
    "longitude": 5.0822
  },
  "priceRange": "€€€",
  "image": "https://www.themovementclub.nl/og-image.jpg",
  "sameAs": [
    "https://www.instagram.com/themovementclub.nl"
  ]
};
```

### Sitemap + robots

```bash
npm install next-sitemap
```

`next-sitemap.config.js`:
```js
module.exports = {
  siteUrl: 'https://www.themovementclub.nl',
  generateRobotsTxt: true,
  exclude: ['/studio', '/studio/*', '/api/*'],
};
```

### Google Search Console

- Verifieer via DNS TXT record
- Koppel aan GA4 property
- Submit sitemap: `https://www.themovementclub.nl/sitemap.xml`
- Target zoektermen: "personal training loosdrecht", "gym loosdrecht", "sportschool loosdrecht", "mobility training loosdrecht", "personal trainer wijdemeren", "boutique gym loosdrecht", "small group training loosdrecht"

### Google Business Profile

- Bedrijfsnaam: The Movement Club
- Categorie: Gym / Personal Trainer
- Adres: Industrieweg 14P, Loosdrecht
- Openingstijden (synchroon met Sanity `openingHours`)
- Foto's van de studio
- Link naar website
- "Afspraak" URL: `/mobility-check`
- 1x/week posts (updates, content)

---

## Sanity CMS (beknopt, volledige spec in `the-movement-club-sanity-cms.md`)

Marlon beheert content via Sanity Studio op `themovementclub.nl/studio`. Login met Google.

**Schema's (al aanwezig):**
- `siteSettings` — site-wide teksten, contactgegevens
- `siteImages` — hero/studio/trainer foto's
- `openingHours` — openingstijden
- `trainer` — Marlon bio, foto, socials
- `offering` — aanbod items (PT, Small Group, Mobility, Strength)
- `pricingTier` — abonnementen/tarieven
- `testimonial` — klant reviews
- `faq` — FAQ items met `page` filter (aanbod/crowdfunding/algemeen)
- `blogPost` — optioneel voor content marketing

**Render:** ISR (Incremental Static Regeneration). Publish in Sanity → webhook naar Vercel → pagina binnen 5-10s live.

**CORS origins** (sanity.io/manage):
- `https://www.themovementclub.nl` (credentials: allow)
- `https://themovementclub.nl` (credentials: allow)
- `http://localhost:3000` (credentials: allow)

---

## Environment Variables (`.env.local`)

```env
# MailerLite
MAILERLITE_API_KEY=xxx

# Sanity
NEXT_PUBLIC_SANITY_PROJECT_ID=hn9lkvte
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=xxx   # alleen voor server-side schrijf-acties

# Site
NEXT_PUBLIC_SITE_URL=https://www.themovementclub.nl
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-2VFCDM4KRZ

# (Crowdfunding module — zie aparte spec)
# MOLLIE_API_KEY
# NEXT_PUBLIC_SUPABASE_URL
# SUPABASE_SERVICE_ROLE_KEY
```

Terug te halen uit Vercel:
```bash
vercel link
vercel env pull .env.local
```

---

## Implementatie Checklist voor Claude Code

**Analytics & tracking (prioriteit 1 — blokkeert niets, levert direct data):**
- [ ] Installeer `@next/third-parties`
- [ ] GA4 in `layout.tsx` via `<GoogleAnalytics gaId="G-2VFCDM4KRZ" />`
- [ ] Cookie consent banner met Consent Mode v2 default state
- [ ] `src/lib/analytics.ts` met alle helper functies
- [ ] Event tracking op alle formulieren (`form_start` + `generate_lead`)
- [ ] Event tracking op alle gold CTA buttons (`cta_click`)
- [ ] Event tracking op footer telefoon/WhatsApp/email links
- [ ] UTM parameters opslaan in `sessionStorage` bij eerste pageview
- [ ] Section view tracking op homepage via Intersection Observer

**Crowdfunding analytics (prioriteit 2 — vóór campagne launch):**
- [ ] `begin_checkout` bij tier CTA klik (op `/crowdfunding`)
- [ ] `view_item_list` bij tier grid in viewport
- [ ] `purchase` op `/crowdfunding/bedankt` met Mollie transaction ID
- [ ] `share` events op bedankpagina social buttons
- [ ] Dedupe `purchase` fire bij refresh via sessionStorage
- [ ] GA4 Admin: markeer `generate_lead` en `purchase` als conversies

**Lead magnet pagina's:**
- [ ] `/beweeg-beter` landing + slide-in popup op homepage
- [ ] `/mobility-reset` opt-in pagina
- [ ] `/mobility-check` booking pagina
- [ ] MailerLite subscribe endpoint (`/api/leads`)
- [ ] Tags correct toekennen bij submit

**SEO:**
- [ ] Structured data (`GymOrHealthClub` schema) in `layout.tsx`
- [ ] `next-sitemap` configureren
- [ ] Open Graph tags per pagina
- [ ] Canonical URLs
- [ ] Alt-text op alle afbeeldingen

**Polish:**
- [ ] Placeholders vervangen (telefoon, KvK, BTW, WhatsApp)
- [ ] Featurable widget ID instellen voor Google Reviews
- [ ] Lighthouse audit (LCP <2.5s, CLS <0.1, INP <200ms)
- [ ] Vercel Analytics activeren

---

## Gerelateerde documenten

- `tmc-crowdfunding-module.md` — volledige spec voor `/crowdfunding` module (tiers, Mollie, Supabase schema, Sanity tier CMS). De analytics events voor die pagina's staan in dít document, in de Analytics sectie.
- `the-movement-club-sanity-cms.md` — volledige CMS migratie plan en onboarding voor Marlon.

---

*Houd dit document up-to-date bij elke grote wijziging. Gebruik als primary context in elke CC sessie op TMC.*
