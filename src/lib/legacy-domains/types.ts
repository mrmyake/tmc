/**
 * Modus per oud domein. Global Config bepaalt alleen deze waarde.
 * `standalone` is alleen geldig voor een domein met `allowStandalone`
 * (hormoonprofiel.com): het domein draait dan als eigen site.
 */
export const LEGACY_MODES = [
  "off",
  "standalone",
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
  /**
   * True: het pad geeft 410 Gone in plaats van een redirect. `target` is dan
   * niet in gebruik (conventie: "/").
   */
  gone?: boolean;
};

export type LegacyDomain = {
  /** Apex-domein, lowercase, zonder www. */
  domain: string;
  /**
   * Waarde van utm_source in de doel-URL. Afwezig: geen query-parameters op
   * het doel (ptloosdrecht.nl, zodat organisch verkeer organisch blijft).
   */
  utmSource?: string;
  defaultMode: LegacyMode;
  /** True: de modus `standalone` is geldig. Alleen hormoonprofiel.com. */
  allowStandalone?: boolean;
  rules: readonly MappingRule[];
  /** Doelpad voor alles wat niet matcht. */
  fallback: string;
};
