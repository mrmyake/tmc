# QA Audit Report

**Date:** 2026-04-24
**Target:** production (https://www.themovementclub.nl)
**Scope:** medium — Phase 1 crawl + Phase 2 flow checks + report + fixes (géén permanente testsuite)

---

## 1. Executive summary

**Kritiek:**
- **Avatar upload faalt voor 1-3 MB files.** De UI staat 3 MB toe, server-action body-limit staat op Next's default 1 MB → elke upload >1 MB wordt door Next's runtime gedrukt voordat de action run't. User ziet een generieke foutmelding (of niks) met "Upload mislukt".
- **Consent Mode v2 is niet correct geïmplementeerd.** `<GoogleAnalytics>` wordt alleen gemount ná consent-accept. De `gtag("consent", "default", { analytics_storage: "denied", ... })` call staat in een `useEffect` die ook pas run't ná consent. gtag.js bestaat dus nooit in `denied`-state → geen cookieless pings, en de default-consent-call is een no-op.

**Hoog:**
- **Homepage crawl-load 10.8s.** Lighthouse mobile rapporteerde 88, dus dit is waarschijnlijk artefact van het crawl-protocol (domcontentloaded + assets), niet representatief voor user-experience. Niet direct acteren.

**Medium:**
- Niets kritisch qua links of assets. Zero 4xx/5xx op alle 10 gecrawlde publieke routes + alle 56 assets.

**Low / niet-bugs:**
- `/rooster` 404 uit de prompt-claim → **niet reproduceerbaar**. Returns 200, page rendert correct.
- `/pt` + `/blog` → 404, maar nergens in source naartoe gelinkt. Ghost-URLs, geen user-impact.
- Crowdfunding tiers renderen niet → `crowdfundingSettings.active === false` in Sanity. Dat is CMS-config, geen bug.
- OG image valt terug op `/images/og-default.jpg` — de Sanity `siteImages.ogImage` is nog niet geüpload.

---

## 2. Broken routes

Crawler vond **0 broken routes** op productie.

| URL | Status | Notitie |
|---|---|---|
| `/` | 200 | ok (10.8s crawl-time — zie §4) |
| `/over` | 200 | ok (4.7s) |
| `/aanbod` | 200 | ok (4.8s) |
| `/contact` | 200 | ok |
| `/proefles` | 200 | ok |
| `/beweeg-beter` | 200 | ok |
| `/mobility-reset` | 200 | ok |
| `/mobility-check` | 200 | ok |
| `/rooster` | 200 | ok — **claim was fout** |
| `/login` | 200 | ok |

Directe checks op niet-gelinkte routes:

| URL | Status | Notitie |
|---|---|---|
| `/crowdfunding` | 200 | ok |
| `/crowdfunding/bedankt` | 200 | ok |
| `/beweeg-beter/bedankt` | 200 | ok |
| `/mobility-reset/bedankt` | 200 | ok |
| `/mobility-check/bedankt` | 200 | ok |
| `/studio` | 200 | ok |
| `/auth/callback` | 200 | ok |
| `/app`, `/app/rooster`, `/app/admin` | 200 | ok (redirect naar login zonder auth) |
| `/pt` | **404** | geen page, niks linkt ernaartoe |
| `/blog` | **404** | geen page, niks linkt ernaartoe |

---

## 3. Broken assets

**0 broken assets** gevonden. Alle 56 `<img>`, `<link>`, `<script>` references resolven.

---

## 4. Flow audit

Run via `scripts/qa-flow-audit.ts` (Playwright) tegen prod. Volledige output in `docs/QA_FLOW_RESULTS.md`.

| Flow | Resultaat |
|---|---|
| Proefles form rendert | ✅ |
| Contact form rendert | ✅ |
| Beweeg-beter form rendert | ✅ |
| Mobility-reset form rendert | ✅ |
| Mobility-check form rendert | ✅ |
| Crowdfunding page rendert met hero CTA | ✅ |
| Crowdfunding tier-cards renderen | ⚠️ geen — campagne `active: false` in Sanity |
| Sanity Studio responds 200 + content | ✅ |
| Cookie consent banner visible | ✅ |
| OG meta tags aanwezig | ✅ (valt terug op statische default) |
| Geen GA4 collect voor consent | ✅ |
| gtag.js geladen in denied-state voor Consent Mode v2 | ❌ — **niet geladen** |

---

## 5. Root-cause analysis

### 5.1 Avatar upload faalt (kritiek)

**File:** `src/lib/actions/profile.ts:240-314`

- UI validatie: max 3 MB (MAX_AVATAR_BYTES = 3 * 1024 * 1024)
- Maar: Next.js server actions hebben een default body-size limit van **1 MB**. Deze moet expliciet verhoogd worden via `experimental.serverActions.bodySizeLimit` in `next.config.ts`.
- `next.config.ts` — geen `serverActions` config aanwezig → default van 1 MB blijft actief.
- Resultaat: elke upload tussen 1-3 MB wordt door Next's request-parser gedrukt voordat de server action wordt aangeroepen. De action `uploadAvatar()` run't nooit, de UI toont de generieke "Upload mislukt"-error (of zelfs niks).
- Smartphone-foto's zijn typisch 2-5 MB → veel gebruikers raken dit direct.

### 5.2 Consent Mode v2 kapot (kritiek)

**File:** `src/components/layout/Analytics.tsx:9-30`

```tsx
export function Analytics() {
  const [consentGranted, setConsentGranted] = useState(false);
  useEffect(() => {
    if (window.gtag) {
      window.gtag("consent", "default", { analytics_storage: "denied", ... });
    }
    setConsentGranted(getConsent() === "granted");
  }, []);
  if (!consentGranted) return null;
  return <GoogleAnalytics gaId={GA_ID} />;
}
```

Probleem:
1. `useEffect` run't na mount. Op dat moment is `window.gtag` nog niet gedefinieerd — de `GoogleAnalytics` component (die gtag.js loadt) wordt PAS gerendered ná consent, en consent is default `false`.
2. De `gtag("consent", "default", { ...denied })` call is daarom altijd een no-op.
3. `<GoogleAnalytics>` wordt alleen gemount als de user actief accepteert → tussen pageload en consent (of zonder consent) is er geen gtag.js = geen Consent Mode v2 pings, geen cookieless data, geen baseline.

De correcte Consent Mode v2 flow volgens Google:
1. Render gtag.js/GoogleAnalytics **altijd**, vanaf eerste paint.
2. **Vóór** gtag.js loadt, zet een `window.dataLayer.push(["consent", "default", {...denied}])` instruction in een inline `<script>` in `<head>`.
3. Bij accept: `gtag("consent", "update", { analytics_storage: "granted" })`.
4. Bij deny: niets doen — denied blijft de state; GA4 stuurt cookieless pings.

### 5.3 /pt + /blog 404s

Geen bug. Geen enkele link in source verwijst naar `/pt` of `/blog`. Eerder (nav-refactor) was `/app/pt` uit nav gehaald; die bestaat nog als member-app-route. Publieke `/pt` is nooit gebouwd.

### 5.4 Crowdfunding tiers niet zichtbaar

Geen code-bug. `crowdfundingSettings.active === false` in Sanity. Wanneer Marlon de campagne opent via Studio, gaan de tiers live.

### 5.5 OG image fallback

Geen bug. `siteImages.ogImage` is niet geüpload in Sanity. `generateMetadata` valt terug op `/images/og-default.jpg` (zie `src/app/layout.tsx`).

### 5.6 Homepage crawl-load 10.8s

Crawl-protocol artefact. Playwright's `waitUntil: "domcontentloaded"` doet extra werk (alle scripts, images) voor het event firet. Lighthouse mobile op dezelfde page scoorde 88 (na de perf-audit commits van vandaag). Niet acteren.

---

## 6. Prioritized fix plan

| # | Issue | Fix | File(s) | Effort |
|---|---|---|---|---|
| **A** | Avatar upload faalt >1 MB | `experimental.serverActions.bodySizeLimit: "3mb"` in `next.config.ts` | `next.config.ts` | 2 min, nul-risico |
| **B** | Consent Mode v2 niet functioneel | Pre-gtag inline `<script>` die default-consent naar "denied" zet in `<head>`; `<GoogleAnalytics>` altijd mounten; op accept een `gtag("consent", "update", granted)` call via de cookie-banner | `Analytics.tsx`, `CookieConsent.tsx`, `layout.tsx` (inline script) | 20 min, hoort te werken zonder user visible change behalve in GA4 data |

Geen andere fixes vereist.

---

## 7. Needs decision

- **Crowdfunding live zetten?** Geen code-bug, maar als je campagne al moet draaien: toggle `crowdfundingSettings.active = true` in Sanity Studio.
- **Sanity `siteImages.ogImage` uploaden?** Social shares tonen nu de statische fallback. Als je een editoriale OG-image wil: upload in Studio.
- **`/pt` marketing-route bouwen of niet?** Er bestaat nu geen publieke PT-info pagina. `/app/pt` is member-only. Als je marketing-leads wil voor PT specifiek, is dit een nieuwe feature.

Geen van deze punten blokkeren het afwerken van A en B.

---

## 8. Niet getest (bewust out of scope voor "medium")

- **Form submits** — zou echte MailerLite subscribers + Resend emails creëeren op productie.
- **Crowdfunding → Mollie checkout redirect** — campagne is `active: false`, geen tier-card om op te klikken.
- **Profile upload end-to-end test** — vereist ingelogde test-user + echte file upload. De bug is vastgesteld via code-analyse; remediation vraagt geen live-test.
- **Permanente Playwright suite + CI** — "full" scope, expliciet overgeslagen per gebruikers-keuze.

---

**Einde rapport. Phase 5 (fixes) start na approval.**
