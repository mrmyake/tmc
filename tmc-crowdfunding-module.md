# The Movement Club — Crowdfunding Module

## Doel

Bouw een crowdfunding campagnepagina als onderdeel van de The Movement Club website (themovementclub.nl). De pagina moet bezoekers overtuigen om founding member te worden door een reward-tier te kiezen en te betalen via iDEAL (Mollie). Target: €50.000 ophalen voor de inrichting van een boutique gym in Loosdrecht.

---

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS 4
- **Animaties**: Framer Motion
- **Hosting**: Vercel
- **CMS**: Sanity (project: hn9lkvte, dataset: production) — al geïnstalleerd
- **Betalingen**: Mollie (iDEAL, creditcard, Bancontact)
- **Database**: Supabase (alleen voor backer tracking en live tellers)
- **Taal**: Nederlands

---

## Route

`/crowdfunding` — standalone pagina, maar onderdeel van de TMC site layout (navbar + footer).

---

## Pagina Structuur (top-to-bottom)

### 1. Hero Section

Content uit Sanity `crowdfundingSettings`:

- **Headline**: uit `headline` (default: "Make A Move")
- **Subline**: uit `subline`
- **Achtergrond**: uit `heroImage`. Placeholder nodig als er nog geen beeld is.
- **CTA button**: "Kies jouw tier" → smooth scroll naar tier-sectie
- **Progress bar** (data uit Supabase real-time):
  - Live teller: opgehaald bedrag / doelbedrag (uit `goal`)
  - Percentage indicator met animatie
  - Aantal backers
  - Dagen resterend (berekend uit `endDate`)
- **Design**: Donker, premium, past bij boutique gym branding. Geen stockfoto-vibe.

### 2. Het Verhaal (Why Section)

Content uit Sanity `crowdfundingSettings.story` (rich text) en `budgetItems`.

Fallback/default content voor initiële Sanity vulling:

- **Wie**: Marlon — ervaren trainer, bekend in Loosdrecht
- **Wat**: Een kleinschalige boutique gym met high-end equipment, groepslessen, yoga & mobility, personal training en online programma's. PT sessies door het team; Marlon persoonlijk alleen in de hoogste tier.
- **Waar**: Industrieweg 14P, Loosdrecht
- **Waarom crowdfunding**: "Geen anonieme investeerders. Wij bouwen deze gym samen met onze toekomstige leden. Make A Move."
- **Waar gaat het geld naartoe**: Kort visueel overzicht (bijv. icon + bedrag)
  - Equipment & inrichting: €30.000
  - Vloer, spiegels, afwerking: €10.000
  - Branding & signage: €5.000
  - Lancering & marketing: €5.000

### 3. Wat krijg je? (Aanbod overzicht)

Korte sectie met iconen die het TMC-aanbod samenvat:

- 🏋️ Vrij trainen op high-end equipment
- 🧘 Yoga & mobility classes
- 💪 Groepslessen (kracht, conditie, functioneel)
- 📱 Online trainingsschema's & programma's
- 🎯 Personal training met Marlon

### 4. Reward Tiers (hoofdsectie)

**Reguliere prijsstructuur (referentie voor kortingsberekening):**
- Vrij trainen abo: €90/maand (€1.080/jaar)
- Groepslessen abo: €105/maand
- Alles abo: €150/maand (€1.800/jaar)
- Yoga/mobility losse les: €15
- PT sessie: €95
- 12-weken programma: €2.409
- Online programma: €1.200 / 12 weken

Grid layout (responsive: 1 kolom mobiel, 2-3 kolommen desktop). Elke tier is een card.

Tier data wordt opgehaald uit Sanity `crowdfundingTier` documenten (gesorteerd op `order`). Beschikbaarheid (`slots_claimed`) komt uit Supabase. De JSON hieronder is de initiële data om in Sanity aan te maken:

#### Tier Data

