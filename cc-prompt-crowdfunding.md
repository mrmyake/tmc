# Claude Code Prompt — TMC Crowdfunding Module

## Opdracht

Bouw de crowdfunding module voor The Movement Club website. Lees eerst `tmc-crowdfunding-module.md` in de project root voor de volledige spec. Dit document beschrijft alle tiers, functionaliteit, Sanity schemas, Supabase tabellen en Mollie integratie.

## Belangrijk: Analyseer eerst, bouw dan

### Stap 0 — Codebase begrijpen

Voordat je ook maar één regel schrijft:

1. Lees `CLAUDE.md` in de project root (als die bestaat) voor project-context
2. Lees `tmc-crowdfunding-module.md` volledig door
3. Analyseer het bestaande design system:
   - Bekijk `tailwind.config.ts` voor kleuren, fonts, spacing
   - Bekijk `app/globals.css` voor CSS variabelen en custom classes
   - Bekijk `app/layout.tsx` voor de root layout, fonts, navbar en footer
   - Bekijk 2-3 bestaande pagina's (bijv. `app/page.tsx`, `app/aanbod/page.tsx`) voor patronen: hoe worden secties opgebouwd, welke componenten worden hergebruikt, hoe wordt Sanity data gefetcht
   - Bekijk `lib/sanity.ts` of `sanity/lib/client.ts` voor de bestaande Sanity client configuratie
   - Bekijk `sanity/schemas/index.ts` voor de huidige schema registratie
   - Bekijk bestaande componenten in `components/` voor design patronen (buttons, cards, animaties)
   - Check of er een Supabase client bestaat in `lib/` of `utils/`
4. Noteer het bestaande design system: exacte kleurnamen, font families, border radiuses, spacing scale, button stijlen, card stijlen, animatie patronen
5. Check welke packages al geïnstalleerd zijn in `package.json` (framer-motion, @supabase/supabase-js, etc.)

**Bouw NIETS voordat je dit hebt gedaan. Het design van de crowdfunding pagina moet 100% consistent zijn met de rest van de site.**

### Stap 1 — Sanity Schemas

Maak de nieuwe schemas aan en registreer ze:

1. `sanity/schemas/crowdfundingTier.ts` — zoals beschreven in de spec
2. `sanity/schemas/crowdfundingSettings.ts` — zoals beschreven in de spec
3. Update `sanity/schemas/index.ts` — voeg beide toe
4. Update `sanity.config.ts` — voeg Crowdfunding Instellingen (singleton) en Crowdfunding Tiers toe aan de Studio structuur, met een divider erboven
5. Update `sanity/schemas/faq.ts` — voeg `{ title: "Crowdfunding", value: "crowdfunding" }` toe aan de page options list

### Stap 2 — Supabase

Genereer een SQL migration file `supabase/migrations/crowdfunding.sql` met de drie tabellen uit de spec:
- `crowdfunding_backers`
- `crowdfunding_stats`  
- `crowdfunding_tiers`

Maak ook een Supabase client helper als die nog niet bestaat.

Seed de `crowdfunding_tiers` tabel met de 9 tier IDs uit de spec (first-move, flow, kickstart, momentum, the-squad, all-in, power-move, legacy, the-original) met `slots_claimed = 0`.

### Stap 3 — Data fetching layer

Maak een `lib/crowdfunding.ts` (of vergelijkbaar, volg het bestaande patroon) met:

- `getCrowdfundingSettings()` — haalt settings op uit Sanity
- `getCrowdfundingTiers()` — haalt tiers op uit Sanity, gesorteerd op order
- `getCrowdfundingFAQs()` — haalt FAQ's op met filter `page == "crowdfunding"`
- `getCrowdfundingStats()` — haalt live stats op uit Supabase (total_raised, total_backers)
- `getTierAvailability()` — haalt slots_claimed per tier op uit Supabase

Gebruik dezelfde Sanity client en GROQ query patronen als de rest van de codebase.

### Stap 4 — Crowdfunding pagina (`app/crowdfunding/page.tsx`)

Bouw de pagina op volgens de structuur in de spec. **Gebruik het bestaande design system van de site.** Concreet:

- Gebruik dezelfde kleuren, fonts, en spacing als de rest van de site
- Gebruik bestaande componenten waar mogelijk (buttons, containers, section wrappers)
- Volg hetzelfde animatie-patroon (Framer Motion) als andere pagina's
- De pagina moet aanvoelen als dezelfde site, niet als een losstaande landingspagina

**Secties (top-to-bottom):**

