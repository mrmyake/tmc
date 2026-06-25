# Audit fase 1.2 — The Bad

**Datum:** 2026-05-01
**Scope:** marketing site `themovementclub.nl`
**Doel:** issues die afbreuk doen aan kwaliteit/conversie/vindbaarheid/brand — solvable, niet-blocking.

---

## Brand voice / copy

### Em-dash in marketing-componenten (skill: NEVER)

**Locatie:** `src/app/aanbod/AanbodContent.tsx` (file bevat `—`); image-alts `src/components/blocks/OfferingCards.tsx:37` (`alt={\`${offering.title} — The Movement Club\`}`); `src/app/aanbod/AanbodContent.tsx:151` (`alt={\`${training.title} — The Movement Club\`}`)
**Wat is er:** `—` (em-dash) gebruikt als separator in alt-text en (waarschijnlijk) in zichtbare copy.
**Waarom is het bad:** design system README.md "Casing & punctuation": *"No em-dashes. Ever. Use a period, a comma, or a new sentence. Parentheses are fine for a quiet aside."*
**Impact:** brand consistency
**Fix-effort:** S (find-replace per file)

### SITE constants tagline in Engels terwijl rest Nederlands is

**Locatie:** `src/lib/constants.ts:3` (`tagline: "Where Strength Meets Movement"`)
**Wat is er:** SITE-tagline is Engels. CLAUDE.md "Brand & Positionering" → "Taal: Nederlands primair, eventueel Engelse taglines". Skill voice rules zijn in Nederlands geformuleerd.
**Waarom is het bad:** tagline wordt op meerdere plekken hergebruikt (mogelijk in metadata fallback). Inconsistent met de rest van de copy.
**Impact:** brand
**Fix-effort:** S (één string), maar zonder Marlon's tekst → `// COPY: confirm with Marlon` toevoegen

## Componenten / design-system drift

### Hardcoded hex-strings in confetti i.p.v. CSS-vars

**Locatie:** `src/components/blocks/crowdfunding/Confetti.tsx:10` (`const colors = ["#B9986A", "#F4EFE6", "#8A6E47"]`)
**Wat is er:** champagne / stone-100 / champagne-deep direct als hex.
**Waarom is het bad:** values matchen tokens (toevallig), maar als design-tokens ooit shifted (bv. champagne wordt warmer), drift de confetti. Skill-rule: tokens-only.
**Impact:** brand consistency / future-proofing
**Fix-effort:** S — lees via `getComputedStyle(document.documentElement).getPropertyValue('--champagne')` op mount.

### TrackedLink-component bestaat maar wordt nergens gebruikt

**Locatie:** `src/components/ui/TrackedLink.tsx` (bestaat) — `grep -rln TrackedLink src/` returned 0 hits buiten de file zelf.
**Wat is er:** dead UI-component.
**Waarom is het bad:** verwarrend voor toekomstige devs ("waarom is dit er?"), barrel-import-vergroting.
**Impact:** maintainability
**Fix-effort:** S — verwijderen of toepassen op bv. footer phone/whatsapp link.

## Analytics wiring

### Footer phone/whatsapp/email links vuren géén `click_*` event

**Locatie:** `src/components/layout/Footer.tsx:97` (`<QuietLink href={\`tel:${settings.phone.replace(/\s/g, "")}\`}>`)
**Wat is er:** raw `tel:` href zonder onClick of TrackedLink-wrapping.
**Waarom is het bad:** CLAUDE.md "Engagement events" tabel: `click_phone`, `click_whatsapp`, `click_email` moeten vuren. Helper bestaat (`trackContact("phone"|"whatsapp"|"email")` op `src/lib/analytics.ts:38-43`) maar wordt niet aangeroepen.
**Impact:** SEO/conversie attribution — je weet niet welk kanaal werkt
**Fix-effort:** S — vervang `<QuietLink>` door `<TrackedLink onClickEvent={() => trackContact("phone")}>` of inline onClick.

### `section_view` event nergens gewired (homepage)

**Locatie:** `src/app/page.tsx`, alle blocks in `src/components/blocks/*` (alleen `TestimonialCarousel.tsx:24` en `crowdfunding/TierGrid.tsx:26` gebruiken `IntersectionObserver`, geen van beide voor `section_view`)
**Wat is er:** CLAUDE.md "Engagement events" → `section_view`: "Homepage sectie in viewport" via Intersection Observer met `section name`. Er is geen helper én geen wiring.
**Waarom is het bad:** je mist data over welke homepage-secties mensen daadwerkelijk zien (engagement attribution voor copy/UX-besluiten).
**Impact:** SEO/conversie attribution
**Fix-effort:** M — helper toevoegen aan `lib/analytics.ts`, observer-component schrijven, wrappen rond Hero/Philosophy/Studio/Trainer/Offering/Pricing/Testimonial/Contact.