```json
[
  {
    "id": "first-move",
    "name": "FIRST MOVE",
    "price": 29,
    "maxSlots": 50,
    "description": "Zet de eerste stap.",
    "includes": [
      "Naam op de Founders Wall in de gym"
    ],
    "highlight": false,
    "badge": null
  },
  {
    "id": "flow",
    "name": "FLOW",
    "price": 99,
    "maxSlots": null,
    "description": "Find your flow.",
    "includes": [
      "Strippenkaart: 10 yoga & mobility lessen",
      "Normaal €150 — 34% korting"
    ],
    "highlight": false,
    "badge": null
  },
  {
    "id": "kickstart",
    "name": "KICKSTART",
    "price": 129,
    "maxSlots": 50,
    "description": "Your move starts here.",
    "includes": [
      "1 maand full access",
      "Vrij trainen op high-end equipment",
      "Alle groepslessen, yoga & mobility",
      "Normaal €150 — 14% korting"
    ],
    "highlight": false,
    "badge": "EARLY BIRD"
  },
  {
    "id": "momentum",
    "name": "MOMENTUM",
    "price": 379,
    "maxSlots": 40,
    "description": "Drie maanden om je fundament te leggen.",
    "includes": [
      "3 maanden full access",
      "Vrij trainen, groepslessen, yoga & mobility",
      "Naam op Founders Wall",
      "Normaal €450 — 16% korting"
    ],
    "highlight": false,
    "badge": null
  },
  {
    "id": "the-squad",
    "name": "THE SQUAD",
    "price": 449,
    "maxSlots": 20,
    "description": "Move your crew.",
    "includes": [
      "4 personen × 1 maand full access",
      "Vrij trainen, groepslessen, yoga & mobility",
      "Squad foto op de Founders Wall",
      "Normaal €600 — 25% korting"
    ],
    "highlight": false,
    "badge": "GROEPSAANKOOP"
  },
  {
    "id": "all-in",
    "name": "ALL IN",
    "price": 1295,
    "maxSlots": 25,
    "description": "All in. No excuses.",
    "includes": [
      "12 maanden full access",
      "Vrij trainen, groepslessen, yoga & mobility",
      "Welkomspakket (t-shirt, shaker, band)",
      "Naam op Founders Wall",
      "Normaal €1.800 — 28% korting"
    ],
    "highlight": true,
    "badge": "POPULAIR"
  },
  {
    "id": "power-move",
    "name": "POWER MOVE",
    "price": 1995,
    "maxSlots": 10,
    "description": "Het complete 12-weken programma.",
    "includes": [
      "12-weken programma met een van onze trainers",
      "Meting + 2× PT per week",
      "Groepslessen, voedingsbegeleiding",
      "Trainingsschema op maat",
      "Normaal €2.409 — 17% korting"
    ],
    "highlight": false,
    "badge": null
  },
  {
    "id": "legacy",
    "name": "LEGACY",
    "price": 3495,
    "maxSlots": 10,
    "description": "Leave your mark. Full access, voor altijd.",
    "includes": [
      "Lifetime membership",
      "Vrij trainen, groepslessen, yoga & mobility",
      "Welkomspakket",
      "Founders Wall met gouden vermelding",
      "Breakeven na 23 maanden"
    ],
    "highlight": false,
    "badge": "LIFETIME"
  },
  {
    "id": "the-original",
    "name": "THE ORIGINAL",
    "price": 4995,
    "maxSlots": 3,
    "description": "Be the original. Jouw naam staat voor altijd in de gym.",
    "includes": [
      "Lifetime membership",
      "Gegarandeerd Marlon als jouw personal trainer",
      "Jaarlijks persoonlijk trainingsplan",
      "Eigen locker met naamplaatje",
      "Jouw naam op een apparaat",
      "Maandelijkse private session met Marlon",
      "Founding dinner voor de opening"
    ],
    "highlight": false,
    "badge": "3 BESCHIKBAAR"
  }
]
```

#### Card Design Specs

- Elke card toont: tier naam, prijs (groot), beschrijving, includes als checklist (✓ iconen), "Kies deze tier" CTA button, beschikbaarheid indicator ("12 van 50 geclaimd")
- De `highlight: true` card (ALL IN) krijgt een visuele accent: border glow, "POPULAIR" badge, iets groter of opgeheven
- Badge (EARLY BIRD, LIFETIME, etc.) als label/ribbon bovenaan de card
- Als een tier vol is (`slotsRemaining === 0`): card wordt gedempt, button wordt "Uitverkocht", niet klikbaar
- Beschikbaarheidsbalk per tier: visuele progress bar (bijv. 12/50 claimed)
- Hover effect: subtiele lift + shadow
- Prijs formatting: "€1.295" groot, daaronder "normaal €1.800" doorgestreept (bij tiers met korting)
- POWER MOVE card: subtitle "met een van onze trainers"
- THE ORIGINAL card: subtitle "gegarandeerd Marlon" als extra premium indicator

### 5. Social Proof / Backers Sectie

- Live feed van recente backers: "Naam koos [Tier] — 2 uur geleden"
  - Privacy: alleen voornaam + eerste letter achternaam (bijv. "Mark V.")