1. **Hero** — Headline + subline uit Sanity, progress bar met live data uit Supabase, countdown timer berekend uit endDate, CTA button naar tiers
2. **Het Verhaal** — Rich text uit Sanity, budget breakdown met iconen
3. **Aanbod overzicht** — Kort visueel overzicht van wat TMC biedt (iconen + tekst)
4. **Tier cards** — Grid layout, responsive (1/2/3 kolommen). Elke card toont: naam, tagline, prijs (groot) met doorgestreepte normale prijs, includes als checklist, beschikbaarheidsbalk (Sanity maxSlots vs Supabase slots_claimed), badge, CTA button. De ALL IN card krijgt highlight styling. Uitverkochte tiers worden gedempt.
5. **Social proof** — Live backer feed uit Supabase (voornaam + eerste letter)
6. **FAQ** — Accordion, data uit Sanity met filter crowdfunding
7. **Footer CTA** — Progress bar herhaling, share buttons (WhatsApp primair)

**Design richtlijnen voor de cards:**
- Premium, donker, high-end
- Hover: subtiele lift + shadow
- Badge als label/ribbon bovenaan
- De highlighted card (ALL IN) moet visueel opvallen: accent border, badge, licht opgeheven
- Prijs groot en prominent
- "Kies deze tier" als CTA per card → opent checkout modal of redirect

### Stap 5 — Checkout flow

1. **Checkout formulier** — modal of aparte stap na tier selectie. Vraagt: naam, email, telefoon (optioneel). Kan ook inline op de pagina als dat beter past bij het design.
2. **API route `app/api/crowdfunding/checkout/route.ts`**:
   - Valideert input
   - Haalt prijs op uit Sanity (server-side, nooit uit client request)
   - Checkt beschikbaarheid in Supabase
   - Maakt Mollie payment aan
   - Slaat pending backer op in Supabase
   - Redirect naar Mollie checkout
3. **Webhook `app/api/crowdfunding/webhook/route.ts`**:
   - Ontvangt Mollie webhook
   - Update backer status naar 'paid'
   - Increment slots_claimed in crowdfunding_tiers
   - Update crowdfunding_stats (total_raised, total_backers)
   - Optioneel: voeg backer toe aan MailerLite groep (MAILERLITE_CROWDFUNDING_BACKER_GROUP_ID env var bestaat al)

### Stap 6 — Bedankpagina (`app/crowdfunding/bedankt/page.tsx`)

- Confetti animatie (gebruik canvas-confetti of een lichtgewicht alternatief)
- Titel en tekst uit Sanity crowdfundingSettings
- Tier overzicht (uit query params)
- Share buttons: WhatsApp (groot, pre-filled tekst uit Sanity), Instagram, Facebook, kopieer link
- Terug naar homepage button

### Stap 7 — Real-time updates

- Supabase real-time subscription op `crowdfunding_stats` voor live progress bar
- Of: polling elke 30 seconden als real-time te complex is voor v1
- Progress bar en backer count moeten updaten zonder page refresh

## Constraints

- **Scope**: Alleen `/crowdfunding` en `/crowdfunding/bedankt`. Raak GEEN bestaande pagina's, componenten of styling aan. Geen homepage wijzigingen. Geen /tarieven of andere nieuwe pagina's.
- **Pricing conventie**: Check of de codebase "per maand" of "per 4 weken" gebruikt en volg die conventie
- **Euro formatting**: Volg de bestaande `formatEuro()` helper als die bestaat
- **Taal**: Alle UI tekst in het Nederlands
- **Geen nieuwe dependencies** tenzij strikt noodzakelijk. Gebruik wat er al is (framer-motion, @sanity/client, etc.). Mollie (`@mollie/api-client`) en confetti library mogen wel toegevoegd worden.
- **Environment variables**: MOLLIE_API_KEY, SUPABASE vars, MAILERLITE vars staan al in Vercel. Voeg een `.env.example` toe met alle benodigde vars voor de crowdfunding module.
- **Error handling**: Elke API route moet try/catch hebben met correcte error responses. De Mollie webhook moet idempotent zijn.
- **Mobile-first**: De pagina moet er op mobiel minstens zo goed uitzien als op desktop. WhatsApp share button prominent op mobiel.

## Wat er NIET moet gebeuren

- Bestaande pagina's of componenten aanpassen
- Homepage hero of CTA wijzigen
- PricingTable component aanpassen
- Nieuwe pagina's buiten /crowdfunding bouwen
- Placeholder/dummy data hardcoden in componenten (alles uit Sanity/Supabase)
- Generic fonts gebruiken (geen Inter, Roboto, Arial — gebruik wat de site al heeft)
- Een los design maken dat niet past bij de rest van de site

## Volgorde samengevat

0. Analyseer codebase en design system
1. Sanity schemas + studio config
2. Supabase migration
3. Data fetching helpers
4. Crowdfunding pagina met alle secties
5. Checkout flow (API routes + Mollie + webhook)
6. Bedankpagina
7. Real-time updates
8. Test: `npm run build` moet slagen zonder errors