### `view_item_list` tier-grid in viewport — wel wiring, maar geen helper-call zichtbaar

**Locatie:** `src/components/blocks/crowdfunding/TierGrid.tsx:26-…`
**Wat is er:** Intersection Observer aanwezig — niet zelf geverifieerd of `trackViewItemList("crowdfunding_tiers")` wordt aangeroepen.
**Waarom is het bad:** CLAUDE.md crowdfunding-tabel verplicht event op tier grid in viewport.
**Impact:** crowdfunding-funnel attribution
**Fix-effort:** S — verifieer + voeg toe als ontbreekt.

## Forms / UX feedback

### `ContactForm` heeft alleen `submitted: boolean`-state — mist loading/error feedback

**Locatie:** `src/components/blocks/ContactForm.tsx:10` (`const [submitted, setSubmitted] = useState(false)`)
**Wat is er:** binaire state. Geen `isSubmitting`, geen `error`-state, geen loading-spinner of disabled-tijdens-submit.
**Waarom is het bad:** als de fetch 5 sec duurt, kan een nervous gebruiker dubbel klikken → twee MailerLite-records. Als hij faalt (network/CORS), krijgt de gebruiker geen feedback en denkt dat 't wel goed kwam → lost lead.
**Impact:** conversie / data-kwaliteit
**Fix-effort:** S-M — voeg `idle | submitting | success | error` reducer-state toe + button disabled tijdens submit.

## SEO / metadata

### Canonical URLs gebruiken non-www terwijl site op www draait

**Locatie:** `/tmp/tmc-live/*.html` — alle 9 pagina's hebben `<link rel="canonical" href="https://themovementclub.nl/...">`. Live `https://themovementclub.nl` doet 307 → `https://www.themovementclub.nl`.
**Wat is er:** canonical wijst naar de redirect-source, niet naar de bestemming.
**Waarom is het bad:** Google zal het meestal goed afhandelen, maar best-practice is dat canonicals altijd de eindbestemming aanwijzen (geen redirect chain). CLAUDE.md "Project Status" → `Productie: https://www.themovementclub.nl`.
**Impact:** SEO (signals strength)
**Fix-effort:** S — `metadataBase` op `https://www.themovementclub.nl` zetten in `src/lib/metadata.ts` of `layout.tsx`.

### Sitemap.xml gebruikt non-www `loc` URLs

**Locatie:** `/tmp/tmc-live/sitemap.xml` — alle 9 entries `<loc>https://themovementclub.nl/…</loc>`
**Wat is er:** zelfde issue als canonical.
**Waarom is het bad:** crawlers volgen redirect en indexeren uiteindelijk www, maar je verbrandt crawl-budget op redirects.
**Impact:** SEO
**Fix-effort:** S — fix `SITE.url` in `src/lib/constants.ts:6` (`"https://themovementclub.nl"` → `"https://www.themovementclub.nl"`); sitemap.ts en structuredData.ts erven daar van.

### `/over`, `/aanbod`, `/contact` hebben GEEN `<h1>` element

**Locatie:** `/tmp/tmc-live/over.html`, `aanbod.html`, `contact.html` — `grep -c '<h1'` retourneert 0 op alle drie.
**Wat is er:** drie kerngedeelten van de site missen het primaire heading-niveau.
**Waarom is het bad:** SEO: Google gebruikt h1 als title-fallback en als belangrijkste content-signal. A11y: schermlezers gebruiken h1 voor "wat is deze pagina".
**Impact:** SEO + a11y
**Fix-effort:** S — voeg `<h1>` toe in `OverContent.tsx`, `AanbodContent.tsx`, `ContactContent.tsx`. Skill: serif-display, sentence case, 56-96px desktop.

## Robots / discoverability

### `robots.txt` heeft geen AI-crawler entries (Phase-2 voorbode)

**Locatie:** `/tmp/tmc-live/robots.txt` — alleen `User-Agent: *\nAllow: /\n\nSitemap: https://themovementclub.nl/sitemap.xml\n`
**Wat is er:** generieke wildcard. Geen expliciete `User-Agent: GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Applebot-Extended` etc.
**Waarom is het bad:** voor lokale boutique gym wil je dat ChatGPT/Claude/Perplexity je vindt en citeert wanneer iemand "mobility loosdrecht" vraagt. Wildcard volstaat technisch maar expliciet vragen om indexatie versterkt het signaal.
**Impact:** AI-discoverability (gepland voor fase 2)
**Fix-effort:** S — uitbreiden in `src/app/robots.ts`.

### Sitemap.xml referenceert sitemap-URL met non-www ook in zichzelf