- Totaal aantal backers
- Optioneel: testimonial quotes van early backers (handmatig toe te voegen)

### 6. FAQ Sectie

Accordion/collapsible items. FAQ's worden opgehaald uit Sanity met filter `page == "crowdfunding"`. Onderstaande zijn de initiële items om in Sanity aan te maken:

- **Wanneer gaat de gym open?** — "We mikken op [datum]. Zodra de crowdfunding is afgerond starten we met de inrichting."
- **Wat als het doel niet gehaald wordt?** — "Dan krijg je je geld volledig terug. Geen risico."
- **Kan ik mijn tier upgraden?** — "Ja, neem contact op en we regelen het verschil."
- **Waar is The Movement Club?** — "Industrieweg 14P, Loosdrecht."
- **Wie is Marlon?** — Korte bio.
- **Wat houdt full access in?** — "Vrij trainen op alle equipment, alle groepslessen, yoga & mobility classes, en toegang tot het online programma."
- **Hoe werkt betaling?** — "Je betaalt eenmalig via iDEAL of creditcard. Geen abonnement, geen automatische incasso."

### 7. Footer CTA

- Herhaling progress bar
- "Doe mee" button → scroll naar tiers
- Countdown timer
- Social share buttons (WhatsApp, Instagram, Facebook, kopieer link)
  - WhatsApp is primair — grote knop, pre-filled bericht: "Ik heb mijn move gemaakt. Jij ook? 💪 Word founding member van The Movement Club in Loosdrecht: [link]"

---

## Functionaliteit

### Sanity CMS Integratie

De bestaande Sanity setup (project `hn9lkvte`) wordt uitgebreid met twee nieuwe schema's en een FAQ-aanpassing. Alle content is beheerbaar via Sanity Studio op `/studio`.

#### Nieuw schema: `crowdfundingTier` (`sanity/schemas/crowdfundingTier.ts`)

```typescript
import { defineType, defineField } from "sanity";

export default defineType({
  name: "crowdfundingTier",
  title: "Crowdfunding Tier",
  type: "document",
  fields: [
    defineField({ name: "tierId", title: "Tier ID", type: "string", description: "Unieke slug, bijv. 'all-in'. Wordt gebruikt voor Supabase koppeling." }),
    defineField({ name: "name", title: "Naam", type: "string", description: "Bijv. 'ALL IN'" }),
    defineField({ name: "tagline", title: "Tagline", type: "string", description: "Bijv. 'All in. No excuses.'" }),
    defineField({ name: "description", title: "Beschrijving", type: "text", rows: 2 }),
    defineField({ name: "price", title: "Prijs (in euro's)", type: "number" }),
    defineField({ name: "normalPrice", title: "Normale prijs (doorgestreept)", type: "number", description: "Leeg laten als er geen korting is" }),
    defineField({ name: "maxSlots", title: "Max beschikbaar", type: "number", description: "Leeg laten voor onbeperkt" }),
    defineField({
      name: "includes",
      title: "Wat zit erin",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "badge",
      title: "Badge",
      type: "string",
      description: "Bijv. 'EARLY BIRD', 'POPULAIR', 'LIFETIME', '3 BESCHIKBAAR'. Leeg = geen badge.",
    }),
    defineField({ name: "highlighted", title: "Uitgelicht", type: "boolean", initialValue: false }),
    defineField({ name: "active", title: "Actief", type: "boolean", initialValue: true }),
    defineField({ name: "order", title: "Volgorde", type: "number" }),
  ],
  orderings: [{ title: "Volgorde", name: "orderAsc", by: [{ field: "order", direction: "asc" }] }],
  preview: {
    select: { title: "name", subtitle: "tagline", price: "price" },
    prepare({ title, subtitle, price }) {
      return { title: `${title} — €${price}`, subtitle };
    },
  },
});
```

#### Nieuw schema: `crowdfundingSettings` (`sanity/schemas/crowdfundingSettings.ts`)

