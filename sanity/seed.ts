/**
 * Seed script: pushes hardcoded content to Sanity.
 *
 * Run with: npx tsx sanity/seed.ts
 *
 * Requires SANITY_TOKEN env var (create at sanity.io/manage → API → Tokens)
 */
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: "hn9lkvte",
  dataset: "production",
  apiVersion: "2026-04-01",
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});

async function seed() {
  console.log("Seeding Sanity...");

  // 1. Site Settings
  await client.createOrReplace({
    _id: "siteSettings",
    _type: "siteSettings",
    studioName: "The Movement Club",
    tagline: "Where Strength Meets Movement",
    phone: "+31 6 00 00 00 00",
    email: "info@themovementclub.nl",
    whatsappNumber: "31600000000",
    address: {
      street: "Industrieweg 14P",
      postalCode: "1231 MX",
      city: "Loosdrecht",
    },
    kvkNumber: "00000000",
    btwNumber: "NL000000000B01",
    instagramUrl: "https://instagram.com/themovementclub",
  });
  console.log("✓ siteSettings");

  // 2. Opening Hours
  await client.createOrReplace({
    _id: "openingHours",
    _type: "openingHours",
    schedule: [
      { _key: "mon", day: "Maandag", open: "07:00", close: "21:00", closed: false },
      { _key: "tue", day: "Dinsdag", open: "07:00", close: "21:00", closed: false },
      { _key: "wed", day: "Woensdag", open: "07:00", close: "21:00", closed: false },
      { _key: "thu", day: "Donderdag", open: "07:00", close: "21:00", closed: false },
      { _key: "fri", day: "Vrijdag", open: "07:00", close: "21:00", closed: false },
      { _key: "sat", day: "Zaterdag", open: "08:00", close: "14:00", closed: false },
      { _key: "sun", day: "Zondag", open: "", close: "", closed: true },
    ],
  });
  console.log("✓ openingHours");

  // 3. Trainer (Marlon)
  await client.createOrReplace({
    _id: "trainer-marlon",
    _type: "trainer",
    name: "Marlon",
    role: "Head Trainer & Oprichtster",
    bio: [
      {
        _type: "block",
        _key: "bio1",
        children: [
          {
            _type: "span",
            _key: "s1",
            text: "Met jarenlange ervaring in personal training, functional movement en strength coaching begeleidt Marlon elke klant met dezelfde passie en precisie.",
          },
        ],
        markDefs: [],
        style: "normal",
      },
      {
        _type: "block",
        _key: "bio2",
        children: [
          {
            _type: "span",
            _key: "s2",
            text: "Haar aanpak is persoonlijk, wetenschappelijk onderbouwd en altijd gericht op duurzaam resultaat. Geen shortcuts, geen hypes — alleen wat werkt voor jouw lichaam.",
          },
        ],
        markDefs: [],
        style: "normal",
      },
    ],
    quote:
      "Ik geloof dat iedereen een atleet is. Het gaat er niet om hoe zwaar je tilt, maar hoe goed je beweegt.",
    order: 1,
  });
  console.log("✓ trainer (Marlon)");

  // 4. Offerings
  const offerings = [
    {
      _id: "offering-personal-training",
      title: "Personal Training",
      slug: { _type: "slug", current: "personal-training" },
      subtitle: "Eén-op-één, volledig op maat",
      targetAudience:
        "Voor iedereen die maximaal resultaat wil met persoonlijke begeleiding.",
      features: [
        "Intake en assessment van je huidige niveau",
        "Gepersonaliseerd trainingsschema",
        "Continue begeleiding en bijsturing",
        "Voedingsadvies op maat",
      ],
      frequency: "1-4x per week, flexibel in te plannen",
      order: 1,
    },
    {
      _id: "offering-small-group",
      title: "Small Group Training",
      slug: { _type: "slug", current: "small-group" },
      subtitle: "Maximaal 6 personen",
      targetAudience:
        "Voor wie de balans zoekt tussen persoonlijke aandacht en groepsdynamiek.",
      features: [
        "Gevarieerde workouts die uitdagen",
        "Persoonlijke correcties en aanpassingen",
        "Vaste trainingstijden voor routine",
        "Motivatie van een hechte groep",
      ],
      frequency: "Vaste momenten door de week, ochtend en avond",
      order: 2,
    },
    {
      _id: "offering-mobility",
      title: "Mobility Sessions",
      slug: { _type: "slug", current: "mobility" },
      subtitle: "Het fundament van goed bewegen",
      targetAudience:
        "Voor iedereen met stijfheid, blessure-gevoeligheid of zittend werk.",
      features: [
        "Gerichte mobiliteitsroutines",
        "Myofasciale release technieken",
        "Ademhalingswerk",
        "Bewegingsscreenings",
      ],
      frequency: "1-2x per week, los of als aanvulling",
      order: 3,
    },
    {
      _id: "offering-strength",
      title: "Strength Programs",
      slug: { _type: "slug", current: "strength" },
      subtitle: "Gestructureerd sterker worden",
      targetAudience:
        "Voor gevorderden die structuur en progressie zoeken in hun krachttraining.",
      features: [
        "Periodisatie-schema op maat",
        "Progressieve overload tracking",
        "Techniekanalyse van compound lifts",
        "Regelmatige evaluatiemomenten",
      ],
      frequency: "3-4x per week, volgens vast schema",
      order: 4,
    },
  ];

  for (const o of offerings) {
    await client.createOrReplace({
      ...o,
      _type: "offering",
      description: [
        {
          _type: "block",
          _key: `desc-${o._id}`,
          children: [{ _type: "span", _key: "s1", text: "" }],
          markDefs: [],
          style: "normal",
        },
      ],
    });
  }
  console.log("✓ offerings (4)");

  // 5. Pricing Tiers
  const tiers = [
    {
      _id: "pricing-essentials",
      name: "Essentials",
      subtitle: "2x per week groepstraining",
      features: [
        "2 groepstrainingen per week",
        "Toegang tot de studio",
        "Trainingsschema op maat",
      ],
      ctaText: "Vraag tarieven aan",
      ctaLink: "/contact",
      highlighted: false,
      order: 1,
    },
    {
      _id: "pricing-premium",
      name: "Premium",
      subtitle: "Onbeperkt groep + 1x PT per maand",
      features: [
        "Onbeperkt groepstrainingen",
        "1x personal training per maand",
        "Voedingsadvies op maat",
        "Prioriteit bij boekingen",
      ],
      ctaText: "Vraag tarieven aan",
      ctaLink: "/contact",
      highlighted: true,
      order: 2,
    },
    {
      _id: "pricing-private",
      name: "Private",
      subtitle: "Volledig PT-traject op maat",
      features: [
        "Wekelijkse personal training",
        "Volledig gepersonaliseerd programma",
        "Voedings- en herstelplan",
        "Direct contact met Marlon",
        "Flexibele planning",
      ],
      ctaText: "Plan een kennismaking",
      ctaLink: "/contact",
      highlighted: false,
      order: 3,
    },
  ];

  for (const t of tiers) {
    await client.createOrReplace({ ...t, _type: "pricingTier" });
  }
  console.log("✓ pricingTiers (3)");

  // 6. FAQs
  const faqs = [
    { q: "Heb ik ervaring nodig om te starten?", a: "Nee. Of je nu beginner bent of gevorderd — we passen elke training aan op jouw niveau. Tijdens de intake brengen we je huidige staat in kaart.", page: "aanbod", order: 1 },
    { q: "Kan ik verschillende trainingsvormen combineren?", a: "Absoluut. Veel leden combineren bijvoorbeeld small group training met een maandelijkse personal training sessie of mobility sessions.", page: "aanbod", order: 2 },
    { q: "Hoe groot zijn de groepen bij Small Group Training?", a: "Maximaal 6 personen. Zo garanderen we dat iedereen persoonlijke aandacht krijgt en de techniek correct wordt uitgevoerd.", page: "aanbod", order: 3 },
    { q: "Wat als ik een blessure heb?", a: "Bij een blessure passen we het programma aan. We werken samen met fysiotherapeuten in de regio voor een geïntegreerde aanpak.", page: "aanbod", order: 4 },
    { q: "Zijn er vaste contracten?", a: "We werken met flexibele lidmaatschappen. Neem contact op voor de mogelijkheden die bij jou passen.", page: "aanbod", order: 5 },
    { q: "Is het echt gratis?", a: "Ja, volledig vrijblijvend. Geen verplichtingen, geen verkooppraatje.", page: "mobility-check", order: 1 },
    { q: "Moet ik sportkleding aan?", a: "Comfortabele kleding is voldoende. Je hoeft niet te sporten.", page: "mobility-check", order: 2 },
    { q: "Hoe lang duurt het?", a: "Ongeveer 20-30 minuten. We nemen de tijd voor een grondige screening.", page: "mobility-check", order: 3 },
    { q: "Wat als ik blessures heb?", a: "Juist dan is een screening waardevol. Marlon past alles aan op jouw situatie.", page: "mobility-check", order: 4 },
  ];

  for (let i = 0; i < faqs.length; i++) {
    const f = faqs[i];
    await client.createOrReplace({
      _id: `faq-${f.page}-${f.order}`,
      _type: "faq",
      question: f.q,
      answer: [
        {
          _type: "block",
          _key: `a${i}`,
          children: [{ _type: "span", _key: "s1", text: f.a }],
          markDefs: [],
          style: "normal",
        },
      ],
      page: f.page,
      order: f.order,
    });
  }
  console.log("✓ faqs (9)");

  console.log("\nDone! All content seeded to Sanity.");
}

seed().catch(console.error);
