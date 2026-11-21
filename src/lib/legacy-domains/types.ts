/** Modus per oud domein. Global Config bepaalt alleen deze waarde. */
export const LEGACY_MODES = [
  "off",
  "redirect_temporary",
  "redirect_permanent",
] as const;

export type LegacyMode = (typeof LEGACY_MODES)[number];

export function isLegacyMode(value: unknown): value is LegacyMode {
  return (
    typeof value === "string" &&
    (LEGACY_MODES as readonly string[]).includes(value)
  );
}

/**
 * Een mappingregel. Paden staan genormaliseerd in het register: lowercase,
 * zonder trailing slash (behalve de root "/").
 *  - exact:  het pad is gelijk aan `path`.
 *  - prefix: het pad is `path` of begint met `path` + "/".
 *  - suffix: het pad eindigt op `path` (voor het sitemap-patroon).
 */
export type MappingRule = {
  kind: "exact" | "prefix" | "suffix";
  path: string;
  /** Doelpad op de canonieke TMC-host (nu actief). */
  target: string;
  /** Technische bestanden krijgen geen UTM. Standaard true (wel UTM). */
  utm?: boolean;
  /** Het huidige doel is een tussenoplossing, wacht op een eigen pagina. */
  temporaryTarget: boolean;
  /**
   * Eindbestemming zodra de lokale landingspagina's bestaan. Niet-actief
   * veld: wordt in deze PR nergens voor routing gebruikt.
   */
  finalTarget: string;
};

export type LegacyDomain = {
  /** Apex-domein, lowercase, zonder www. */
  domain: string;
  /** Waarde van utm_source in de doel-URL. */
  utmSource: string;
  defaultMode: LegacyMode;
  rules: readonly MappingRule[];
  /** Doelpad voor alles wat niet matcht. */
  fallback: string;
};
