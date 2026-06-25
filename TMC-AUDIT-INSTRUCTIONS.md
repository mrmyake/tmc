# Hoe je de audit draait

Korte uitleg, hoort bij `TMC-FULL-AUDIT-PROMPT.md`.

## Wat dit document is

Eén prompt die je in een **lege Claude Code sessie** plakt. CC werkt 'm sequentieel af, fase per fase, en stopt na elke fase voor jouw review. Je krijgt aan het eind een rapport in `docs/audit/00-EXECUTIVE-REPORT.md` met:

- **The Good** — wat klopt en waarom
- **The Bad** — issues maar oplosbaar, gesorteerd op impact
- **The Ugly** — kritisch, blocking voor go-live
- **Missing** — wat in CLAUDE.md staat maar er nog niet is
- **SEO** — technisch, lokaal, content
- **AI discoverability** — robots.txt voor LLM-crawlers, structured data voor AEO, citatie-vriendelijkheid, llms.txt overweging, live tests in ChatGPT/Claude/Perplexity
- **UX vs design system** — per pagina, zes dimensies, tegen je skill `the-movement-club-design`

Plus een remediation roadmap (week A blockers, week B SEO+AI, week C UX+missing pages).

## Voorbereiding (5 min)

1. Check dat `CLAUDE.md` in de repo root actueel is. Als hij in `/mnt/user-data/outputs/` ligt en nog niet in de repo: kopieer 'm eerst.
2. Check dat de design-skill aanwezig is. Eén van deze paden moet `SKILL.md` bevatten:
   - `~/.claude/skills/the-movement-club-design/SKILL.md` (user-niveau)
   - `.claude/skills/the-movement-club-design/SKILL.md` (project-niveau)
3. Zorg dat je op `main` staat, geen unstaged changes. De audit maakt files in `docs/audit/` — die wil je in een schone working tree.

```bash
git checkout main
git pull
git status   # moet "nothing to commit" zeggen
```

## Sessie starten

1. Open een nieuwe Claude Code sessie in de TMC repo root.
2. Plak de **volledige inhoud** van `TMC-FULL-AUDIT-PROMPT.md` als eerste bericht.
3. Wacht. CC begint met fase 0.

## Wat te verwachten per fase

- **Fase 0** (15 min): inventory. CC schrijft `docs/audit/00-inventory.md`. In chat krijg je 5 regels samenvatting + `STOP — wacht op "go fase 1"`.
- **Fase 1** (~2 uur): de vier-luik audit. CC schrijft `01..04.md` in `docs/audit/`. Dit is de zware. Verwacht 50-100 concrete bevindingen.
- **Fase 2** (~1.5 uur): SEO + AI + UX. Schrijft `05..07.md`. Hier komt het AI-discoverability stuk.
- **Fase 3** (~1 uur): synthese. Schrijft `00-EXECUTIVE-REPORT.md`. Dit is je leesvoer.
- **Fase 4** (variabel): implementatie. **Alleen** als jij scope opgeeft.

Tussen fase 3 en fase 4 zit jouw beslissing: welke bevindingen wil je laten oplossen, in welke volgorde, en welke parkeer je voor later. CC doet niets ongevraagd.

## Trigger-zinnen

CC reageert op letterlijke triggers tussen fasen:

- `go fase 1`
- `go fase 2`
- `go fase 3`
- `go fase 4 met scope: [scope-omschrijving]` — bijvoorbeeld:
  - `go fase 4 met scope: alle The Ugly bevindingen plus alle placeholders`
  - `go fase 4 met scope: SEO quick wins`
  - `go fase 4 met scope: AI discoverability — robots.txt, llms.txt, structured data`
  - `go fase 4 met scope: UX-fixes voor /aanbod en /over`

Hou de scopes klein. Eén PR per scope. Makkelijker te reviewen, makkelijker terug te draaien.

## Wat je terugkrijgt

Aan het eind van fase 3 heb je in `docs/audit/`:

```
00-EXECUTIVE-REPORT.md     ← lees dit eerst
00-inventory.md
01-the-good.md
02-the-bad.md
03-the-ugly.md
04-missing.md
05-seo.md
06-ai-discoverability.md
07-ux-design-system.md
```

Het executive report is je leeslijst. De andere zeven zijn de evidence — open ze als je twijfelt over een conclusie of een file:line referentie wil checken.

## Een paar dingen om op te letten

**De prompt is bewust streng over read-only.** Fase 0-3 raken geen code aan. Dat klinkt traag, maar het is precies waar audits op stuk gaan: een goedbedoelde fix in component A veroorzaakt een regressie omdat context uit component B ontbrak. Eerst lezen, dan plannen, dan pas wijzigen.

**De AI-discoverability sectie is nieuw.** Klassiek SEO doe je voor Google. AI-discoverability doe je voor ChatGPT, Claude, Perplexity en Gemini. Concreet betekent het: crawlers expliciet toegang geven (in `robots.txt`), structured data uitbreiden voor `LocalBusiness`/`Service`/`FAQPage`, content schrijven die "citatie-vriendelijk" is (één duidelijke quote per pagina), en eventueel een `llms.txt` toevoegen. Voor een lokale boutique gym is dit veel waard — als iemand Claude vraagt "waar kan ik mobility doen in Loosdrecht", wil je daar genoemd worden.

**De UX-audit gebruikt jouw skill als waarheid.** Niet de mening van CC over wat "premium" voelt. Elke afwijking wordt teruggevoerd op een concreet token of regel uit `the-movement-club-design`. Als de skill iets niet voorschrijft, parkeert CC dat als open vraag in plaats van zelf in te vullen.

**Out of scope is expliciet.** De crowdfunding internals (Mollie, Supabase backers, tier-CMS) en het member systeem (`/app/*`, booking, check-in tablet, admin) zijn aparte audits. Die WIP-branch `pr3e-wip-slim-bookings-status` raak je sowieso niet aan totdat je 'm zelf merget.

**De rapport-structuur is af-test bedoeld.** Als CC een bevinding maakt die geen file/url-referentie heeft, is het geen bevinding. Als een aanbeveling geen impact-inschatting heeft, is het geen aanbeveling. Streng zijn hier scheelt later modder.

## Tijdsindicatie totaal

- Fase 0-3 doorlooptijd: 4-6 uur compute (afhankelijk van hoeveel CC fetches doet en hoe groot de codebase is geworden)
- Jouw inzet tussen fasen: 5-15 min review per fase
- Fase 4 per scope: 30 min tot 2 uur per scope, afhankelijk van breedte

Plan dus een halve werkdag voor fase 0-3, en daarna meerdere kortere sessies voor fase 4.

## Eén ding voor je begint

De audit gaat scherp zijn. Bevindingen kunnen voelen als kritiek terwijl ze gewoon werk-in-uitvoering zijn — een lijst van 80 bevindingen voor een site van vijf pagina's lijkt veel, maar de helft is meestal "missend item dat al bekend was uit CLAUDE.md" en een kwart is quick wins van 5 minuten. Lees het executive report, niet de zeven evidence-files. De evidence is om diep te duiken als je twijfelt aan een conclusie.

Als het rapport te abstract aanvoelt of bevindingen niet concreet zijn: dat is een prompt-bug, geen executie-bug. Stuur de prompt dan terug naar CC met "geef bij elke bevinding een file:line of url+selector reference, en herwerk."
