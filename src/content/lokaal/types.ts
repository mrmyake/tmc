import type { Pillar } from "@/lib/member/plan-coverage";

/**
 * Inhoudsmodel van de lokale dienst- en locatiepagina's (spec-locatiepaginas.md).
 *
 * De inhoud staat als getypte data in de code, niet in Sanity. Elke pagina is
 * een discriminated union op `status`:
 *
 * - 'concept': velden die nog niet bestaan (reistijden, quotes, FAQ-antwoorden,
 *   echte foto's) mogen ontbreken. De route geeft een tijdelijke redirect.
 * - 'live': alle verplichte velden zijn er, anders is het een typefout en
 *   breekt de build. Zo komt er nooit een dunne pagina live.
 *
 * Een placeholder-beeld is alleen toegestaan bij 'concept'.
 */

export type PaginaStatus = "concept" | "live";

/** Echte foto, statisch bestand onder public/images/lokaal/. Alt is verplicht. */
export interface Foto {
  src: string;
  alt: string;
}

/** Tijdelijk beeld zolang er geen echte foto is. Alleen bij status 'concept'. */
export interface Placeholder {
  placeholder: true;
  label: string;
}

export type BeeldConcept = Foto | Placeholder;

export interface Link {
  label: string;
  href: string;
}

export interface FaqLive {
  vraag: string;
  antwoord: string;
}

/** Bij 'concept' mag het antwoord nog ontbreken (wacht op Marlon). */
export interface FaqConcept {
  vraag: string;
  antwoord?: string;
}

export interface Seo {
  /** Zonder merknaam: de layout-template voegt " | The Movement Club" toe. */
  title: string;
  description: string;
}

export interface Trainer<B> {
  naam: string;
  rol: string;
  /** Eerste zin(nen) over de trainer. */
  tekst: string;
  /** Opleiding of certificering, één zin. Wacht op Marlon. */
  opleiding?: string;
  foto: B;
}

export interface Afsluiter {
  titel: string;
  tekst: string;
  primair: Link;
  secundair?: Link;
}

export interface PlaatsLink {
  label: string;
  /** Slug van een locatiepagina; de link verschijnt pas als die pagina live is. */
  pagina?: LokaalSlug;
}

export interface AanbodRegel {
  titel: string;
  tekst: string;
  href: string;
}

export const LOKAAL_SLUGS = [
  "personal-training",
  "kettlebell-training",
  "mobility",
  "krachttraining",
  "personal-trainer-hilversum",
  "personal-trainer-bussum",
  "personal-trainer-laren",
  "personal-trainer-gooi",
] as const;

export type LokaalSlug = (typeof LOKAAL_SLUGS)[number];

export type DienstSlug =
  | "personal-training"
  | "kettlebell-training"
  | "mobility"
  | "krachttraining";

export type LocatieSlug =
  | "personal-trainer-hilversum"
  | "personal-trainer-bussum"
  | "personal-trainer-laren";

export interface Coordinaat {
  lat: number;
  lon: number;
}

/** Studio aan de Industrieweg 14P, gelijk aan de geo in de ExerciseGym-schema. */
export const STUDIO_COORDINAAT: Coordinaat = { lat: 52.2, lon: 5.095 };

// ---------------------------------------------------------------------------
// Dienstpagina
// ---------------------------------------------------------------------------

export interface Stat {
  waarde: string;
  label: string;
}

export interface BasisItem<B> {
  titel: string;
  tekst: string;
  beeld?: B;
}

export interface VormKaart {
  titel: string;
  tekst: string;
  link: Link;
  /** Eerste kaart met accentrand. */
  uitgelicht?: boolean;
}

export type RoosterKeuze =
  /** Live strip met de eerstvolgende 3 lessen van deze pijler. */
  | { pijler: Pillar; titel: string }
  /** Alleen een link naar het publieke rooster (geen eigen pijler). */
  | { link: Link; tekst: string };

interface DienstInhoud<B> {
  slug: DienstSlug;
  /** Datum van de laatste inhoudelijke wijziging (YYYY-MM-DD), voor de sitemap. */
  bijgewerkt: string;
  seo: Seo;
  eyebrow: string;
  h1: string;
  lead: string;
  /** Hoofdknop: dienstpagina's "Plan je proefles", PT "Plan een kennismaking". */
  cta: { primair: Link; secundair?: Link };
  /** Maximaal 3 vakken in de cijferbalk. */
  stats: readonly Stat[];
  basis?: {
    eyebrow: string;
    titel: string;
    intro: string;
    items: readonly BasisItem<B>[];
  };
  trainerKop: string;
  trainer: Trainer<B>;
  rooster?: RoosterKeuze;
  vormen: {
    eyebrow: string;
    titel: string;
    /** Een kaart toevoegen vraagt geen sjabloonwijziging. */
    kaarten: readonly VormKaart[];
  };
  faqKop: { eyebrow: string; titel: string };
  regio: {
    tekst: string;
    plaatsen: readonly PlaatsLink[];
  };
  /** Voor Service-schema. */
  serviceType: string;
  areaServed: readonly string[];
  voorheen?: string;
  afsluiter: Afsluiter;
}

