import type { HpPageKey } from "../../src/lib/hormoonprofiel/slugs";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const DATE_MODIFIED = "2026-11-21";

export const DISCLAIMER_LEAD = "Geen medisch advies.";
export const DISCLAIMER_REST =
  "Personal Hormonal Profiling is een methode om training, voeding en leefstijl op af te stemmen. Het is geen medische test en geen diagnose. Heb je klachten, ga dan naar je huisarts.";
export const DISCLAIMER = `${DISCLAIMER_LEAD} ${DISCLAIMER_REST}`;

export const CTA_LABEL = "Plan een kennismaking";

/**
 * Open punten voor Marlon. Zolang een veld null is, wordt de regel nergens
 * getoond (nooit een zichtbare placeholder). Zie spec-hormoonprofiel.md.
 */
export const OPEN_FIELDS = {
  /** Jaar van certificering als Personal Hormonal Practitioner. */
  certificeringJaar: null as number | null,
  /** Aantal jaar ervaring als personal trainer. */
  ervaringJaren: null as number | null,
  /** Volledige zin: wie ziet de antwoorden op de vragenlijst en waar worden ze bewaard. */
  vragenlijstZichtbaarVoor: null as string | null,
};

export const MARLON = {
  name: "Marlon van der Leij",
  // COPY: confirm met Marlon
  jobTitle: "Personal Hormonal Practitioner",
  byline: "Marlon van der Leij, gecertificeerd Personal Hormonal Practitioner",
  credential: "Gecertificeerd Personal Hormonal Practitioner (Overload)",
  other: "Kettlebell Master",
} as const;

export function credentialLine(): string {
  const year = OPEN_FIELDS.certificeringJaar;
  return year ? `${MARLON.credential} sinds ${year}` : MARLON.credential;
}

export function experienceLine(): string | null {
  const years = OPEN_FIELDS.ervaringJaren;
  return years ? `${years} jaar ervaring als personal trainer` : null;
}

/** Reactietijd van het kennismakingsformulier. */
export const RESPONSE_TIME = "binnen 1 werkdag"; // COPY: confirm met Marlon

export const CONTACT = {
  street: "Industrieweg 14P",
  zip: "1231 KH",
  city: "Loosdrecht",
  phoneDisplay: "06 25 13 05 84",
  phoneE164: "+31625130584",
  emailStandalone: "info@hormoonprofiel.com",
  emailSection: "info@themovementclub.nl",
  instagramHandle: "@tmcloosdrecht",
  instagramUrl: "https://instagram.com/tmcloosdrecht",
  hours: "Op afspraak. Marlon is in de studio van maandag tot en met vrijdag van 07:00 tot 12:00 en van 17:00 tot 21:00.",
} as const;

/** Navigatie: volgorde en labels, voor beide schillen. */
export const NAV_STANDALONE: ReadonlyArray<{ key: HpPageKey; label: string }> = [
  { key: "wat", label: "Wat is PHP" },
  { key: "hoewerkt", label: "Hoe werkt het" },
  { key: "profielen", label: "Profielen" },
  { key: "voeding", label: "Voeding" },
  { key: "training", label: "Training" },
  { key: "faq", label: "Vragen" },
];

export const NAV_SECTION: ReadonlyArray<{ key: HpPageKey; label: string }> = [
  { key: "home", label: "Overzicht" },
  { key: "wat", label: "Wat is PHP" },
  { key: "hoewerkt", label: "Hoe werkt het" },
  { key: "profielen", label: "Profielen" },
  { key: "voeding", label: "Voeding" },
  { key: "supplementen", label: "Supplementen" },
  { key: "training", label: "Training" },
  { key: "faq", label: "Vragen" },
];

export const FOOTER_INFO: ReadonlyArray<{ key: HpPageKey; label: string }> = [
  { key: "wat", label: "Wat is PHP" },
  { key: "waarom", label: "Waarom een hormoonprofiel" },
  { key: "hoewerkt", label: "Hoe werkt het" },
  { key: "profielen", label: "De 6 profielen" },
  { key: "voeding", label: "Voedingsrichtlijnen" },
  { key: "supplementen", label: "Supplementen" },
  { key: "training", label: "Hormoontraining" },
  { key: "faq", label: "Veelgestelde vragen" },
  { key: "contact", label: "Contact" },
];

export const BREADCRUMB_LABEL: Record<HpPageKey, string> = {
  home: "Home",
  wat: "Wat is PHP",
  waarom: "Waarom een hormoonprofiel",
  hoewerkt: "Hoe werkt het",
  training: "Hormoontraining",
  supplementen: "Supplementen",
  voeding: "Voedingsrichtlijnen",
  profielen: "De 6 hormoonprofielen",
  faq: "Veelgestelde vragen",
  contact: "Contact",
};

/** Kaartjes bij "Verder lezen". */
export const RELATED_CARD: Record<HpPageKey, { title: string; text: string }> = {
  home: { title: "Overzicht", text: "Alles over Personal Hormonal Profiling op een rij." },
  wat: { title: "Wat is PHP", text: "Wat de methode is en wat niet." },
  waarom: { title: "Waarom een hormoonprofiel", text: "Waarom een persoonlijk plan meer oplevert dan een standaarddieet." },
  hoewerkt: { title: "Hoe werkt het", text: "Het traject van kennismaking tot hermeting." },
  training: { title: "Hormoontraining", text: "Trainen met een doel, afgestemd op je profiel." },
  supplementen: { title: "Supplementen", text: "Vier basissupplementen en waarom." },
  voeding: { title: "Voedingsrichtlijnen", text: "De basisregels die voor elk profiel gelden." },
  profielen: { title: "De 6 profielen", text: "Wat elk hormoon doet en wat je zelf kunt doen." },
  faq: { title: "Veelgestelde vragen", text: "Antwoorden op de vragen die we het vaakst krijgen." },
  contact: { title: "Contact", text: "Adres, tijden en een kennismaking plannen." },
};
