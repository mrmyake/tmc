import type { HpPageKey } from "../../src/lib/hormoonprofiel/slugs";

/**
 * Inhoudsmodel van hormoonprofiel.com en de sectie /hormoonprofiel op TMC.
 * Een bron, twee schillen (spec-hormoonprofiel.md): beide schillen renderen
 * uit deze data. Alle Nederlandse tekst in deze map: // COPY: confirm met Marlon.
 *
 * Geen prijzen, bedragen of bestelknoppen: scripts/hormoonprofiel/
 * no-prices.test.mts bewaakt dat.
 */

export interface HpLink {
  label: string;
  /** Intern pad op TMC (begint met "/"), of een absolute URL. */
  href: string;
}

export interface HpFaqItem {
  vraag: string;
  antwoord: string;
  /** Optionele verwijzing naar een andere pagina van dit onderwerp. */
  link?: { label: string; key: HpPageKey; anchor?: string };
}

export type HpBlock =
  | { type: "h2"; id: string; text: string; duration?: string }
  | { type: "p"; text: string }
  | { type: "questions"; items: readonly string[] }
  | { type: "get"; items: readonly { label: string; detail: string }[] }
  | { type: "list"; items: readonly string[] }
  | { type: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }
  | { type: "wn"; yes: readonly string[]; no: readonly string[] }
  | { type: "sources"; intro: string; items: readonly HpLink[] }
  /** Links naar TMC-pagina's; in standalone absolute URL's naar de TMC-site. */
  | { type: "tmcLinks"; intro: string; links: readonly HpLink[] };

export interface HpPage {
  key: HpPageKey;
  /** Onderwerp voor de title ("<onderwerp> | Hormoonprofiel" of "... | The Movement Club"). */
  topic: string;
  /** Afwijkend onderwerp voor de sectie, als de title daar anders moet zijn. */
  topicSection?: string;
  metaDescription: string;
  h1: string;
  eyebrow: string;
  /** 2 tot 3 zinnen, direct onder de kop. */
  inHetKort: string;
  blocks: readonly HpBlock[];
  faq?: readonly HpFaqItem[];
  related: readonly HpPageKey[];
  /** ISO-datum (yyyy-mm-dd). */
  dateModified: string;
}
