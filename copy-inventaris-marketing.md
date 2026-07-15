# Copy-inventarisatie — publieke marketingsite TMC

**Commit-hash:** `95a50ab47963c019ff2593bdfd3c1b8106e617f1`
**Tijdstip van extractie:** 2026-07-15T17:25:21Z (UTC)
**Branch:** `chore/copy-inventaris`
**Scope:** read-only. Geen strings gewijzigd, geen COPY-markers toegevoegd, geen refactor.
**Output:** `copy-inventaris-marketing.tsv` (1074 datarijen + header), dit bestand.

---

## 1. Route-boom (werkelijke staat, uit `src/app`)

Enumeratie op basis van `find src/app -name page.tsx`, met `/app/**` (ledenomgeving) en API-routes uitgesloten per opdracht.

```
/                                          (src/app/page.tsx)
/aanbod                                    (src/app/aanbod/page.tsx)
/prijzen                                   (src/app/prijzen/page.tsx)
/abonnement                                (src/app/abonnement/page.tsx)
/proefles                                  (src/app/proefles/page.tsx)
/proefles/boeken                           (src/app/proefles/boeken/page.tsx)
/proefles/boeken/bedankt                   (src/app/proefles/boeken/bedankt/page.tsx)
/proefles/annuleren/[token]                (src/app/proefles/annuleren/[token]/page.tsx)
/contact                                   (src/app/contact/page.tsx)
/over                                      (src/app/over/page.tsx)
/early-member                              (src/app/early-member/page.tsx)
/beweeg-beter                              (src/app/beweeg-beter/page.tsx)
/beweeg-beter/bedankt                      (src/app/beweeg-beter/bedankt/page.tsx)
/mobility-reset                            (src/app/mobility-reset/page.tsx)
/mobility-reset/bedankt                    (src/app/mobility-reset/bedankt/page.tsx)
/mobility-check                            (src/app/mobility-check/page.tsx)
/mobility-check/bedankt                    (src/app/mobility-check/bedankt/page.tsx)
/rooster                                   (src/app/rooster/page.tsx)
/privacybeleid                             (src/app/privacybeleid/page.tsx)
/12-weken-programma                        (src/app/12-weken-programma/page.tsx)
/12-weken-programma/intake                 (src/app/12-weken-programma/intake/page.tsx)
/betaal/[token]                            (src/app/betaal/[token]/page.tsx)
/login                                     (src/app/login/page.tsx)
/auth/callback/implicit                    (src/app/auth/callback/implicit/page.tsx)

--- Routegroep: yoga (apart gemarkeerd, zoals gevraagd) ---
/yoga                                      (src/app/yoga/page.tsx)
/yoga/[style]                              (src/app/yoga/[style]/page.tsx — 5 gepubliceerde slugs: yoga-nidra, irest, restorative-yoga, yin-yoga, flow-yoga)
/yoga/docenten                             (src/app/yoga/docenten/page.tsx)
/yoga/docenten/[slug]                      (src/app/yoga/docenten/[slug]/page.tsx — 4 docenten in Sanity, waarvan 3 isActive: kim, bionda, annouschka; connie isActive:false en dus niet statisch gegenereerd)
/yoga/rooster                              (src/app/yoga/rooster/page.tsx)

--- Gevonden, niet geëxtraheerd (zie §3) ---
/checkin                                   (src/app/checkin/page.tsx)
/studio/[[...tool]]                        (src/app/studio/[[...tool]]/page.tsx)
```

Daarnaast bestaat `src/app/llms.txt/route.ts` — geen `page.tsx`, geen HTML-pagina; zie §3.

**Global chrome** (gerenderd op vrijwel elke bovenstaande route via `SiteShell`/root `layout.tsx`, dus niet per-pagina herhaald in de TSV): Navbar, CampaignTeaser, Footer, FooterCTA, InfoOptInBanner, CookieConsent, root-metadata, JSON-LD (`GymOrHealthClub` + `WebSite`). Uitgesloten van deze chrome (eigen of geen chrome): `/login`, `/checkin`, `/12-weken-programma(+intake)`, `/betaal/[token]`, `/studio` — zie `src/components/layout/SiteShell.tsx`.

---

## 2. Strings per route + verdeling over bronsoort

