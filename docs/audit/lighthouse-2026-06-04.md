# Lighthouse-audit themovementclub.nl — 2026-06-04

Volledige audit van de live productiesite, mobiel én desktop, met Lighthouse 13
(productie, slow-4G + 4× CPU throttling op mobiel). Doel: alles naar **95+**.

> De yoga-minisite (`/yoga/*`) is nog niet gedeployed en zit niet in deze audit.
> Lokaal scoorden die pagina's al 79–83 perf / 100 SEO / 100 a11y (mobiel).

## Scores per pagina

### Desktop — vrijwel overal groen
| Pagina | Perf | A11y | BP | SEO |
|---|---|---|---|---|
| / | 98 | 100 | 100 | 100 |
| /over | 99 | 100 | 100 | 100 |
| /aanbod | 99 | 100 | 100 | 100 |
| /contact | 98 | 100 | 100 | 100 |
| /proefles | 99 | 100 | 100 | 100 |
| /beweeg-beter | 98 | 98 | 100 | 100 |
| /mobility-reset | 98 | 100 | 100 | 100 |
| /mobility-check | 99 | **91** | 100 | 100 |
| /crowdfunding | **94** | 100 | 100 | 100 |
| /rooster | 99 | 98 | 100 | **91** |

### Mobiel — performance is de bottleneck
| Pagina | Perf | A11y | BP | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| / | **65** | 100 | 100 | 100 | 6.0s | 170ms | 0 |
| /over | **76** | 100 | 100 | 100 | 6.0s | 172ms | 0 |
| /aanbod | **64** | 100 | 100 | 100 | 6.2s | 234ms | 0 |
| /contact | **79** | 100 | 100 | 100 | 5.3s | 95ms | 0 |
| /proefles | **66** | 100 | 100 | 100 | 6.4s | 169ms | 0 |
| /beweeg-beter | **81** | 98 | 100 | 100 | 4.8s | 148ms | 0 |
| /mobility-reset | **63** | 100 | 100 | 100 | 6.7s | 228ms | 0 |
| /mobility-check | **66** | **91** | 100 | 100 | 6.3s | 175ms | 0 |
| /crowdfunding | **62** | 100 | 100 | 100 | 5.9s | 307ms | 0 |
| /rooster | **78** | 98 | 100 | 100 | 5.3s | 163ms | 0 |

## Analyse

**Wat al goed is**
- **Desktop**: alles 94–99 perf, 100 a11y/bp/seo (op 3 kleine fixes na).
- **CLS = 0** overal (perfect, geen layout shift).
- **TBT** grotendeels < 250ms (oké). Geen render-blocking CSS/fonts.
- **Best Practices = 100** overal.

**De hoofdoorzaak van lage mobiele performance (LCP 5–6.7s)**
1. **Google Analytics (`gtag.js`)** — ~66 KiB **ongebruikte** JS op élke pagina, eager geladen. Grootste enkele post; ~10s aan totale besparing over alle pagina's.
2. **App-JS-chunks** (40 + 35 + 25 KiB) — bevatten o.a. de **Supabase-browserclient** (via `AuthListener` in de root-layout, op elke pagina) en **framer-motion**.
3. **Mobiele LCP ~6s** — op de hero-pagina's (`/`, `/aanbod`, `/crowdfunding`) is het hero-beeld het LCP-element; op slow-4G duurt het laden 3s+ ná FCP.

De zwaarst scorende pagina's (62–66) zijn de hero-image-pagina's; de tekst-hero-pagina's (`/over`, `/contact`, `/beweeg-beter`, `/rooster`) scoren 76–81.

**Niet-performance fixes (klein, brengen a11y/SEO naar 100)**
- **/mobility-check — a11y 91**: `heading-order` (koppen niet sequentieel h1→h2→h3) + ongeldige lijst-markup (`<li>` buiten een `<ul>/<ol>`, of lijst met niet-`<li>` kinderen).
- **/rooster — SEO 91 (desktop)**: `meta-description` ontbrak in de desktop-run (mobiel was 100). Waarschijnlijk flaky, maar verifieer dat de `description` in `generateMetadata` betrouwbaar rendert.
- **/beweeg-beter & /rooster — a11y 98**: kleine losse audit (meestal contrast of label); per pagina checken.

## Aanbevelingen om naar 95+ te komen (geprioriteerd)

### 1. Google Analytics uitstellen — grootste mobiele winst (site-breed)
`gtag.js` is ~66 KiB ongebruikt op elke pagina. Laad het pas ná interactie of bij idle in plaats van eager.
- Vervang de eager `<GoogleAnalytics>` door een **lazy loader**: injecteer gtag bij eerste user-interactie (scroll/click/keydown) of `requestIdleCallback`, ná consent.
- Alternatief: hou de consent-default inline (cookieless pings), maar stel het laden van `gtag.js` zelf uit tot interactie.
- **Verwachte winst**: mobiel TBT omlaag + ~500ms FCP/LCP per pagina; tilt de meeste pagina's richting 80→90.