```typescript
import { defineType, defineField } from "sanity";

export default defineType({
  name: "crowdfundingSettings",
  title: "Crowdfunding Instellingen",
  type: "document",
  fields: [
    defineField({ name: "active", title: "Campagne actief", type: "boolean", initialValue: false, description: "Zet op true om de crowdfunding pagina live te zetten" }),
    defineField({ name: "goal", title: "Doelbedrag (euro's)", type: "number", initialValue: 50000 }),
    defineField({ name: "startDate", title: "Startdatum", type: "date" }),
    defineField({ name: "endDate", title: "Einddatum", type: "date" }),
    defineField({ name: "headline", title: "Headline", type: "string", initialValue: "Make A Move" }),
    defineField({ name: "subline", title: "Subline", type: "text", rows: 2 }),
    defineField({
      name: "heroImage",
      title: "Hero afbeelding",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "story",
      title: "Het verhaal",
      type: "array",
      of: [{ type: "block" }],
      description: "De storytelling sectie onder de hero",
    }),
    defineField({
      name: "budgetItems",
      title: "Waar gaat het geld naartoe",
      type: "array",
      of: [{
        type: "object",
        fields: [
          defineField({ name: "label", title: "Omschrijving", type: "string" }),
          defineField({ name: "amount", title: "Bedrag", type: "number" }),
        ],
      }],
    }),
    defineField({
      name: "whatsappShareText",
      title: "WhatsApp deeltekst",
      type: "string",
      initialValue: "Ik heb mijn move gemaakt. Jij ook? 💪 Word founding member van The Movement Club in Loosdrecht:",
    }),
    defineField({ name: "thankYouTitle", title: "Bedankpagina titel", type: "string", initialValue: "Welkom bij The Movement Club!" }),
    defineField({ name: "thankYouText", title: "Bedankpagina tekst", type: "text", rows: 3 }),
  ],
});
```

#### Bestaand schema aanpassen: `faq.ts`

Voeg `"crowdfunding"` toe aan de `page` options list:

```typescript
// In sanity/schemas/faq.ts, update het page field:
defineField({
  name: "page",
  title: "Tonen op pagina",
  type: "string",
  options: {
    list: [
      { title: "Aanbod", value: "aanbod" },
      { title: "Mobility Check", value: "mobility-check" },
      { title: "Crowdfunding", value: "crowdfunding" },  // NIEUW
      { title: "Algemeen", value: "algemeen" },
    ],
  },
}),
```

#### Schema registratie

Update `sanity/schemas/index.ts`:

```typescript
import crowdfundingTier from "./crowdfundingTier";
import crowdfundingSettings from "./crowdfundingSettings";

export const schemaTypes = [
  siteSettings,
  siteImages,
  openingHours,
  crowdfundingSettings,  // NIEUW
  trainer,
  offering,
  pricingTier,
  crowdfundingTier,      // NIEUW
  testimonial,
  faq,
  blogPost,
];
```

#### Sanity Studio structuur

Update `sanity.config.ts` — voeg toe aan de items list:

```typescript
S.divider(),
S.listItem()
  .title("Crowdfunding Instellingen")
  .child(
    S.document()
      .schemaType("crowdfundingSettings")
      .documentId("crowdfundingSettings")
  ),
S.documentTypeListItem("crowdfundingTier").title("Crowdfunding Tiers"),
```

#### Data flow

```
Sanity (CMS) → Tier content, FAQ, campagne-instellingen, copy, afbeeldingen
Supabase (DB) → Backers, betalingen, slots_claimed, live stats
Mollie (PSP) → Betalingen verwerken, webhook naar Supabase

Pagina laadt:
1. Fetch tiers + settings + FAQ's uit Sanity (ISR, revalidate: 60)
2. Fetch live stats (total_raised, total_backers) uit Supabase (client-side, real-time)
3. Fetch slots_claimed per tier uit Supabase (client-side)
4. Merge: Sanity tier data + Supabase slots = volledige tier card
```

### Mollie Integratie

- **API Route**: `/api/crowdfunding/checkout`
  - Accepteert: `tierId`, `naam`, `email`, `telefoon` (optioneel)
  - Haalt prijs op uit Sanity (server-side) — nooit uit de client request
  - Maakt Mollie payment aan met juiste bedrag
  - Redirect naar Mollie checkout (iDEAL + creditcard + Bancontact)
  - Webhook: `/api/crowdfunding/webhook` voor payment confirmation
- **Na betaling**: redirect naar `/crowdfunding/bedankt` met confetti animatie en share buttons

### Supabase Schema

Let op: Supabase bevat alleen transactie/real-time data. Alle content zit in Sanity.