| Route | Totaal strings | code | sanity | database |
|---|---:|---:|---:|---:|
| `_global` (Navbar/Footer/CookieConsent/InfoOptInBanner/FooterCTA/root-metadata/JSON-LD) | 66 | 66 | 0 | 0 |
| `_meta` (extractie-metadata, geen paginacopy) | 2 | 2 | 0 | 0 |
| `/` | 101 | 79 | 19 | 3 |
| `/aanbod` | 81 | 81 | 0 | 0 |
| `/prijzen` | 71 | 62 | 0 | 9 |
| `/abonnement` | 91 | 88 | 0 | 3 |
| `/proefles` | 38 | 38 | 0 | 0 |
| `/proefles/boeken` | 13 | 12 | 0 | 1 |
| `/proefles/boeken/bedankt` | 10 | 10 | 0 | 0 |
| `/proefles/annuleren/[token]` | 10 | 10 | 0 | 0 |
| `/contact` | 35 | 35 | 0 | 0 |
| `/over` | 44 | 39 | 5 | 0 |
| `/early-member` | 85 | 84 | 0 | 1 |
| `/beweeg-beter` | 18 | 18 | 0 | 0 |
| `/beweeg-beter/bedankt` | 7 | 7 | 0 | 0 |
| `/mobility-reset` | 26 | 26 | 0 | 0 |
| `/mobility-reset/bedankt` | 7 | 7 | 0 | 0 |
| `/mobility-check` | 46 | 46 | 0 | 0 |
| `/mobility-check/bedankt` | 7 | 7 | 0 | 0 |
| `/rooster` | 32 | 31 | 0 | 1 |
| `/privacybeleid` | 64 | 64 | 0 | 0 |
| `/12-weken-programma` | 74 | 73 | 0 | 1 |
| `/12-weken-programma/intake` | 17 | 17 | 0 | 0 |
| `/betaal/[token]` | 32 | 31 | 0 | 1 |
| `/login` | 19 | 19 | 0 | 0 |
| `/auth/callback/implicit` | 2 | 2 | 0 | 0 |
| `/yoga` | 34 | 32 | 2 | 0 |
| `/yoga/[style]` | 18 | 8 | 10 | 0 |
| `/yoga/docenten` | 5 | 5 | 0 | 0 |
| `/yoga/docenten/[slug]` | 11 | 5 | 6 | 0 |
| `/yoga/rooster` | 8 | 7 | 0 | 1 |
| **Totaal** | **1074** | **1011** | **42** | **21** |

`sanity`-rijen zijn representatief geteld: bij `/yoga/[style]` bijvoorbeeld staat één rij voor "alle FAQ's van deze stijl" (het aantal varieert per stijl van 3 tot 3, telkens 3), niet één rij per los FAQ-paar over de 5 stijlen × 4 docenten. Zie de TSV-kolom `bron` voor het exacte Sanity-veld; de kolom `tekst` bevat waar zinvol de werkelijke, opgehaalde inhoud (bijv. Marlons bio, alle vijf yogastijl-definities), niet alleen "komt uit Sanity".

---

## 3. Gevonden, niet geëxtraheerd

