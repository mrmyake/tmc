# Audit fase 1.3 — The Ugly

**Datum:** 2026-05-01
**Scope:** marketing site `themovementclub.nl`
**Doel:** kritische issues, blocking voor go-live (of voor "trots zijn op de site").

Format per finding: locatie, wat, waarom-ugly, impact, fix-effort, blocking/non-blocking.

---

### `/public/images/` directory bestaat NIET — alle OG-images, Twitter-cards, structured-data images zijn 404

**Locatie:** repo-side: `ls public/images/` → "No such file or directory" (alleen `public/downloads/` + svg-icons aanwezig). Live: `curl -sI https://www.themovementclub.nl/images/og-default.jpg` → **HTTP 404**; `curl -sI https://www.themovementclub.nl/images/hero/studio.jpg` → **HTTP 404**.
**Wat is er:** elke marketing-pagina linkt naar `og:image="https://themovementclub.nl/images/og-default.jpg"` (en Twitter card). De `GymOrHealthClub` JSON-LD `image` property linkt naar `/images/hero/studio.jpg`. Beide bestanden ontbreken.
**Waarom is het ugly:** wie de site deelt op WhatsApp/Slack/LinkedIn/X krijgt een gebroken image-card te zien. Search-engine SERP-features die `image` uit JSON-LD halen krijgen niets. Voor een "boutique" brand is dit de openingsindruk.
**Impact:** brand (kritisch), SEO, social-share conversion
**Fix-effort:** M — of statische 1200x630 jpg in `/public/images/og-default.jpg` + studio-shot, of via Sanity siteImages laden (CLAUDE.md vermeldt `siteImages` schema). Een tijdelijke neutrale donkergroen-met-wordmark JPG kan binnen 30 minuten leven.
**Status:** **BLOCKING** voor go-live als marketing-campagne (ads/social-shares = primaire kanaal).

---

### Geen privacy-, cookie-, of voorwaarden-pagina's (AVG-overtreding)

**Locatie:** `find src/app -type d -iname "*privacy*" -o -iname "*cookie*" -o -iname "*voorwaarden*" -o -iname "*disclaimer*"` → 0 results.
**Wat is er:** site verzamelt persoonsgegevens (formulieren) + zet cookies (GA4 na consent) + verwerkt betalingen (Mollie via /crowdfunding) + heeft mogelijk member-systeem registraties (/app). Geen privacyverklaring waarin verwerkers worden genoemd (MailerLite, Google Analytics, Vercel logging, MailerSend, Sanity, Mollie, Supabase). Geen cookieverklaring. Geen algemene voorwaarden.
**Waarom is het ugly:** AVG art. 13 verplicht informatie over verwerkers + grondslag bij verzameling. Een AP-controle of klacht is direct een boete-risico. Cookie-banner copy claimt al onterecht "geen derden" (zie The Bad).
**Impact:** legal / AVG-compliance / brand-vertrouwen
**Fix-effort:** L — drie pagina's, juridisch laten controleren. Privacy ~600 woorden, cookie ~300, voorwaarden afhankelijk van diensten. Templates van bv. ICTRecht-genereren, daarna Marlon laten reviewen.
**Status:** **BLOCKING** voor productie waar formulieren live staan.

---

### Lead-funnel was 100% gebroken in productie — silent 401 (ALREADY FIXED)

**Locatie:** `src/lib/mailerlite.ts:8-12` (was), `commit 36bb8a8` (fix)
**Wat is er:** MailerLite API-key in Vercel env opgeslagen met embedded linebreaks (1079 chars met whitespace, 988 schoon). `fetch` met `Authorization: Bearer ${apiKey}` zonder strip → ongeldig header → HTTP 401. API-routes (`/api/contact`, `/api/proefles`, `/api/leads/*`) loggen `console.error` maar returnen `{ success: true }` → frontend toont success → gebruiker denkt aangemeld → MailerLite ontvangt niets.
**Waarom is het ugly:** elke lead sinds launch is verloren. Account-totaal in MailerLite: **0 subscribers**. PDF-downloads daarna ook geen 7-dagen Reset sequence (los daar nog van 0 automations onder).
**Impact:** lead-funnel — 100% van submits verloren in productie
**Fix-effort:** N/A — opgelost.
**Status:** **RESOLVED** (commit `36bb8a8`: defensive whitespace strip in `mailerliteRequest`; Vercel env values voor production/preview/development opnieuw gezet zonder corruptie). Aanbeveling: na deploy van `36bb8a8` één test-submit doen om te bevestigen dat een nieuwe lead in MailerLite verschijnt.

---

### Nul (0) MailerLite-automations terwijl CLAUDE.md spec er 6 verplicht

**Locatie:** MailerLite API `/automations?limit=50` → `{"data": []}` (account 2260779).
**Wat is er:** geen enkele automation actief. CLAUDE.md "Email Automation (MailerLite)" lijst:
1. PDF download → tag "PDF Lead" → wait 1d → start Reset sequence
2. Reset day 7 → CTA naar /mobility-check
3. Reset day 9 (no click) → follow-up
4. Mobility Check aanvraag → email naar Marlon + auto-reply
5. Mobility Check no-show 7d → follow-up
6. Proefles aanvraag → auto-reply + intern notif

