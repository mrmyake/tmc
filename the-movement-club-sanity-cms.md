# The Movement Club -- Sanity CMS Plan

## Doel

Marlon kan zelfstandig content beheren op themovementclub.nl zonder developer. Ze logt in op een visueel dashboard, past tekst/foto's aan, en de site updatet automatisch.

---

## Sanity Setup

### Account & Project

- **Plan:** Free (3 gebruikers, 500K API requests/maand, 20GB assets)
- **Project naam:** the-movement-club
- **Dataset:** production
- **Studio URL:** https://themovementclub.sanity.studio (of als route in de site: themovementclub.nl/studio)

### Dependencies

```bash
npm install sanity @sanity/client @sanity/image-url next-sanity @portabletext/react
```

### Project Structuur

```
the-movement-club/
  sanity/
    schemas/
      index.ts              -- Schema registry
      trainer.ts            -- Trainer profiel (Marlon)
      testimonial.ts        -- Klantreviews
      offering.ts           -- Trainingsaanbod
      pricingTier.ts        -- Lidmaatschap tiers
      faq.ts                -- Veelgestelde vragen
      openingHours.ts       -- Openingstijden
      siteSettings.ts       -- Globale instellingen
      blogPost.ts           -- Blog/nieuws (optioneel)
      page.ts               -- Vrije pagina's (optioneel)
    lib/
      client.ts             -- Sanity client config
      queries.ts            -- GROQ queries
      image.ts              -- Image URL builder
  sanity.config.ts          -- Studio configuratie
  sanity.cli.ts             -- CLI config
```

---

## Content Modellen (Schemas)

### 1. Site Settings (singleton)

Marlon kan aanpassen: contactgegevens, socials, globale teksten.

```typescript
// sanity/schemas/siteSettings.ts
export default {
  name: 'siteSettings',
  title: 'Website Instellingen',
  type: 'document',
  fields: [
    {
      name: 'studioName',
      title: 'Studio naam',
      type: 'string',
      initialValue: 'The Movement Club',
    },
    {
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
      description: 'Korte beschrijving onder de naam',
    },
    {
      name: 'phone',
      title: 'Telefoonnummer',
      type: 'string',
    },
    {
      name: 'email',
      title: 'E-mailadres',
      type: 'string',
    },
    {
      name: 'whatsappNumber',
      title: 'WhatsApp nummer (internationaal formaat)',
      type: 'string',
      description: 'Bijv. 31612345678 (zonder + of spaties)',
    },
    {
      name: 'address',
      title: 'Adres',
      type: 'object',
      fields: [
        { name: 'street', title: 'Straat + nummer', type: 'string' },
        { name: 'postalCode', title: 'Postcode', type: 'string' },
        { name: 'city', title: 'Plaats', type: 'string' },
      ],
    },
    {
      name: 'kvkNumber',
      title: 'KvK nummer',
      type: 'string',
    },
    {
      name: 'btwNumber',
      title: 'BTW nummer',
      type: 'string',
    },
    {
      name: 'instagramUrl',
      title: 'Instagram URL',
      type: 'url',
    },
    {
      name: 'googleMapsUrl',
      title: 'Google Maps link',
      type: 'url',
    },
  ],
  // Singleton: voorkom dat Marlon per ongeluk meerdere aanmaakt
  __experimental_actions: ['update', 'publish'],
}
```

### 2. Opening Hours

```typescript
// sanity/schemas/openingHours.ts
export default {
  name: 'openingHours',
  title: 'Openingstijden',
  type: 'document',
  fields: [
    {
      name: 'schedule',
      title: 'Weekschema',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'day',
              title: 'Dag',
              type: 'string',
              options: {
                list: [
                  'Maandag', 'Dinsdag', 'Woensdag',
                  'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag',
                ],
              },
            },
            { name: 'open', title: 'Open', type: 'string', description: 'Bijv. 07:00' },
            { name: 'close', title: 'Sluit', type: 'string', description: 'Bijv. 21:00' },
            {
              name: 'closed',
              title: 'Gesloten',
              type: 'boolean',
              initialValue: false,
            },
          ],
          preview: {
            select: { day: 'day', open: 'open', close: 'close', closed: 'closed' },
            prepare({ day, open, close, closed }) {
              return {
                title: day,
                subtitle: closed ? 'Gesloten' : `${open} – ${close}`,
              }
            },
          },
        },
      ],
    },
    {
      name: 'note',
      title: 'Extra opmerking',
      type: 'string',
      description: 'Bijv. "Op feestdagen gesloten" of "Alleen op afspraak"',
    },
  ],
  __experimental_actions: ['update', 'publish'],
}
```

### 3. Trainer