| Route/bestand | Reden |
|---|---|
| `/checkin` | Publieke route (geen auth), maar een fysiek tablet-kiosk-scherm voor de studio-incheck, geen marketingcopy. Al expliciet uitgesloten van site-chrome (`SiteShell.tsx`) en van `robots.txt`. Bevestigd door de code-comment in `src/app/checkin/page.tsx`: "Publieke tablet-route... de tablet staat fysiek in de studio." |
| `/studio/[[...tool]]` | Sanity Studio — het CMS-bewerkingsscherm zelf (Sanity's eigen UI, niet TMC-auteurscopy). Analoog aan "/admin" uit de opdracht se scope-uitsluiting. |
| `src/app/llms.txt/route.ts` | Geen `page.tsx`/HTML-pagina maar een machine-leesbare plaintext-feed voor AI-crawlers (`Content-Type: text/plain`). De inhoud is grotendeels samengesteld uit elders al geëxtraheerd Sanity-materiaal (yogaStyle.definition, yogaTeacher.specialty). Bevat wél één unieke hardcoded introregel ("Boutique yogastudio in Loosdrecht...") die nergens anders voorkomt — gemeld hier voor de volledigheid, niet in de TSV opgenomen omdat het geen bezoekerspagina is. |

Geen enkele in-scope route (`/`, `/aanbod`, `/prijzen`, `/abonnement`, alles onder `/proefles`, `/contact`, `/over`, `/early-member`, de lead-magnetpagina's, `/rooster`, `/privacybeleid`, `/12-weken-programma` (+`/intake`), `/betaal/[token]`, `/login`, `/auth/callback/implicit`, en de volledige `/yoga`-routegroep) is overgeslagen.

---

## 4. Bevindingen buiten de gevraagde categorieën

Dit zijn geen strings, maar structurele observaties die tijdens de extractie naar voren kwamen. Ze passen niet in de kolommen van de TSV maar zijn relevant voor wie deze inventarisatie gebruikt om copy te herschrijven of te synchroniseren met Sanity:

1. **Sanity `faq`-documenttype bestaat en is gevuld, maar wordt nergens live gerenderd.** `getFaqs()` (`sanity/lib/fetch.ts`) en `faqsByPageQuery` zijn gedefinieerd maar hebben geen enkele call-site in `src/`. De FAQ-content voor `page: "aanbod"` en `page: "mobility-check"` in Sanity is **woordelijk identiek** aan de hardcoded `faqs`-arrays in `AanbodContent.tsx` en `MobilityCheckContent.tsx` — vermoedelijk ooit uit Sanity gekopieerd naar code. Een wijziging in Sanity Studio heeft momenteel geen enkel effect op deze twee pagina's. De `page: "crowdfunding"`-FAQ's (7 stuks) zijn volledig wees: er is geen `/crowdfunding`-route meer.
2. **Sanity `pricingTier`- en `testimonial`-schema's** (genoemd in CLAUDE.md's schema-lijst) hebben **geen enkele fetch-functie** in `sanity/lib/fetch.ts` of `queries.ts`. Live prijzen komen uitsluitend uit `tmc.catalogue` (Supabase); live testimonials komen uitsluitend uit de Featurable/Google Reviews-widget (`TestimonialCarousel.tsx`, `FEATURABLE_WIDGET_ID`). Deze twee Sanity-schema's lijken dode/ongebruikte content-types.
3. **`OFFERINGS` en `TESTIMONIALS` in `src/lib/constants.ts`** worden nergens geïmporteerd (bevestigd via grep) — dode code. `getOfferings()` s fallback verwijst wél naar `OFFERINGS`, maar alleen als de Sanity-fetch faalt. Niet opgenomen in de TSV omdat ze niet user-facing zijn (nooit gerenderd onder normale omstandigheden).
4. **Openingstijden hebben twee inconsistente bronnen.** De homepage (`ContactSection.tsx`) leest live uit Sanity `openingHours`. `/contact` (`ContactContent.tsx`) heeft dezelfde tijden **hardcoded** in JSX ("Maandag – vrijdag: 07:00 – 21:00" etc.). Een wijziging van de openingstijden in Sanity werkt dus wel door op de homepage maar niet op `/contact`.
5. **`/mobility-reset`'s dagprogramma wijkt af van de eerder gedocumenteerde plannen.** De `days`-array in `MobilityResetContent.tsx` ("Heupen & Onderrug", "Schouders & Thoracic", "Adem & Core", "Enkels & Voeten", "Full Body Flow", "Strength Basics", "Jouw Volgende Stap") komt niet overeen met de dag-thema's die in CLAUDE.md staan beschreven ("Maak je heupen los", "Open je schouders", enz.) — de daadwerkelijk gerenderde tekst in de TSV is leidend, CLAUDE.md is op dit punt gedateerd.
6. **`/privacybeleid` is expliciet een concept-document, geen gepubliceerde juridische tekst.** De code-comment bovenaan `PrivacybeleidContent.tsx` zegt letterlijk dat dit door een jurist/AVG-specialist getoetst moet worden vóór publicatie, met name de bewaartermijn- en gezondheidsgegevens-secties. Dit is dus geen gewone "COPY: confirm met Marlon" (die impliceert een marketing-blik); de `copy_marker`-kolom is voor deze route leeg gelaten omdat het geen los `// COPY:`-commentaar per string betreft, maar één document-brede waarschuwing.
7. **`/betaal/[token]`, `/proefles/annuleren/[token]` en `/12-weken-programma/intake`'s bevestigingsstaat zijn nooit publiek gelinkt** (bereikbaar via token-links per e-mail/WhatsApp of alleen na formulierinzending) — geen navigatiegat, wel relevant om te weten bij het doorzoeken van de inventarisatie: deze strings zijn niet vindbaar door gewoon door de site te klikken.

---

## Samenvatting

- **Totaal aantal geëxtraheerde strings: 1074** (excl. de 2 `_meta`-rijen voor commit-hash/tijdstip).
- **Bronsoort-verdeling:** 1011 code, 42 sanity, 21 database (`tmc.catalogue`/`tmc.orders`).
- **Routes gevonden maar niet geëxtraheerd:** `/checkin` (staff-kiosk) en `/studio` (Sanity Studio CMS-tool), beide met reden in §3.
- **Buiten de gevraagde categorieën gevonden:** vijf contentbron-anomalieën (§4, punt 1–5: dode/ongesynchroniseerde Sanity-content naast hardcoded duplicaten, en een gedateerde CLAUDE.md-beschrijving), plus twee bijzondere statussen die het waard zijn te vermelden (§4, punt 6–7: het privacybeleid is een ongepubliceerd concept, en drie routes zijn alleen via directe/token-links bereikbaar, niet via de nav).