**Waarom is het ugly:** elke succesvolle lead-submit (vanaf nu de key werkt) eindigt in een groep, maar krijgt NIETS. Geen welcome email, geen PDF in inbox (PDF zit wel in `/public/downloads/` en frontend serveert direct download — die werkt), geen 7-dagen reset video-serie, geen reminder na 7 dagen. De HELE waarde-propositie van het lead-magnet model staat alleen op papier.
**Impact:** lead-nurturing — funnel converteert niet door naar Mobility Check (de hoogwaarde-conversie). Volgens CLAUDE.md KPI: 30 Reset-opt-ins/maand, 10 MC-aanvragen/maand. Zonder automation 0% van die conversie.
**Fix-effort:** L — 6 automations bouwen in MailerLite UI: 7 video-emails schrijven (script + opnames + upload als unlisted YouTube), copy schrijven voor 5 transactionele/follow-up mails, triggers koppelen aan groepen + tags, A/B subject-lines.
**Status:** **BLOCKING** voor "lead funnel werkt" — niet blocking voor "site is up".

---

### Placeholder-telefoonnummer lekt naar publieke `GymOrHealthClub` JSON-LD

**Locatie:** `src/lib/constants.ts:8` (`phone: "+31 6 00 00 00 00"`) → `src/lib/structuredData.ts` → live HTML `/tmp/tmc-live/root.html` JSON-LD `"telephone":"+31 6 00 00 00 00"`.
**Wat is er:** structured-data verklaart aan Google + AI-assistenten dat het telefoonnummer "+31 6 00 00 00 00" is.
**Waarom is het ugly:** wanneer iemand Claude/ChatGPT/Google vraagt "hoe bel ik The Movement Club?", krijgt 'ie dit nummer terug. Bellen → dood / niet-bestaand. AEO-fout van de eerste orde. KvK `00000000` en BTW `NL000000000B01` zitten ook in `constants.ts:18-19` — als iets daarvan in footer/contact getoond wordt, idem ramp.
**Impact:** brand reputation, AEO, lokaal SEO
**Fix-effort:** S — Marlon vraagt om echt nummer, replace in `constants.ts:8`. Dezelfde fix dekt KvK + BTW + WhatsApp-link.
**Status:** **BLOCKING** voor "TMC verschijnt in zoekresultaten" — productie-site doet dat niet altijd al, maar zodra Search Console gevuld raakt is dit het eerste wat een audit-tool meldt.

---

### Geen `error.tsx` of `global-error.tsx` voor marketing-routes

**Locatie:** `find src/app -maxdepth 2 -name "error.tsx" -o -name "global-error.tsx"` → alleen `src/app/app/error.tsx` (member-systeem, out-of-scope) en `src/app/not-found.tsx`.
**Wat is er:** geen route-level error boundary voor marketing, geen root-level global-error.tsx.
**Waarom is het ugly:** als een Sanity-fetch crasht of een Server Component throwt, ziet de gebruiker Next.js' default error-pagina (witte pagina, "Application error", geen brand, geen navbar/footer, geen "terug naar home"). Voor een boutique brand = vertrouwens-killer.
**Impact:** UX / brand bij failure-events
**Fix-effort:** S — twee files met skill-tokens, navbar/footer behoud, één duidelijke CTA "Terug naar home". Skill copy-toon: rustig, "Dat werkte niet. Probeer het zo nog eens."
**Status:** **BLOCKING** voor publiek launchen met externe traffic — fout-cases gaan voorkomen, je wil ze on-brand opvangen.

---

### API-endpoints (`/api/contact`, `/api/proefles`, `/api/leads/*`) hebben geen rate-limiting, geen honeypot, geen schema-validatie

**Locatie:** `src/app/api/contact/route.ts`, `src/app/api/proefles/route.ts`, `src/app/api/leads/{beweeg-beter,mobility-reset,mobility-check}/route.ts` — `grep "rateLimit\|honeypot\|zod"` op alle 5 → 0 hits. Validatie beperkt tot `if (!data.email || !data.name)`.
**Wat is er:** publieke endpoints accepteren onbeperkt JSON-payloads met willekeurige email + name. Geen IP-throttling, geen Cloudflare Turnstile / hCaptcha / honeypot, geen format-checks. CLAUDE.md zegt impliciet "anti-bot bescherming forms" als verwachte audit-check.
**Waarom is het ugly:** een script-kid kan duizenden fake-leads pushen → MailerLite-groepen vol troep → vertroebelt KPI-data (en kan MailerLite Free-tier opmaken). Email-only check accepteert ook `"a"` → bv `addSubscriber({ email: "a", name: "x" })` → MailerLite returns 422 maar dat zien we ook in console.error en swallowen.
**Impact:** data-kwaliteit, kosten (MailerLite quota), reputatie (als spammers headers manipuleren)
**Fix-effort:** M — Upstash Ratelimit (Vercel KV alternatief) of in-memory token-bucket per IP (5 req/uur per endpoint), zod-schema voor body-validation, honeypot field (`<input name="website" tabIndex={-1} aria-hidden style="display:none">`) dat client niet invult maar bots wel.
**Status:** **NON-BLOCKING** voor go-live met laag traffic, **BLOCKING** zodra je advertenties draait of de PDF actief promoot.

