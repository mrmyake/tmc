# Audit fase 1.4 — Missing

**Datum:** 2026-05-01
**Scope:** marketing site `themovementclub.nl`
**Doel:** wat staat in spec maar niet in werkelijkheid + drift CLAUDE.md ↔ repo.

Format: spec-bron, status, impact, effort.

---

## A — Specced in CLAUDE.md, niet (volledig) gebouwd

### `public/images/` directory met alle assets

**Spec:** CLAUDE.md "Placeholders die nog ingevuld moeten worden": *"Foto's: Alle `/public/images/` placeholders"*.
**Status:** directory bestaat niet eens. `public/` bevat alleen `downloads/` (PDF) + svg-icons (vercel.svg, next.svg, etc — Next.js boilerplate).
**Impact:** OG-images 404, structured-data image 404, hero-images uit Hero.tsx + StudioSection.tsx + OverContent.tsx + alt-componenten resolven naar Sanity URLs maar fallbacks 404'en.
**Effort:** L als nieuwe shoot. M als tijdelijke neutrale stand-in (1200x630 jpg met wordmark, donker).

### Privacyverklaring + cookieverklaring + algemene voorwaarden

**Spec:** Niet expliciet in CLAUDE.md, maar audit-prompt §1.3 vereist + AVG verplicht.
**Status:** geen route, geen file, geen footer-link.
**Impact:** AVG-overtreding (zie The Ugly).
**Effort:** L (juridisch + copy).

### `error.tsx` + `global-error.tsx` voor marketing scope

**Spec:** Audit-prompt §1.4 expliciete check.
**Status:** alleen `src/app/app/error.tsx` (member-systeem). Marketing scope mist beide.
**Impact:** gebruiker krijgt Next.js default error-pagina bij crash → off-brand → vertrouwens-killer.
**Effort:** S — twee components, ~30 LOC elk.

### `Person` schema voor Marlon (founder + trainer)

**Spec:** CLAUDE.md "Structured Data" lijst noemt het impliciet via "Wie is de trainer?" als AEO-vraag. Audit-prompt §1.4 expliciet.
**Status:** niet aanwezig in `src/lib/structuredData.ts`. Live HTML toont alleen `GymOrHealthClub` + `WebSite` JSON-LD.
**Impact:** wanneer iemand "Marlon The Movement Club" aan ChatGPT/Claude vraagt, mist het feitelijk personage. AEO + lokaal SEO win.
**Effort:** S — JSON-LD aanvullen met `@type: Person`, `name`, `jobTitle`, `image`, `worksFor: { @type: Organization, name: "The Movement Club" }`, `sameAs: [hormoonprofiel.com, instagram]`.

### `Service` schema voor PT / Small Group / Mobility / Strength

**Spec:** Audit-prompt §2.2 (AEO) — pillars staan in CLAUDE.md "Pijlers" + Sanity `offering`-schema actief.
**Status:** niet aanwezig.
**Impact:** Google Rich Results + AI-answers missen "wat biedt deze studio aan?" — ranking-signal voor service-queries.
**Effort:** M — per offering een `Service` schema (kan loop over Sanity `offering[]` in `structuredData.ts`).

### `FAQPage` schema voor FAQ-sectie op `/aanbod`

**Spec:** CLAUDE.md noemt `faq` Sanity-schema met `page` filter. Audit-prompt §2.2 expliciet "FAQPage = goud voor AEO".
**Status:** Sanity FAQ-content wordt blijkbaar gerenderd op `/aanbod` (component `aanbod` heeft FAQ per inventory), maar geen JSON-LD `FAQPage`.
**Effort:** S — wrap server-side render met JSON-LD output.

### `BreadcrumbList` per pagina

**Spec:** Audit-prompt §2.2.
**Status:** niet aanwezig.
**Effort:** S — boilerplate.

### MailerLite automations (6×)

