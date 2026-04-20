# TMC Pricing Update — Canonical Source of Truth + CC Briefing

**Versie:** 1.0 · **Datum:** 20 april 2026
**Toepassing:** Crowdfunding-campagne + themovementclub.nl website

Dit document is de **single source of truth** voor alle TMC-prijzen. Alle externe communicatie (crowdfunding, website, social, PDF-guides, e-mail sequences) moet 1-op-1 matchen met wat hieronder staat. Wanneer prijzen in de toekomst wijzigen, update je eerst dit document en vervolgens alle downstream bronnen.

---

## 1. Positioneringscontext (niet wijzigen zonder akkoord)

TMC is een **boutique-binnen-boutique** fitness- en bewegingsclub in Loosdrecht. Premium segment, kleinschalig, specialistisch. Directe referentie in de markt: Lakeside Gym (5 km). TMC zit op vergelijkbare producten 10-20% boven Lakeside; op signature-producten (Kettlebell Club, Mobility, PT met Marlon) is TMC premium geprijsd.

Pricing-filosofie:
- Transparant, geen verborgen kosten
- Prijzen communiceren per 4 weken (Nederlandse boutique-norm, niet per maand)
- Strippenkaart voor flex, abonnement voor commitment — bij 8+ bezoeken/4wk wint het abo altijd
- Geen kortingsacties op reguliere prijzen; alleen Founding Member-lock-in via crowdfunding

---

## 2. Canonieke prijzen

### 2.1 Losse lessen & rittenkaarten

| Product | Prijs | Prijs per les | Geldigheid |
|---|---|---|---|
| Losse les (drop-in) | €20,- | €20,- | n.v.t. |
| 10-rittenkaart | €170,- | €17,- | 4 maanden |
| 10-rittenkaart Crowdfunding Early Bird | €150,- | €15,- | 4 maanden |

### 2.2 Abonnementen (prijzen per 4 weken)

| Abonnement | 2x / week | 3x / week | Onbeperkt |
|---|---|---|---|
| Yoga & Mobility | €65,- | €79,- | €95,- |
| Kettlebell Club (3x/wk aanbod) | — | — | €89,- |
| Alle Groepslessen | €89,- | €109,- | €129,- |
| Vrij Trainen (open gym) | €49,- | €59,- | €69,- |
| All Access (alles onbeperkt) | — | — | €149,- |

### 2.3 All Access commitment-tiers

| Commitment | Prijs / 4 weken | Jaarwaarde | Opzegtermijn |
|---|---|---|---|
| All Access Flex | €149,- | €1.937,- | 4 weken |
| All Access Jaar | €129,- | €1.677,- | 4 weken na 12 mnd |
| All Access 2-Jaar | €119,- | €1.547,- | 4 weken na 24 mnd |

### 2.4 Inschrijfkosten

| Situatie | Prijs |
|---|---|
| Standaard | €39,- |
| Bij jaar- of 2-jaarscontract | Kwijtgescholden |
| Crowdfunding Founding Member | Kwijtgescholden |

### 2.5 Personal Training met Marlon

| PT-format | Losse sessie | 10-rittenkaart | 20-rittenkaart |
|---|---|---|---|
| 1-op-1 | €90,- | €800,- (€80/sessie) | €1.500,- (€75/sessie) |
| Duo (2 personen totaal) | €110,- | €1.000,- | €1.800,- |
| Duo (per persoon) | €55,- | €500,- (€50/sessie) | €900,- (€45/sessie) |
| Small Group PT (4 personen totaal) | €120,- | €1.100,- | €2.000,- |
| Small Group PT (per persoon) | €30,- | €275,- (€27,50/sessie) | €500,- (€25/sessie) |

**Weekend-premium:** +€15,- op losse 1:1 sessies zaterdag/zondag. Geen premium op rittenkaarten.
**Ledenkorting:** 10% op PT-rittenkaarten voor actieve abonnementshouders.

### 2.6 Crowdfunding Founding Member perks