---

### Sitemap + canonicals + robots.txt sitemap-pointer wijzen naar non-www host

**Locatie:** `/tmp/tmc-live/sitemap.xml` (alle 9 `<loc>https://themovementclub.nl/…</loc>`); `/tmp/tmc-live/*.html` (alle canonicals `https://themovementclub.nl/...`); `/tmp/tmc-live/robots.txt:4` (`Sitemap: https://themovementclub.nl/sitemap.xml`).
**Wat is er:** alle interne URL-signals gebruiken non-www, terwijl `www.themovementclub.nl` de canonical host is (CLAUDE.md "Project Status"). non-www → www doet 307.
**Waarom is het ugly:** Google volgt redirects en kiest uiteindelijk www, maar tijdelijk dual-host indexering kan voorkomen → gesplitste link-equity. Voor een nieuwe domein-launch (Search Console net opgezet, weinig externe links) is "schoon starten" met de juiste host belangrijk om consolidatie te helpen.
**Impact:** SEO crawl-efficiency + indexatie-eenduidigheid
**Fix-effort:** S — fix `SITE.url` in `src/lib/constants.ts:6` van `"https://themovementclub.nl"` naar `"https://www.themovementclub.nl"`. Sitemap (`src/app/sitemap.ts`), robots (`src/app/robots.ts`), structured data (`src/lib/structuredData.ts`) erven daar van.
**Status:** **NON-BLOCKING** maar zwaar fix-to-impact-ratio = doe 't snel.

---

### `/over`, `/aanbod`, `/contact` missen volledig een `<h1>`

**Locatie:** live HTML van alle drie → `grep -c '<h1'` = 0.
**Wat is er:** drie hoofdpagina's hebben geen primaire heading.
**Waarom is het ugly:** SEO: Google fallback voor page-title is `<h1>` content; zonder h1 raadt 'ie. AEO/citatie: LLMs gebruiken h1 als "wat is deze pagina over". A11y: schermlezers springen direct naar h1 om context te krijgen.
**Impact:** SEO + a11y
**Fix-effort:** S — voeg `<h1>` toe in `OverContent.tsx`, `AanbodContent.tsx`, `ContactContent.tsx`. Skill: serif-display, sentence case, 56-96px desktop, één champagne accent-woord toegestaan.
**Status:** **NON-BLOCKING** maar urgent — vrijwel gratis fix, hoge SEO-impact.

---

### Featurable Google Reviews widget nog steeds placeholder

**Locatie:** `src/components/blocks/TestimonialCarousel.tsx` (waarschijnlijk — niet zelf geverifieerd in deze audit-pass), CLAUDE.md "Placeholders die nog ingevuld moeten worden" tabel.
**Wat is er:** widget-ID nog niet ingevuld (per CLAUDE.md). Live HTML toont waarschijnlijk een leeg of skeleton-state-blok.
**Waarom is het ugly:** social-proof is een van de zwaarste conversie-drivers; zonder ratings/quotes verlies je een blok dat wel gepland is in de architectuur.
**Impact:** conversie / brand-vertrouwen
**Fix-effort:** S (configuratie) — Marlon heeft het ID, of widget vervangen door Sanity `testimonial`-schema items (CLAUDE.md noemt dat schema, inventory bevestigt dat het bewust uitgeschakeld is — drift te resolven).
**Status:** **NON-BLOCKING** maar bewust niet getoond is een conversie-keuze die bevestigd moet zijn.

---

### Twitter-card image is 404 (Twitter/X SERP shows broken card)

**Locatie:** `/tmp/tmc-live/root.html` → `<meta name="twitter:image" content="https://themovementclub.nl/images/og-default.jpg">` → 404.
**Wat is er:** zelfde root cause als OG-image finding hierboven (`/public/images/` bestaat niet).
**Waarom is het ugly:** Twitter/X-cards laden niet → bij elke share verlies je social-proof.
**Impact:** social-share conversie
**Fix-effort:** opgelost zodra OG-image fix gedaan is (zelfde URL).
**Status:** zie eerste finding (BLOCKING).

---

**Totaal:** 11 bevindingen. Blocking: 5 (OG/structured-data 404 images, AVG-pagina's, error boundaries, MailerLite automations als funnel echt moet werken, placeholder-telefoon in JSON-LD). Resolved: 1 (MailerLite key bug). Non-blocking maar urgent: 5.

**Browser-only checks NOG niet uitgevoerd** (vereist user-side actie):
- GA4 fires alleen ná consent — netwerk-tab inspectie
- Cookies-scan in DevTools na accept (welke first/third-party)
- Tap-target sizes op 375px viewport
- Lighthouse Performance/Accessibility/Best-Practices scores
- DKIM-record voor MailerSend domain (selector onbekend, `mlsend._domainkey` returned leeg)

Deze parkeren naar fase 2 met expliciete "needs user" markering.
