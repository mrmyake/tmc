// Eén canonieke base-URL voor de hele site. Productie redirect non-www
// naar www, dus www is de canonieke vorm. Leest NEXT_PUBLIC_SITE_URL
// (zodat localhost en preview-URL's hun eigen base houden), maar borgt de
// canonieke vorm voor het productiedomein: een lege env valt terug op www,
// en de apex (non-www) wordt geforceerd naar www zodat een verkeerd gezette
// env nooit een redirectende canonical oplevert. Trailing slash gestript.
function resolveSiteUrl(): string {
  const canonical = "https://www.themovementclub.nl";
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (!raw) return canonical;
  if (raw === "https://themovementclub.nl") return canonical;
  return raw;
}

export const SITE_URL = resolveSiteUrl();

// PLACEHOLDER: bevestig de daadwerkelijke openingsdatum met Marlon. Bepaalt
// de copy-fase op /early-member ("binnenkort open" vs. "we zijn open") en is
// bewust losgekoppeld van de Early Member-deadline (closes_at, via
// get_campaign_deadline()): de opening kan verschuiven zonder dat de
// Early Member-actie zelf verandert.
export const STUDIO_OPENING_DATE = new Date("2026-08-15T00:00:00+02:00");

export const SITE = {
  name: "The Movement Club",
  tagline: "Where Strength Meets Movement",
  description:
    "Boutique training studio in Loosdrecht. Persoonlijk. Exclusief. Resultaatgericht.",
  url: SITE_URL,
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
    role: "Head Trainer & Oprichtster",
  },
  hormoonprofiel: "https://hormoonprofiel.com",
} as const;

// Primaire navigatie (top-nav content-cluster), vier items. Labels zijn
// user-facing NL-copy // COPY: confirm met Marlon, ook al zijn de meeste al
// bestaande labels. Het "Early Member"-label wordt in de Navbar zelf
// vervangen door "Word lid" zodra getCampaignPhase() (src/lib/campaign.ts)
// 'closed' teruggeeft; de href blijft ongewijzigd.
//
// "Home" en "Contact" staan hier bewust niet meer in (nav-cleanup): het
// logo dekt Home al (dubbele ingang weg), en Contact is verplaatst naar
// footer-only. Beide pagina's (`/`, `/contact`) blijven gewoon bestaan en
// zijn bereikbaar via het logo resp. FOOTER_NAV_LINKS. Zie
// discovery-navigatie-structuur.md voor de onderbouwing.
export const NAV_LINKS = [
  { label: "Aanbod", href: "/aanbod" }, // COPY: confirm met Marlon
  { label: "Prijzen", href: "/prijzen" }, // COPY: confirm met Marlon
  { label: "Early Member", href: "/early-member" }, // COPY: confirm met Marlon
  { label: "Over ons", href: "/over" }, // COPY: confirm met Marlon
] as const;

// Footer-navigatiekolom: volledige sitemap-lijst (geen dropdown/fase-logica
// hier), inclusief Home en Contact die niet meer in de top-nav staan.
export const FOOTER_NAV_LINKS = [
  { label: "Home", href: "/" }, // COPY: confirm met Marlon
  ...NAV_LINKS,
  { label: "Contact", href: "/contact" }, // COPY: confirm met Marlon
] as const;

// Aanbod-hub dropdown (desktop) / uitklap (mobiel). Yoga staat hier apart
// van Groepslessen: eigen pagina op /yoga (SEO + Marlons yoga-merk), maar
// visueel gegroepeerd onder Groepslessen in de Navbar-render. Groepslessen,
// Vrij trainen en All Access linken naar nieuwe placeholder-secties op
// /aanbod (AanbodContent.tsx) — zie die secties voor de "Bekijk
// prijzen"-crosslink naar de bijbehorende anchor op /prijzen.
export const AANBOD_DROPDOWN = [
  {
    label: "Groepslessen", // COPY: confirm met Marlon
    href: "/aanbod#groepslessen",
    sub: "yoga, mobility, kettlebell", // COPY: confirm met Marlon
  },
  { label: "Yoga", href: "/yoga" }, // COPY: confirm met Marlon
  { label: "Vrij trainen", href: "/aanbod#vrij-trainen" }, // COPY: confirm met Marlon
  { label: "All Access", href: "/aanbod#all-access" }, // COPY: confirm met Marlon
  {
    label: "Personal Training & Duo", // COPY: confirm met Marlon
    href: "/aanbod#personal-training",
  },
  { label: "12-weken programma", href: "/12-weken-programma" }, // COPY: confirm met Marlon
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

// TODO: Vervang met echte Google Reviews van ptloosdrecht.nl
// Kopieer de beste reviews uit het Google Business Profile
export const TESTIMONIALS = [
  {
    name: "Sophie V.",
    text: "Na jaren van sportscholen waar ik een nummer was, voelt het hier als thuiskomen. Marlon ziet écht waar je lichaam behoefte aan heeft.",
  },
  {
    name: "Thomas B.",
    text: "De combinatie van strength en mobility heeft mijn rugklachten volledig verholpen. De persoonlijke aanpak maakt het verschil.",
  },
  {
    name: "Lisa M.",
    text: "Ik train nu 6 maanden bij Marlon en heb meer resultaat dan in 3 jaar reguliere sportschool. De sfeer is geweldig.",
  },
] as const;