| Perk | Aantal plekken | Prijs | Voordeel |
|---|---|---|---|
| Founding Member All Access Lifetime Lock-in | 25 | €99,- / 4 weken voor altijd | €50,- korting p/4wk levenslang = €650 p/jaar |
| Founding Member 12-maanden All Access | 50 | €1.200,- vooruit | €737,- korting op jaartarief + 2 PT sessies t.w.v. €180,- |
| Founder's 10-rittenkaart + PT-intake | onbeperkt | €175,- | €150,- strippenkaart + gratis 1-op-1 intake (€90 waarde) |

*Let op: "Lifetime" = zolang het abonnement onafgebroken loopt. Opzegging = lock-in vervalt.*

---

## 3. CC Briefing — wat moet er geüpdatet worden

Geef deze hele briefing aan Claude Code in een nieuwe sessie. Begin de sessie in de directory die zowel je crowdfunding- als website-projecten bevat.

### 3.1 Scope

Twee projecten moeten consistent geüpdatet worden:

1. **Crowdfunding-campagne** — tekst/markdown/notion export/PDF-drafts voor de crowdfunding (bijv. WeKomenInActie / Voordekunst / platform-copy, pitch deck, e-mail sequence, social teasers)
2. **Website themovementclub.nl** — Next.js 14+ / Tailwind CSS 4 / Framer Motion / Vercel. Pricing sections, tarievenpagina, hero CTA's, FAQ, lead magnet PDF

### 3.2 CC execution prompt (plak deze letterlijk)

```
Ik ga de prijsstelling van The Movement Club definitief maken. Dit moet
consistent doorgevoerd worden in (1) de crowdfunding-materialen en (2) de
website themovementclub.nl. 

STAP 1 — DISCOVERY
Scan beide codebases/directories en geef me een overzicht van ALLE plekken
waar nu hypothetische/placeholder prijzen staan. Zoek op:
- Numerieke bedragen in €-notatie (€XX, EUR XX, XX euro)
- Termen: "prijs", "tarief", "tarieven", "abonnement", "strippenkaart",
  "rittenkaart", "lidmaatschap", "PT", "personal training", "Founding Member",
  "per maand", "per 4 weken", "/mnd", "/4wk"
- Files: *.tsx, *.ts, *.jsx, *.js, *.mdx, *.md, *.json, *.yaml, *.html

Geef per file: pad + regelnummer + huidige prijs + context. Doe GEEN wijzigingen
in deze stap.

STAP 2 — PLAN
Ik lever je het canonieke pricing document (tmc-pricing-update-brief.md).
Maak op basis daarvan een diff-plan: per file, welke regel wordt wat. Toon
het plan aan mij voor akkoord voordat je wijzigt.

STAP 3 — EXECUTE
Na mijn akkoord: voer alle wijzigingen door. Commit per logisch blok
(crowdfunding apart van website). Commit-messages in formaat:
  "pricing: update [scope] to v1.0 canonical"

STAP 4 — VERIFY
Na de wijzigingen, herhaal de discovery-scan uit Stap 1 en rapporteer of er
nog placeholder-prijzen over zijn. Check ook:
- Consistentie: zelfde prijs overal voor hetzelfde product
- Valuta-notatie: altijd €XX,- (met lage streep, geen punt, geen ,00)
- Periodiciteit: altijd "per 4 weken" of "/4wk", nooit "per maand"
- Founding Member-aantallen kloppen met de canonieke bron
- Strippenkaart-geldigheid: altijd "4 maanden"

STAP 5 — PREVIEW
Start de dev server en screenshot de tarievenpagina + de crowdfunding-pagina.
Vergelijk visueel met het canonieke document.
```

### 3.3 Consistency-regels die CC moet afdwingen

Deze regels zijn hard. CC moet er niet van afwijken zonder expliciete vraag.

