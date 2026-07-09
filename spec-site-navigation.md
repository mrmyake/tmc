# Spec: Marketing site navigatie + campagne-teaser

## Status

**BESLIST, klaar om als CC-prompt uit te voeren** (2026-07-09). Twee gekoppelde onderdelen in de site-chrome: (1) herstructurering van de hoofdnavigatie en (2) een site-wide campagne-teaser boven de nav. Ze zitten in één spec/PR omdat ze allebei in de header/layout leven en allebei campagne-datum-afhankelijk zijn (Early Member-slot en teaser delen dezelfde datum-bron).

Geen Supabase-werk. Geen schema-wijziging, geen RPC, geen migratie. Dit is frontend/content.

De `/programma`-pagina die in de nieuwe Aanbod-hub verschijnt, heeft een eigen spec (`spec-programma-pagina.md`); deze spec linkt er alleen naartoe.

---

## 1. Navigatie-herstructurering

### Wat er nu is

De huidige balk heeft acht tekst-items naast elkaar: Home, Over ons, Aanbod, Prijzen, Early Member, Yoga, Contact, Inloggen, plus de CTA "Plan je proefles". Dat is te veel voor de boutique-positionering, en drie dingen zitten op de verkeerde plek: Yoga staat top-level terwijl het een sub-pijler van Groepslessen is, Inloggen zit midden in de verkoopreis, en Aanbod is een platte pagina in plaats van een hub.

### Beslist

**Zes primaire items, in deze volgorde:** Home, Aanbod, Prijzen, Early Member, Over ons, Contact.

**Aanbod wordt een hub** (dropdown op desktop, uitklap op mobiel), met deze onderdelen:
- Groepslessen (yoga, mobility, kettlebell)
- Vrij trainen
- All Access
- Personal Training & Duo
- 12-weken programma, linkt naar `/programma`

**Yoga verdwijnt uit de top-level maar houdt zijn eigen pagina** op `/yoga`. Die URL blijft bestaan (SEO op "yoga Loosdrecht" + Marlons yoga-merk) en wordt vanuit de Aanbod-hub onder Groepslessen ontsloten. Alleen het top-level menu-item vervalt; de route en de pagina niet.

**Utility-zone, rechts, visueel los van de primaire reis:**
- Inloggen, dit wordt "Ga naar app" zodra er een ingelogde Supabase-sessie is.
- CTA "Plan je proefles".

**Early Member is een campagneslot, geen vaste pijler.** Het staat prominent in het hoofdmenu zolang de campagne loopt. Na de deadline (zie datum-config) verandert het slot in "Word lid" of verdwijnt het. Bouw het slot zo dat die overgang via dezelfde campagne-fase-logica loopt als de teaser, niet als losse hardcoded link.

### Technische vorm (voorstel, CC bevestigt in discovery)

- De labels zijn user-facing Dutch copy: allemaal `// COPY: confirm met Marlon`, ook al zijn de meeste bestaande labels.
- "Ga naar app"-swap: detecteer de sessie server-side in de layout/header (zelfde mechaniek als elders in de marketing-site voor auth-state), geen client-side flicker.
- Mobiel: de zes primaire items + de Aanbod-uitklap moeten in het bestaande mobiele menu passen; de utility-zone (Inloggen/Ga naar app + Plan je proefles) blijft ook mobiel bereikbaar.

---

## 2. Campagne-teaser (site-wide bar)

### Wat er nu is

Geen teaser/announcement-bar in de site. De Early Member-communicatie leeft alleen op `/early-member`.

### Beslist

**Een slanke bar helemaal bovenaan, boven de nav, op elke pagina.** Reden voor site-wide in plaats van alleen de homepage-hero: bezoekers komen via advertenties en socials net zo goed direct op `/aanbod`, `/prijzen` of `/early-member` binnen; een bar boven de nav is overal zichtbaar. De bar is **dismissable** (client-side onthouden), maar komt terug bij een fase-overgang zodat de "we zijn open"-boodschap niemand ontgaat.