```typescript
// sanity/schemas/trainer.ts
export default {
  name: 'trainer',
  title: 'Trainers',
  type: 'document',
  fields: [
    { name: 'name', title: 'Naam', type: 'string' },
    { name: 'role', title: 'Rol', type: 'string', description: 'Bijv. Head Trainer & Oprichtster' },
    {
      name: 'photo',
      title: 'Portretfoto',
      type: 'image',
      options: { hotspot: true },
    },
    {
      name: 'bio',
      title: 'Bio',
      type: 'array',
      of: [{ type: 'block' }],
      description: 'Korte beschrijving voor de website',
    },
    { name: 'quote', title: 'Persoonlijke quote', type: 'text', rows: 3 },
    {
      name: 'certifications',
      title: 'Certificeringen',
      type: 'array',
      of: [{ type: 'string' }],
    },
    { name: 'order', title: 'Volgorde', type: 'number', description: 'Lager = eerder getoond' },
  ],
  orderings: [{ title: 'Volgorde', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'name', subtitle: 'role', media: 'photo' },
  },
}
```

### 4. Offering (Trainingsaanbod)

```typescript
// sanity/schemas/offering.ts
export default {
  name: 'offering',
  title: 'Trainingsaanbod',
  type: 'document',
  fields: [
    { name: 'title', title: 'Naam', type: 'string' },
    { name: 'slug', title: 'URL slug', type: 'slug', options: { source: 'title' } },
    { name: 'subtitle', title: 'Ondertitel', type: 'string', description: 'Bijv. "Eén-op-één, volledig op maat"' },
    {
      name: 'image',
      title: 'Foto',
      type: 'image',
      options: { hotspot: true },
    },
    {
      name: 'description',
      title: 'Beschrijving',
      type: 'array',
      of: [{ type: 'block' }],
    },
    { name: 'targetAudience', title: 'Voor wie', type: 'text', rows: 3 },
    {
      name: 'features',
      title: 'Wat kun je verwachten',
      type: 'array',
      of: [{ type: 'string' }],
    },
    { name: 'frequency', title: 'Frequentie', type: 'string', description: 'Bijv. "1-4x per week"' },
    { name: 'order', title: 'Volgorde', type: 'number' },
  ],
  orderings: [{ title: 'Volgorde', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'title', subtitle: 'subtitle', media: 'image' },
  },
}
```

### 5. Pricing Tier

```typescript
// sanity/schemas/pricingTier.ts
export default {
  name: 'pricingTier',
  title: 'Lidmaatschap',
  type: 'document',
  fields: [
    { name: 'name', title: 'Naam', type: 'string' },
    { name: 'subtitle', title: 'Ondertitel', type: 'string', description: 'Bijv. "2x per week groepstraining"' },
    {
      name: 'features',
      title: 'Kenmerken',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'price',
      title: 'Prijs',
      type: 'string',
      description: 'Leeg laten als je "Vraag tarieven aan" wilt tonen',
    },
    {
      name: 'ctaText',
      title: 'Button tekst',
      type: 'string',
      initialValue: 'Vraag tarieven aan',
    },
    {
      name: 'ctaLink',
      title: 'Button link',
      type: 'string',
      initialValue: '/contact',
    },
    {
      name: 'highlighted',
      title: 'Uitgelicht (populair)',
      type: 'boolean',
      initialValue: false,
    },
    { name: 'order', title: 'Volgorde', type: 'number' },
  ],
  orderings: [{ title: 'Volgorde', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'name', subtitle: 'subtitle' },
  },
}
```

### 6. Testimonial

```typescript
// sanity/schemas/testimonial.ts
export default {
  name: 'testimonial',
  title: 'Testimonials',
  type: 'document',
  fields: [
    { name: 'name', title: 'Naam klant', type: 'string' },
    { name: 'quote', title: 'Quote', type: 'text', rows: 4 },
    {
      name: 'photo',
      title: 'Foto (optioneel)',
      type: 'image',
      options: { hotspot: true },
    },
    { name: 'rating', title: 'Sterren (1-5)', type: 'number', validation: (Rule) => Rule.min(1).max(5) },
    {
      name: 'trainingType',
      title: 'Type training',
      type: 'string',
      options: {
        list: ['Personal Training', 'Small Group', 'Mobility', 'Strength'],
      },
    },
    { name: 'active', title: 'Tonen op website', type: 'boolean', initialValue: true },
    { name: 'order', title: 'Volgorde', type: 'number' },
  ],
  preview: {
    select: { title: 'name', subtitle: 'quote', media: 'photo' },
  },
}
```

### 7. FAQ