### 2. Supabase-client lui laden (site-breed)
`AuthListener` trekt de Supabase-browserclient in de client-bundle op élke publieke pagina, terwijl die alleen nodig is voor ingelogde flows.
- Laad `AuthListener` via `next/dynamic(..., { ssr: false })`, of mount 'm alleen op `/app/*` en `/login`.
- **Verwachte winst**: 30–40 KiB minder JS op alle marketingpagina's.

### 3. Mobiele LCP-hero optimaliseren (hero-pagina's: /, /aanbod, /crowdfunding)
- Lever een **kleinere mobiele hero-variant** (smallere `sizes`/srcset; AVIF staat al aan via Sanity).
- Zet `priority` + `fetchPriority="high"` op precies het LCP-beeld en **preload** alleen die ene bron.
- Overweeg een lichte LQIP/blur-placeholder zodat de paint eerder telt.
- **Verwachte winst**: LCP van ~6s naar < 3s op de zwaarste pagina's → grootste sprong in perf-score.

### 4. framer-motion code-splitten
- Laad animatie-zware blokken via `dynamic()` zodat framer-motion niet in de eerste bundle van elke pagina zit (waar nu vaak alleen een fade nodig is, kan de bestaande CSS-only `ScrollReveal` volstaan).

### 5. Kleine, gerichte fixes (a11y/SEO → 100)
- **/mobility-check**: koppen sequentieel maken (geen niveau overslaan) en lijst-markup repareren (`<li>` altijd in `<ul>/<ol>`).
- **/rooster**: meta-description borgen in `generateMetadata`.
- **/beweeg-beter, /rooster**: de enkele a11y-audit per pagina nalopen (waarschijnlijk contrast/label).

## Verwachte uitkomst
- **Desktop**: na fix 1–2 + de kleine a11y/SEO-fixes → **alles 95–100**.
- **Mobiel**: fix 1 (GA) + 2 (Supabase) + 3 (LCP-hero) samen brengen de hero-pagina's van ~62–66 naar **90+**, en de tekst-pagina's (nu 76–81) ruim over **95**. Fix 4 sluit het laatste gat op de zwaarste pagina's.

## Doorgevoerde fixes (2026-06-04)

Branch `perf/lighthouse-fixes` (op `main`):

1. **Google Analytics uitgesteld** (`DeferredAnalytics`) — `gtag.js` laadt
   pas bij eerste interactie of idle i.p.v. eager. Consent Mode v2 defaults
   blijven inline in `<head>`; events queuen in `dataLayer`.
2. **Supabase-client lui geladen** — `AuthListener` importeert de
   browserclient dynamisch (code-split) en start bij idle.
3. **`/mobility-check` a11y 91 → 100** — FAQ-kop `h4`→`h3` + `<li>` als
   direct kind van `<ul>`.

**A/B (localhost, mobiel, gelijke build-omstandigheden):**

| Pagina | Voor (`main`) | Na | Δ |
|---|---|---|---|
| / | 68 · FCP 2.9s | 83 · FCP 1.1s | +15 |
| /aanbod | 64 · FCP 3.2s | 70 · FCP 2.4s | +6 |

`/rooster` SEO-91 (desktop) bleek flaky: productie heeft wél een
meta-description (mobiel was 100). Geen fix nodig.

### Bevinding over de resterende mobiele LCP (#3 herzien)

De oorspronkelijk geplande hero-**image**-optimalisatie blijkt niet van
toepassing. De `lcp-breakdown-insight` toont op **elke** pagina (incl. de
homepage) hetzelfde LCP-element: de **navbar-logo-tekst**, met
`elementRenderDelay` ~2.3–2.7s en TTFB ~120ms. De afbeeldingen zijn al
kleine AVIF (~25 KiB) en zijn niet het LCP-element. De render-delay is het
gat tussen FCP (~2.4s) en LCP — de **font-swap** + React-hydratie op
4×-getthrottelde mobiel.

Reeds geoptimaliseerd en dus géén verdere winst daar: fonts worden al
gepreload (next/font), de shell-animaties zijn CSS-only (`PageTransition`,
`Navbar`), `CookieConsent`/`LeadMagnetBanner` zijn al `dynamic`, en
framer-motion zit niet op het kritieke pad. De grootste hefbomen (GA +
Supabase) zijn met fix 1–2 weggenomen. Verdere mobiele winst vraagt diepere
hydratie-reductie met UX-risico en afnemend rendement; meet eerst opnieuw op
een productie-preview, waar deze cijfers fors hoger liggen dan localhost.

## Methode
Lighthouse 13.3, headless Chrome, mobiel (Moto-G-class, slow-4G, 4× CPU) en
desktop-preset. 10 publieke pagina's × 2 = 20 runs, sequentieel. Ruwe JSON in
`/tmp/lh-audit/`. Localhost-metingen liggen lager dan productie; dit rapport is
tegen de live site gemeten.