**Spec:** CLAUDE.md "Email Automation (MailerLite)" sectie expliciet.
**Status:** **0 automations** in live MailerLite-account (verified API call). Zie The Ugly #4.
**Impact:** lead-funnel converteert niet door.
**Effort:** L (copy + video's + UI-config).

### Featurable widget ID

**Spec:** CLAUDE.md placeholder-tabel.
**Status:** placeholder-ID — widget toont niets / skeleton.
**Effort:** S (config) of beslis: vervangen door Sanity `testimonial`.

### `og-default.jpg` (1200x630)

**Spec:** Audit-prompt §1.4 + CLAUDE.md OG-tag verwachting.
**Status:** verwijzing in code aanwezig (`src/app/layout.tsx:68`), bestand 404.
**Effort:** S (1 jpg, brand-aligned).

### Volledige favicon-set

**Spec:** Audit-prompt §1.4: `favicon.ico`, `apple-touch-icon`, `manifest.json`, `theme-color`.
**Status:** alleen `src/app/favicon.ico` aanwezig (default Next.js). Geen apple-touch-icon, geen manifest, geen theme-color in `<head>`.
**Effort:** S — design + 4 file-sizes (32, 180, 192, 512) + manifest.json (theme/background color uit tokens).

### Crowdfunding mid-section CTA op homepage

**Spec:** niet expliciet in CLAUDE.md "Primaire CTA's per pagina" tabel — open vraag voor Marlon.
**Status:** homepage maakt geen referentie naar `/crowdfunding`.
**Impact:** lopende campagne is moeilijker te vinden voor returning-visitors.
**Effort:** S-M (hangt af van of het een banner of full-section wordt).

### AI-crawler entries in `robots.txt`

**Spec:** Audit-prompt §2.2 "Crawler-toegang".
**Status:** alleen `User-Agent: *\nAllow: /` in `src/app/robots.ts`.
**Impact:** geen explicit-allow voor GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Applebot-Extended.
**Effort:** S — uitbreiden in `robots.ts`.

### `llms.txt`

**Spec:** Audit-prompt §2.2 "optioneel maar relevant".
**Status:** niet aanwezig.
**Effort:** S — markdown-export van site voor LLM-consumption (5 paginas → 1 file van ~3KB).

### Real Person/avatar/photoshoot voor Marlon

**Spec:** CLAUDE.md trainer-schema verwacht `bio`, `image`, `socials`.
**Status:** Sanity-content waarschijnlijk in plaats, afbeeldingen waarschijnlijk placeholder-portretten.
**Impact:** authenticity = AEO + brand.
**Effort:** L (shoot).

### `@vercel/speed-insights` aktief?

**Spec:** Audit-prompt §2.1 (parkeer voor fase 2).
**Status:** niet zelf geverifieerd in deze pass — hoort bij fase 2.
**Effort:** S indien al geïnstalleerd, alleen `<SpeedInsights />` in layout.

---

## B — Drift CLAUDE.md ↔ repo

### Email-stack: CLAUDE.md noemt Resend, repo gebruikt MailerSend

**CLAUDE.md zegt:** *"Forms backend: Resend voor transactionele emails (indien van toepassing)"*.
**Werkelijkheid:** `package.json` bevat `mailersend@^2.8.0`, geen `resend`. `src/lib/email.ts` importeert uit `mailersend`. SPF-record in DNS (`include:dc-3cb1d11d42._spfm.themovementclub.nl include:dc-db9e4b7a04._spfm.themovementclub.nl`) is MailerSend-format. DMARC actief.
**Resolutie:** CLAUDE.md updaten naar MailerSend. Drift is non-functioneel maar verwarrend voor toekomstige sessies.
**Effort:** S (docs only).

### Sitemap-tooling: CLAUDE.md noemt `next-sitemap`, repo gebruikt native `sitemap.ts`

**CLAUDE.md zegt:** *"Sitemap.xml + robots.txt (check `next-sitemap`)"*.
**Werkelijkheid:** `package.json` bevat geen `next-sitemap`. `src/app/sitemap.ts` is native Next.js 14+ App Router pattern. Werkt. Output in productie is correct (9 entries, sitemap.xml endpoint geserveerd).
**Resolutie:** CLAUDE.md updaten — native sitemap is moderner en exact wat je hier wilt.
**Effort:** S (docs only).

### Sanity-schemas: CLAUDE.md noemt `testimonial` + `blogPost` als "al aanwezig"

**CLAUDE.md zegt:** *"Schema's (al aanwezig): siteSettings, ..., testimonial, faq, blogPost"*.
**Werkelijkheid:** `sanity/schemas/index.ts:11-19` heeft commentaar dat ze bewust niet zijn geregistreerd. Inventory `00-inventory.md` §9.3 bevestigt dit als drift.
**Resolutie:** CLAUDE.md duidelijk maken: schemas bestaan in repo maar zijn uit-/in-geschakeld via index. Of: schemas verwijderen als ze écht niet gebruikt worden (TestimonialCarousel laadt nu via Featurable, niet Sanity → dus testimonial ongebruikt).
**Effort:** S (beslissing + 1 commit).

### Mollie webhooks: hypothese "drift-kandidaat" weerlegd

**Inventory zei:** *"crowdfunding-webhook én mollie-webhook bestaan naast elkaar — drift-kandidaat?"*
**Werkelijkheid:** intentioneel gescheiden domein-flows. Bevestigd via code-comment `route.ts:47`.
**Resolutie:** inventory note updaten van "drift-kandidaat" naar "intentioneel". Audit-finding: dit is The Good (zie 01-the-good.md).
**Effort:** S (docs only).

### Constants `SITE.url` is non-www, productie redirect www

**CLAUDE.md zegt:** *"Productie: https://www.themovementclub.nl"*.
**Werkelijkheid:** `src/lib/constants.ts:6` zegt `"https://themovementclub.nl"`. Sitemap, structured data, OG-tags, canonicals erven dit allemaal.
**Resolutie:** vervangen door `"https://www.themovementclub.nl"`.
**Effort:** S — één string, één commit, alle downstream files erven mee.

### Vercel env values voor `MAILERLITE_*` group IDs niet uitleesbaar via pull

**Spec:** N/A — runtime-detail, geen drift. Maar relevant: production+preview values zijn "Encrypted" (sensitive default in Vercel) → kan niet pull-verifiëren.
**Status:** development env heeft `MAILERLITE_*_GROUP_ID` leeg (intentioneel, lib graceful-degradeert). Production+preview hebben de values maar zijn niet leesbaar via `vercel env pull` zonder `--no-sensitive`.
**Aanbeveling:** test via een live crowdfunding-betaling of member marketing-toggle dat de juiste groep aangesproken wordt.
**Effort:** S (testen) of M (refactor van Vercel env naar `--no-sensitive` zodat audit ze kan inspecteren).

---

## C — Niet-spec, wel relevant (parkeer voor fase 2/3)

- **Vercel Speed Insights actief?** Pakketje aanwezig per inventory; needs verify.
- **DKIM-record voor MailerSend.** SPF/DMARC ✓, DKIM-selector niet zichtbaar op `default._domainkey` of `mlsend._domainkey`. Vraag: welke selector gebruikt MailerSend voor dit domein? Zonder DKIM kan deliverability laag scoren.
- **Sanity ISR-revalidate keten.** CLAUDE.md zegt "Publish in Sanity → webhook naar Vercel → pagina binnen 5-10s live". Niet zelf getest in deze pass.
- **GA4 verification met netwerk-tab.** Vereist browser-actie (zie The Ugly tail).

---

**Totaal:** 16 missing items + 5 drift-items + 4 parkeer-items voor fase 2.