```sql
-- Crowdfunding backers tabel
CREATE TABLE crowdfunding_backers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tier_id TEXT NOT NULL,        -- koppelt aan Sanity crowdfundingTier.tierId
  tier_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  mollie_payment_id TEXT UNIQUE,
  payment_status TEXT DEFAULT 'pending', -- pending, paid, failed, refunded
  show_on_wall BOOLEAN DEFAULT true
);

-- Crowdfunding stats (cached, updated via webhook)
CREATE TABLE crowdfunding_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  total_raised INTEGER DEFAULT 0,
  total_backers INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tier inventory tracking (slots_claimed wordt geüpdatet via webhook)
CREATE TABLE crowdfunding_tiers (
  id TEXT PRIMARY KEY,           -- moet matchen met Sanity crowdfundingTier.tierId
  slots_claimed INTEGER DEFAULT 0
);
```

### Real-time Updates

- Supabase real-time subscription op `crowdfunding_stats` tabel
- Progress bar en backer count updaten live (zonder page refresh)
- Tier beschikbaarheid: `maxSlots` uit Sanity, `slots_claimed` uit Supabase

### Admin / CMS Workflow

Marlon kan via Sanity Studio (`themovementclub.nl/studio`):

- **Tiers beheren**: naam, prijs, beschrijving, includes, badge, volgorde, actief/inactief
- **Campagne instellen**: doelbedrag, start/einddatum, aan/uit schakelaar
- **Copy aanpassen**: headline, subline, verhaal, budget overzicht, bedankpagina tekst
- **Hero afbeelding** uploaden/wisselen
- **FAQ's** toevoegen/bewerken met page filter "crowdfunding"

Supabase dashboard alleen nodig voor: backer gegevens inzien, handmatige refunds.

---

## Design Richtlijnen

### Visuele Identiteit

- **Vibe**: Premium, donker, high-end maar warm. Denk boutique fitness, niet budget gym.
- **Kleurenpalet**:
  - Primair: Donker (near-black achtergrond)
  - Accent: Warm goud of warm wit voor highlights en CTAs
  - Tekst: Off-white op donker
  - Success/progress: Warme accent kleur
- **Typografie**: Gebruik een krachtig, premium sans-serif display font voor headings. Clean body font. Geen generieke fonts (geen Inter, Roboto, Arial).
- **Sfeer**: De pagina moet aanvoelen als een exclusieve uitnodiging, niet als een bedelbrief. "Make A Move — je hebt de kans om er vanaf het begin bij te zijn."

### Animaties (Framer Motion)

- Page load: staggered fade-in van secties
- Progress bar: animated fill on scroll into view
- Tier cards: staggered entrance animatie
- Counter: animated number count-up voor bedrag en backers
- Hover op tier cards: subtle lift
- "Uitverkocht" state: smooth transition
- Confetti op bedankpagina

### Responsive

- Mobile-first design
- Tier cards: 1 kolom op mobiel, 2 kolommen tablet, 3 kolommen desktop
- Progress bar en hero moeten op mobiel impactvol blijven
- WhatsApp share button prominent op mobiel

---

## Environment Variables

```env
# Mollie
MOLLIE_API_KEY=live_xxx
MOLLIE_WEBHOOK_URL=https://themovementclub.nl/api/crowdfunding/webhook

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://cdkgjiotqlxnoxhfcjic.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Sanity (al geconfigureerd in het project)
NEXT_PUBLIC_SANITY_PROJECT_ID=hn9lkvte
NEXT_PUBLIC_SANITY_DATASET=production

# Site
NEXT_PUBLIC_SITE_URL=https://themovementclub.nl
```

---

## Bedankpagina (`/crowdfunding/bedankt`)

Content uit Sanity `crowdfundingSettings`:

- Confetti animatie
- Titel uit `thankYouTitle` (default: "Welkom bij The Movement Club!")
- Tekst uit `thankYouText`
- Overzicht van gekozen tier (uit query param + Sanity tier data)
- "Deel het met je netwerk" — WhatsApp (met `whatsappShareText`), Instagram, Facebook, kopieer link
- Terugknop naar hoofdpagina

---

## Niet in scope (v1)

- Meerdere betalingen per persoon (upgrade flow)
- Automatische e-mails na betaling (kan later via Resend/Mailgun)
- Blog of updates sectie op crowdfunding pagina
- Multi-language support

---

## Referenties

- Succesvolle NL crowdfunding gyms: bbb Healthboutique (€110K in 1 uur), Pals Padel (€586K in 2,5 week)
- TMC website spec: Next.js 14+, Tailwind CSS 4, Framer Motion, Vercel
- Sanity project: hn9lkvte (dataset: production), studio op /studio
- Supabase project: cdkgjiotqlxnoxhfcjic.supabase.co
- Bestaande Sanity schemas: siteSettings, siteImages, openingHours, trainer, offering, pricingTier, testimonial, faq, blogPost
