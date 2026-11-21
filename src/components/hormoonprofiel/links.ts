import { HP_ORIGIN, HP_PATHS, sectionPath, type HpPageKey } from "@/lib/hormoonprofiel/slugs";

/** De twee schillen: eigen site (hormoonprofiel.com) of sectie op TMC. */
export type HpVariant = "standalone" | "section";

export const TMC_BASE = "https://www.themovementclub.nl";

/** Pad (relatief aan de eigen host) naar een pagina, met optioneel anker. */
export function pageHref(variant: HpVariant, key: HpPageKey, anchor?: string): string {
  const base = variant === "standalone" ? HP_PATHS[key] : sectionPath(key);
  return anchor ? `${base}#${anchor}` : base;
}

/** Link naar een TMC-pagina: relatief in de sectie, absoluut in standalone. */
export function tmcHref(variant: HpVariant, path: string): string {
  return variant === "standalone" ? `${TMC_BASE}${path}` : path;
}

/** Canonieke absolute URL van een pagina in de gegeven schil. */
export function canonicalUrl(variant: HpVariant, key: HpPageKey): string {
  return variant === "standalone"
    ? `${HP_ORIGIN}${HP_PATHS[key] === "/" ? "" : HP_PATHS[key]}`
    : `${TMC_BASE}${sectionPath(key)}`;
}
