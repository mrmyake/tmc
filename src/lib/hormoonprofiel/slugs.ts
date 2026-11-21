/**
 * De tien pagina's van hormoonprofiel.com en hun paden (spec-hormoonprofiel.md).
 * Bewust zonder imports en zonder inhoud: de proxy leest dit bestand, en de
 * inhoud (content/hormoonprofiel) is groot. De paden blijven 1:1 gelijk aan de
 * oude WordPress-site, ook de ankers.
 */

export const HP_ORIGIN = "https://hormoonprofiel.com";
/** Pad van de sectie op de TMC-site. */
export const HP_SECTION_PATH = "/hormoonprofiel";
/** Interne route van de standalone-schil. Nooit publiek bereikbaar. */
export const HP_INTERNAL_PREFIX = "/hp-site";

export const HP_PAGE_KEYS = [
  "home",
  "wat",
  "waarom",
  "hoewerkt",
  "training",
  "supplementen",
  "voeding",
  "profielen",
  "faq",
  "contact",
] as const;

export type HpPageKey = (typeof HP_PAGE_KEYS)[number];

/** Standalone-paden (zonder trailing slash, behalve de root). */
export const HP_PATHS: Readonly<Record<HpPageKey, string>> = {
  home: "/",
  wat: "/wat-is-personal-hormonal-profiling",
  waarom: "/waarom-is-een-persoonlijk-hormoonprofiel-belangrijk",
  hoewerkt: "/hoe-werkt-personal-hormonal-profiling",
  training: "/het-belang-van-hormoontraining",
  supplementen: "/voedingssupplementen",
  voeding: "/voedingsrichtlijnen",
  profielen: "/verschillende-hormoonprofielen",
  faq: "/veel-gestelde-vragen",
  contact: "/contact-gegevens",
};

/** Pad op de TMC-site: /hormoonprofiel of /hormoonprofiel/<slug>. */
export function sectionPath(key: HpPageKey): string {
  return key === "home" ? HP_SECTION_PATH : `${HP_SECTION_PATH}${HP_PATHS[key]}`;
}

/** Zoek de pagina bij een genormaliseerd standalone-pad ("/" of "/slug"). */
export function keyForPath(normalizedPath: string): HpPageKey | null {
  for (const key of HP_PAGE_KEYS) {
    if (HP_PATHS[key] === normalizedPath) return key;
  }
  return null;
}

/** Het deel na /hormoonprofiel ("" of "/slug") naar een pagina. */
export function keyForSectionRest(rest: string): HpPageKey | null {
  return keyForPath(rest === "" ? "/" : rest);
}