**Locatie:** `/tmp/tmc-live/robots.txt` regel 4: `Sitemap: https://themovementclub.nl/sitemap.xml`
**Wat is er:** sitemap-pointer in robots gebruikt non-www.
**Waarom is het bad:** zelfde issue als canonical/sitemap loc — redirect-source ipv -bestemming.
**Impact:** SEO crawl-efficiency
**Fix-effort:** S — fix in `src/app/robots.ts`.

## Security headers

### Geen Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

**Locatie:** `/tmp/tmc-live/headers.txt` — alleen HSTS, vary, server, content-type, cache-control, x-vercel-* aanwezig.
**Wat is er:** geen extra security-headers.
**Waarom is het bad:** clickjacking-bescherming (X-Frame-Options DENY of CSP frame-ancestors), MIME-sniffing-bescherming (X-Content-Type-Options nosniff), referrer privacy (Referrer-Policy strict-origin-when-cross-origin), permissions-locking (Permissions-Policy camera=()).
**Impact:** security / brand (securityheaders.com grade verbetert van F naar A)
**Fix-effort:** M — config via `next.config.ts` `headers()` of `vercel.json` `headers`. CSP vereist test (third-party origins: GA, Sanity-CDN, Featurable).

### `x-powered-by: Next.js` lekt stack info

**Locatie:** `/tmp/tmc-live/headers.txt`
**Wat is er:** Vercel default — niet kritiek maar best-practice is `poweredByHeader: false` in `next.config.ts`.
**Impact:** security info-leak (low)
**Fix-effort:** S — één regel in next.config.

## Cookie consent

### Cookie consent banner mist "wijzig keuze" affordance

**Locatie:** `src/components/layout/CookieConsent.tsx:13-16` — banner toont alleen als `getConsent() === null`. Eenmaal gekozen → permanent verstopt.
**Wat is er:** geen footer-link of avatar-menu om opnieuw te kiezen.
**Waarom is het bad:** AVG: gebruiker moet zijn keuze kunnen herzien zonder localStorage handmatig te wissen. Dit kan in een aanstaande inspectie als juridische tekortkoming gezien worden.
**Impact:** AVG-compliance (zachte schending) / UX
**Fix-effort:** S — voeg footer-link "Cookievoorkeuren wijzigen" toe die `setConsent(null)` doet en banner herlaadt.

### Banner copy noemt niet welke verwerkers actief worden bij accepteren

**Locatie:** `src/components/layout/CookieConsent.tsx:38-41`
**Wat is er:** *"We gebruiken analytische cookies om onze website te verbeteren. Geen advertentiecookies, geen tracking door derden."* Klinkt vriendelijk, maar GA4 wordt geactiveerd → dat IS tracking by Google.
**Waarom is het bad:** AVG vereist transparantie over verwerkers. Tekst nu is misleidend (suggereert "geen derden" terwijl GA4 = Google = derde).
**Impact:** AVG-compliance / brand-vertrouwen
**Fix-effort:** S — herschrijf copy + link naar (nog te maken) cookieverklaring.

## Image alt text — kleine details

### Alt-text bevat em-dashes (zie boven) — al genoteerd onder copy

(zie eerste finding hierboven, niet dubbel tellen)

### Hero alt is generic ("The Movement Club studio")

**Locatie:** `src/components/blocks/Hero.tsx:75`
**Wat is er:** `alt="The Movement Club studio"` — beschrijft niet wat de afbeelding toont.
**Waarom is het bad:** voor screenreaders + image-search waardeloos. Skill imagery-rules: "moody, low-lit, hand op barbell, krijt op hout" — als de hero zo'n shot is, beschrijf dát.
**Impact:** a11y / SEO image search
**Fix-effort:** S — concretere alt, of kennelijk-decoratief? dan `alt=""`.

## Cross-pagina linking

### Homepage stuurt niet expliciet naar `/crowdfunding`

**Locatie:** `src/app/page.tsx`, `src/components/blocks/*.tsx` — `grep "crowdfunding"` op homepage-route → 0 hits
**Wat is er:** lopende campagne, hoge changefreq in sitemap, eigen OG-meta, eigen funnel — maar de hoofdingang van de site verwijst er niet naar.
**Waarom is het bad:** elke euro die je in ads steekt landt op de homepage; vanaf daar moet ik /crowdfunding kunnen zien zonder zoeken. CLAUDE.md gebruikt /crowdfunding niet expliciet in "Primaire CTA's per pagina" tabel — open vraag of dit bewust is.
**Impact:** crowdfunding conversie
**Fix-effort:** S-M — sectie of banner toevoegen, of secondary CTA in hero. Vraag aan Marlon: hoe prominent?

---

**Totaal:** 21 bevindingen. Verdeling: copy 2, design-drift 2, analytics 3, forms 1, SEO/metadata 4, robots 2, security headers 2, cookie consent 2, alt 1, cross-link 1, dead code 1.
