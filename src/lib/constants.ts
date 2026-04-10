export const SITE = {
  name: "The Movement Club",
  tagline: "Where Strength Meets Movement",
  description:
    "Boutique training studio in Loosdrecht. Persoonlijk. Exclusief. Resultaatgericht.",
  url: "https://themovementclub.nl",
  email: "info@themovementclub.nl",
  phone: "+31 6 00 00 00 00", // TODO: echte nummer
  whatsapp: "https://wa.me/31600000000", // TODO: echte nummer
  instagram: "https://instagram.com/themovementclub", // TODO: echte link
  address: {
    street: "Industrieweg 14P",
    city: "Loosdrecht",
    zip: "1231 MX", // TODO: echte postcode
    region: "Wijdemeren",
    country: "Nederland",
  },
  kvk: "00000000", // TODO
  btw: "NL000000000B01", // TODO
  trainer: {
    name: "Marlon",
    role: "Head Trainer & Oprichter",
  },
} as const;

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Over ons", href: "/over" },
  { label: "Aanbod", href: "/aanbod" },
  { label: "Contact", href: "/contact" },
] as const;

export const PILLARS = [
  {
    title: "Movement",
    description:
      "Functionele bewegingspatronen die je lichaam weer laten doen waarvoor het gemaakt is.",
  },
  {
    title: "Mobility",
    description:
      "Flexibiliteit en mobiliteit als fundament voor een sterk en gezond lichaam.",
  },
  {
    title: "Strength",
    description:
      "Kracht opbouwen met precisie, techniek en een programma dat bij jou past.",
  },
] as const;

export const OFFERINGS = [
  {
    title: "Personal Training",
    description:
      "Eén-op-één begeleiding volledig afgestemd op jouw doelen, niveau en lichaam.",
    href: "/aanbod#personal-training",
  },
  {
    title: "Small Group Training",
    description:
      "Train in een kleine groep van maximaal 6 personen. Persoonlijke aandacht, gedeelde energie.",
    href: "/aanbod#small-group",
  },
  {
    title: "Mobility Sessions",
    description:
      "Gerichte sessies om je beweeglijkheid te verbeteren en blessures te voorkomen.",
    href: "/aanbod#mobility",
  },
  {
    title: "Strength Programs",
    description:
      "Gestructureerde krachtprogramma's voor duurzame progressie en resultaat.",
    href: "/aanbod#strength",
  },
] as const;

export const PRICING_TIERS = [
  {
    name: "Essentials",
    description: "2x per week groepstraining",
    features: [
      "2 groepstrainingen per week",
      "Toegang tot de studio",
      "Trainingsschema op maat",
    ],
    cta: "Vraag tarieven aan",
    popular: false,
  },
  {
    name: "Premium",
    description: "Onbeperkt groep + 1x PT per maand",
    features: [
      "Onbeperkt groepstrainingen",
      "1x personal training per maand",
      "Voedingsadvies op maat",
      "Prioriteit bij boekingen",
    ],
    cta: "Vraag tarieven aan",
    popular: true,
  },
  {
    name: "Private",
    description: "Volledig PT-traject op maat",
    features: [
      "Wekelijkse personal training",
      "Volledig gepersonaliseerd programma",
      "Voedings- en herstelplan",
      "Direct contact met Marlon",
      "Flexibele planning",
    ],
    cta: "Plan een kennismaking",
    popular: false,
  },
] as const;

export const TESTIMONIALS = [
  {
    name: "Sophie V.",
    text: "Na jaren van sportscholen waar ik een nummer was, voelt The Movement Club als thuiskomen. Marlon ziet écht waar je lichaam behoefte aan heeft.",
  },
  {
    name: "Thomas B.",
    text: "De combinatie van strength en mobility heeft mijn rugklachten volledig verholpen. De persoonlijke aanpak maakt het verschil.",
  },
  {
    name: "Lisa M.",
    text: "Ik train nu 6 maanden bij The Movement Club en heb meer resultaat dan in 3 jaar reguliere sportschool. De sfeer is geweldig.",
  },
] as const;