1. **Notatie:** `€XX,-` (euroteken, bedrag, komma, streepje). Dus `€149,-` niet `€149` of `€149.00` of `EUR 149`.
2. **Periode:** Alle abonnementen communiceren als **"per 4 weken"** of **"/4wk"**, nooit "per maand" of "p/m".
3. **Volgorde abonnementen op de website:** Van laag naar hoog per categorie:
   - Vrij Trainen → Yoga/Mobility → Kettlebell Club → Alle Groepslessen → All Access
4. **"Onbeperkt" = onbeperkt** binnen die categorie. Geen sterretjes of fair-use-clausules in de communicatie (regel dit via huisregels intern).
5. **Founding Member Lifetime**: altijd met disclaimer *"Zolang je abonnement onafgebroken loopt"*. Nooit zonder.
6. **Inschrijfkosten**: altijd €39,-. Kwijtschelding altijd expliciet vermeld bij jaar/2-jaar en Founding Member.
7. **PT weekend-premium**: alleen tonen op 1-op-1 losse sessie-prijs, niet op rittenkaarten.
8. **Crowdfunding Early Bird 10-rittenkaart (€150)**: dit is ALLEEN voor de crowdfundingcampagne. Mag NIET op de reguliere website-tarievenpagina verschijnen. Alleen op crowdfunding-pagina's en in de crowdfunding-e-mails.

### 3.4 Verplichte componenten om te checken (website)

- [ ] `/tarieven` pagina — volledige prijsmatrix
- [ ] Homepage hero — CTA met instapprijs (meest aantrekkelijke: "Vanaf €49,- per 4 weken")
- [ ] `/kettlebell-club` — landing page met Kettlebell Club-prijs
- [ ] `/yoga-mobility` — landing page met Y&M-prijzen
- [ ] `/personal-training` — PT-prijzen met Marlon
- [ ] Lead magnet PDF (Mobility Check funnel) — als daar prijzen in staan
- [ ] E-mail sequence templates (welcome, nurture, conversion) — prijsreferenties
- [ ] FAQ-sectie — "Wat kost een lidmaatschap?" / "Hoe werkt de strippenkaart?"
- [ ] Footer of pricing-widget — indien aanwezig
- [ ] Structured data (JSON-LD) — als Offer-schema gebruikt wordt voor SEO
- [ ] Meta descriptions — als daar prijzen in staan

### 3.5 Verplichte componenten om te checken (crowdfunding)

- [ ] Campagnepagina hoofdtekst
- [ ] Perk/reward beschrijvingen (prijs én waarde-uitleg)
- [ ] Pitch deck (indien in PDF/Keynote/Google Slides — CC kan markdown drafts updaten)
- [ ] Video-script (als prijzen gequote worden)
- [ ] Social announcement posts
- [ ] E-mail updates naar early subscribers
- [ ] FAQ-sectie op crowdfunding

---

## 4. Changelog

| Versie | Datum | Wijziging | Auteur |
|---|---|---|---|
| 1.0 | 2026-04-20 | Initiële canonieke prijsstelling vastgesteld | Ilja |

---

## 5. Kwaliteitscontrole-checklist (na CC-run)

Loop dit af voordat je de site live zet of de crowdfunding lanceert.

- [ ] `grep -r "€" .` in website-repo geeft alleen prijzen die in dit document staan
- [ ] Tarievenpagina geopend in staging/preview: alle 5 abo-categorieën zichtbaar in correcte volgorde
- [ ] Founding Member perks op crowdfunding-pagina tonen juiste aantal plekken (25 / 50 / onbeperkt)
- [ ] Op geen enkele reguliere website-pagina staat de €150-crowdfunding-strippenkaart
- [ ] Niet "per maand" of "p/m" ergens op de website
- [ ] PT-prijzen consistent tussen tarievenpagina en `/personal-training` landing
- [ ] Mobiele weergave van prijstabellen gecheckt (pricing tables breken vaak op mobile)
- [ ] JSON-LD structured data valideert in Google Rich Results Test
- [ ] Sitemap/metadata geüpdatet indien prijzen in meta descriptions stonden