```typescript
// sanity/schemas/faq.ts
export default {
  name: 'faq',
  title: 'Veelgestelde vragen',
  type: 'document',
  fields: [
    { name: 'question', title: 'Vraag', type: 'string' },
    {
      name: 'answer',
      title: 'Antwoord',
      type: 'array',
      of: [{ type: 'block' }],
    },
    {
      name: 'page',
      title: 'Tonen op pagina',
      type: 'string',
      options: {
        list: [
          { title: 'Aanbod', value: 'aanbod' },
          { title: 'Mobility Check', value: 'mobility-check' },
          { title: 'Algemeen', value: 'algemeen' },
        ],
      },
    },
    { name: 'order', title: 'Volgorde', type: 'number' },
  ],
  orderings: [{ title: 'Volgorde', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
  preview: {
    select: { title: 'question', subtitle: 'page' },
  },
}
```

### 8. Blog Post (optioneel, fase 2)

```typescript
// sanity/schemas/blogPost.ts
export default {
  name: 'blogPost',
  title: 'Blog',
  type: 'document',
  fields: [
    { name: 'title', title: 'Titel', type: 'string' },
    { name: 'slug', title: 'URL', type: 'slug', options: { source: 'title' } },
    {
      name: 'coverImage',
      title: 'Omslagfoto',
      type: 'image',
      options: { hotspot: true },
    },
    { name: 'excerpt', title: 'Samenvatting', type: 'text', rows: 3 },
    {
      name: 'body',
      title: 'Inhoud',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', title: 'Alt tekst', type: 'string' },
            { name: 'caption', title: 'Bijschrift', type: 'string' },
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      title: 'Publicatiedatum',
      type: 'datetime',
    },
    {
      name: 'author',
      title: 'Auteur',
      type: 'reference',
      to: [{ type: 'trainer' }],
    },
    {
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'publishedAt', media: 'coverImage' },
  },
}
```

---

## Sanity Studio Configuratie

```typescript
// sanity.config.ts
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './sanity/schemas'

export default defineConfig({
  name: 'the-movement-club',
  title: 'The Movement Club',
  projectId: '<PROJECT_ID>',   // Vul in na aanmaken project
  dataset: 'production',
  basePath: '/studio',          // Studio draait op themovementclub.nl/studio
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('Content')
          .items([
            // Singletons bovenaan
            S.listItem()
              .title('Website Instellingen')
              .icon(() => '⚙️')
              .child(
                S.document()
                  .schemaType('siteSettings')
                  .documentId('siteSettings')
              ),
            S.listItem()
              .title('Openingstijden')
              .icon(() => '🕐')
              .child(
                S.document()
                  .schemaType('openingHours')
                  .documentId('openingHours')
              ),
            S.divider(),
            // Lijsten
            S.documentTypeListItem('trainer').title('Trainers').icon(() => '💪'),
            S.documentTypeListItem('offering').title('Trainingsaanbod').icon(() => '🏋️'),
            S.documentTypeListItem('pricingTier').title('Lidmaatschap').icon(() => '💰'),
            S.documentTypeListItem('testimonial').title('Testimonials').icon(() => '⭐'),
            S.documentTypeListItem('faq').title('FAQ').icon(() => '❓'),
            S.divider(),
            S.documentTypeListItem('blogPost').title('Blog').icon(() => '📝'),
          ]),
    }),
  ],
  schema: {
    types: schemaTypes,
  },
})
```

---

## Sanity Client (Next.js)

```typescript
// sanity/lib/client.ts
import { createClient } from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'

export const client = createClient({
  projectId: '<PROJECT_ID>',
  dataset: 'production',
  apiVersion: '2026-04-01',
  useCdn: true,    // true voor productie (cached, snel)
})

const builder = imageUrlBuilder(client)
export const urlFor = (source: any) => builder.image(source)
```

```typescript
// sanity/lib/queries.ts
export const siteSettingsQuery = `*[_type == "siteSettings"][0]`

export const openingHoursQuery = `*[_type == "openingHours"][0]`

export const trainersQuery = `*[_type == "trainer"] | order(order asc)`

export const offeringsQuery = `*[_type == "offering"] | order(order asc)`

export const pricingQuery = `*[_type == "pricingTier"] | order(order asc)`

export const testimonialsQuery = `*[_type == "testimonial" && active == true] | order(order asc)`

export const faqsByPageQuery = `*[_type == "faq" && page == $page] | order(order asc)`

export const blogPostsQuery = `*[_type == "blogPost"] | order(publishedAt desc)`

export const blogPostBySlugQuery = `*[_type == "blogPost" && slug.current == $slug][0]{
  ...,
  author->{ name, photo }
}`
```

---

## Wat Marlon ziet in het Dashboard

Na inloggen op themovementclub.nl/studio ziet Marlon dit menu:

```
⚙️  Website Instellingen     -- telefoon, email, adres, KvK, socials
🕐  Openingstijden            -- per dag open/sluit tijden
──────────────────
💪  Trainers                  -- bio, foto, quote aanpassen
🏋️  Trainingsaanbod           -- PT, Small Group, etc. bewerken
💰  Lidmaatschap              -- pricing tiers aanpassen
⭐  Testimonials              -- reviews toevoegen/verwijderen
❓  FAQ                       -- vragen toevoegen/bewerken
──────────────────
📝  Blog                      -- artikelen schrijven (optioneel)
```

### Acties die Marlon zelf kan doen

| Actie | Hoe |
|-------|-----|
| Telefoonnummer wijzigen | Website Instellingen → Telefoonnummer → opslaan |
| Nieuwe testimonial toevoegen | Testimonials → + → naam, quote, sterren invullen → publiceren |
| Testimonial verbergen | Testimonials → open item → "Tonen op website" uit → publiceren |
| Openingstijden aanpassen | Openingstijden → dag bewerken → publiceren |
| Prijs/lidmaatschap wijzigen | Lidmaatschap → open tier → aanpassen → publiceren |
| Foto vervangen | Trainers → Marlon → foto uploaden → publiceren |
| FAQ toevoegen | FAQ → + → vraag + antwoord invullen → publiceren |
| Blogpost schrijven | Blog → + → titel, tekst, foto → publiceren |

### Wat Marlon NIET kan (en niet hoeft)

- Layout of pagina-structuur wijzigen
- Kleuren of fonts aanpassen
- Formulieren wijzigen
- Navigatie aanpassen
- Lead magnet pagina's bewerken
- Analytics of tracking aanpassen

---

## Migratie: Hardcoded → Sanity

De huidige site heeft alle content hardcoded in de componenten. De migratie gaat zo:

### Stap 1: Sanity project opzetten
1. `npm create sanity@latest` (of handmatig configureren in bestaand project)
2. Schemas aanmaken (zie boven)
3. Studio route toevoegen aan Next.js

### Stap 2: Initiële content vullen
- Maak een seed script dat de huidige hardcoded content naar Sanity importeert
- Of: handmatig invoeren via de Studio (sneller bij deze hoeveelheid)

### Stap 3: Components omzetten
Per component:

**Voorheen (hardcoded):**
```tsx
<h2>Maak kennis met Marlon</h2>
<p>Met jarenlange ervaring in personal training...</p>
```

**Na Sanity:**
```tsx
const trainer = await client.fetch(trainersQuery)

<h2>Maak kennis met {trainer.name}</h2>
<PortableText value={trainer.bio} />
```

### Volgorde van omzetting

```
1. [ ] Sanity project aanmaken + schemas deployen
2. [ ] Studio route (/studio) toevoegen aan Next.js
3. [ ] Sanity client + queries opzetten
4. [ ] siteSettings migreren (contact, adres, KvK -> gebruikt in Footer, Contact, etc.)
5. [ ] openingHours migreren (Contact pagina + homepage)
6. [ ] trainers migreren (Homepage trainer spotlight + /over pagina)
7. [ ] offerings migreren (/aanbod pagina + homepage cards)
8. [ ] pricingTiers migreren (Homepage pricing + eventueel /aanbod)
9. [ ] testimonials migreren (Homepage testimonials sectie)
10. [ ] faqs migreren (/aanbod FAQ sectie + /mobility-check FAQ)
11. [ ] Blog opzetten (optioneel, kan later)
12. [ ] Testen: Marlon logt in, past iets aan, check of site updatet
13. [ ] Marlon instructie geven (10 min walkthrough)
```

---

## Marlon Onboarding (10 minuten)

Na oplevering, loop dit met Marlon door:

1. **Inloggen:** Ga naar themovementclub.nl/studio, log in met Google
2. **Rondleiding:** Laat het menu zien, klik door de items
3. **Iets aanpassen:** Verander samen de openingstijden, klik "Publiceren"
4. **Foto uploaden:** Vervang een foto, laat zien hoe hotspot/crop werkt
5. **Testimonial toevoegen:** Voeg samen een review toe
6. **Publiceren:** Leg uit dat "Publiceren" = live op de site (binnen ~60 sec)
7. **Tip:** "Als je twijfelt, sla op als concept (niet publiceren). Dan kan ik het checken."

---

## Kosten

| Item | Kosten |
|------|--------|
| Sanity Free plan | €0/mnd |
| Extra als je groeit (Growth plan) | $15/mnd (bij >500K API calls of >20GB assets) |

Voor een boutique gym met 5-10 pagina's en weinig traffic zit je jarenlang op het gratis plan.

---

*Dit is een aparte fase, uit te voeren NA de lead magnet + analytics implementatie. Voeg toe als context bij de CC sessie wanneer je aan de CMS fase begint.*