**Drie fases, gestuurd door één datum-config** (gedeeld met de Early Member-afteller op `/early-member`, zie hieronder):

1. **Vóór opening** (nu tot `OPENING_DATE`): "Binnenkort open in Loosdrecht. Word Early Member en profiteer als eerste mee."
2. **Open, Early Member nog beschikbaar** (`OPENING_DATE` tot `EARLY_MEMBER_DEADLINE`): "We zijn open. Early Member nog beschikbaar tot [EARLY_MEMBER_DEADLINE]."
3. **Na deadline**: bar verdwijnt; het Early Member-menuslot verandert mee (zie §1).

Alle drie de teksten zijn placeholders: `// COPY: confirm met Marlon`. De bar linkt naar `/early-member`.

### Datum-config, single source of truth

**Dit is het belangrijkste architectuurpunt van deze PR.** De teaser-fase, het Early Member-menuslot en de afteller op `/early-member` moeten van dezelfde datum-bron lezen, anders lopen ze uiteen.

- CC zoekt in discovery of de Early Member-afteller (de besloten vervanging van de plekken-teller op `/early-member`) al een deadline-bron heeft. Zo ja: die bron is de single source, hergebruiken.
- Zo niet: CC maakt een gedeelde module, voorstel `src/lib/campaign.ts`, met twee waarden en een fase-helper:
  - `OPENING_DATE` = medio augustus 2026 (placeholder, exacte datum bevestigen)
  - `EARLY_MEMBER_DEADLINE` = 1 oktober 2026 (placeholder)
  - `getCampaignPhase(now)` retourneert `'pre-open' | 'open-em' | 'closed'`
- De teaser, het menuslot en de `/early-member`-afteller consumeren allemaal `getCampaignPhase()` / deze constanten. Nergens een tweede hardcoded datum.
- Toekomstige optie (niet nu bouwen, wel noemen in het rapport): deze twee datums naar Sanity `siteSettings` verplaatsen zodat Marlon ze zonder deploy kan schuiven. Voor nu een TS-constant met placeholder.

### Technische vorm (voorstel, CC bevestigt in discovery)

- Dismiss-persistentie via cookie of `localStorage`, met een key die de fase bevat (bijv. `tmc_teaser_dismissed_<phase>`), zodat een nieuwe fase de bar opnieuw toont.
- Respecteer `prefers-reduced-motion` als de bar een intro-animatie krijgt.
- De datum-placeholder in fase 2 wordt geformatteerd getoond (bijv. "1 oktober"), niet als ruwe ISO-string.

---

## Uit scope

- De volledige `/early-member`-pagina-opbouw (feature-grid, prijsvergelijking, programmakaarten, overstapaanbod, MailerLite-optin, restitutie-footer). Aparte werkstroom. Deze PR raakt `/early-member` alleen als daar al een deadline-bron leeft die hergebruikt wordt, of levert die bron voor die pagina op.
- De `/programma`-pagina zelf (eigen spec).
- Exacte copy voor menu-labels en de drie teaser-teksten: placeholders, `// COPY: confirm met Marlon`.
- Verplaatsen van de datum-config naar Sanity: latere optie.

## Beslissingenlog (2026-07-09)

1. Zes primaire menu-items (Home, Aanbod, Prijzen, Early Member, Over ons, Contact); Aanbod wordt hub.
2. Yoga uit top-level, `/yoga` blijft bestaan onder Groepslessen.
3. Utility-zone rechts: Inloggen (wordt "Ga naar app" bij sessie) + CTA Plan je proefles.
4. Early Member = tijdelijk campagneslot, verandert/verdwijnt na deadline via campagne-fase-logica.
5. Teaser = site-wide bar boven de nav, dismissable, drie fases.
6. Eén datum-config als single source of truth voor teaser + menuslot + `/early-member`-afteller. Placeholder: opening medio aug 2026, deadline 1 okt 2026.