export interface DienstConcept extends DienstInhoud<BeeldConcept> {
  status: "concept";
  heroImage?: BeeldConcept;
  faq: readonly FaqConcept[];
}

export interface DienstLive extends DienstInhoud<Foto> {
  status: "live";
  heroImage: Foto;
  /** Minimaal 3 vragen met antwoord. */
  faq: readonly [FaqLive, FaqLive, FaqLive, ...FaqLive[]];
}

export type DienstPagina = DienstConcept | DienstLive;

// ---------------------------------------------------------------------------
// Locatiepagina
// ---------------------------------------------------------------------------

export interface Quote {
  tekst: string;
  voornaam: string;
  /** Woonplaats van de reviewer; de quote toont "Voornaam, woonplaats". */
  woonplaats: string;
  /** Herkomst van de quote, bv. "Google-review". */
  bron: string;
  /** YYYY-MM-DD van de toestemming. */
  toestemmingsdatum: string;
}

/** Een tweede vertrekpunt met alleen een autotijd, bv. een station. */
export interface ExtraVertrekpunt {
  van: string;
  autoMin: number;
}

interface LocatieInhoud {
  slug: LocatieSlug;
  bijgewerkt: string;
  /** Hoofdplaats, bv. "Hilversum". */
  plaats: string;
  /** Ook gedekt door deze pagina, bv. Naarden bij Bussum. */
  gedektePlaatsen: readonly string[];
  seo: Seo;
  eyebrow: string;
  h1: string;
  lead: string;
  cta: { primair: Link; secundair?: Link };
  voorheen: string;
  /** Centrum van de plaats voor de routekaart. */
  kaart: Coordinaat;
  /** Openbaar vervoer, alleen invullen als het echt werkt. */
  ov?: string;
  /** Eyebrow boven de quote-sectie, bv. "Ervaringen". */
  quoteEyebrow: string;
  quoteKop: string;
  /** Extra vertrekpunten met autotijd, naast het centrum van de plaats. */
  extraVertrekpunten?: readonly ExtraVertrekpunt[];
  tijden: {
    eyebrow: string;
    titel: string;
    tekst: string;
    /** Marlon: vaste PT-tijden of in overleg? Wacht op Marlon. */
    ptTijden?: string;
  };
  aanbod: {
    eyebrow: string;
    titel: string;
    regels: readonly AanbodRegel[];
  };
  faqKop: { eyebrow: string; titel: string };
  buurplaatsen: readonly PlaatsLink[];
  afsluiter: Afsluiter;
  areaServed: readonly string[];
  serviceType: string;
}

export interface LocatieConcept extends LocatieInhoud {
  status: "concept";
  reistijdAutoMin?: number;
  /** Beginpunt van de autotijd, bv. "het centrum van Hilversum". */
  reistijdAutoVanaf?: string;
  reistijdFietsMin?: number;
  reistijdFietsVanaf?: string;
  parkeren?: string;
  quote?: Quote;
  faq: readonly FaqConcept[];
}

export interface LocatieLive extends LocatieInhoud {
  status: "live";
  reistijdAutoMin: number;
  reistijdAutoVanaf: string;
  reistijdFietsMin: number;
  reistijdFietsVanaf: string;
  parkeren: string;
  quote: Quote;
  /** Precies 3 lokale vragen met antwoord. */
  faq: readonly [FaqLive, FaqLive, FaqLive];
}

export type LocatiePagina = LocatieConcept | LocatieLive;

// ---------------------------------------------------------------------------
// Hubpagina
// ---------------------------------------------------------------------------

interface HubPlaatsInhoud extends Coordinaat {
  naam: string;
  /** Eigen locatiepagina; die plaatsen krijgen een grote kaart en een "Meer"-link. */
  pagina?: LocatieSlug;
  /** Alleen bij plaatsen met een eigen pagina. */
  omschrijving?: string;
}

export interface HubPlaatsConcept extends HubPlaatsInhoud {
  reistijdAutoMin?: number;
  reistijdFietsMin?: number;
}

export interface HubPlaatsLive extends HubPlaatsInhoud {
  reistijdAutoMin: number;
  reistijdFietsMin: number;
}

export interface WaaromPunt {
  titel: string;
  tekst: string;
}

interface HubInhoud {
  slug: "personal-trainer-gooi";
  bijgewerkt: string;
  seo: Seo;
  eyebrow: string;
  h1: string;
  lead: string;
  cta: { primair: Link; secundair?: Link };
  voorheen: string;
  plaatsenKop: { eyebrow: string; titel: string };
  reistijden: { eyebrow: string; titel: string; intro: string };
  waarom: { eyebrow: string; titel: string; punten: readonly WaaromPunt[] };
  aanbod: {
    eyebrow: string;
    titel: string;
    regels: readonly AanbodRegel[];
  };
  afsluiter: Afsluiter;
  areaServed: readonly string[];
  serviceType: string;
}

export interface HubConcept extends HubInhoud {
  status: "concept";
  plaatsen: readonly HubPlaatsConcept[];
}

export interface HubLive extends HubInhoud {
  status: "live";
  plaatsen: readonly HubPlaatsLive[];
}

export type HubPagina = HubConcept | HubLive;

export type LokaalPagina = DienstPagina | LocatiePagina | HubPagina;
