import { CANONICAL_ORIGIN } from "./registry";
import { normalizePath } from "./normalize";
import type { LegacyDomain, MappingRule } from "./types";

const ACME_ROOT = "/.well-known/acme-challenge";

/** ACME-challenges op oude hosts worden nooit afgevangen. */
export function isAcmeChallenge(rawPathname: string): boolean {
  const path = normalizePath(rawPathname);
  return path === ACME_ROOT || path.startsWith(`${ACME_ROOT}/`);
}

/**
 * Zoek de regel voor een pad. Exact en suffix (patroon voor technische
 * bestanden) gaan voor prefix; bij prefixen wint de langste.
 */
export function findRule(
  domain: LegacyDomain,
  rawPathname: string,
): MappingRule | null {
  const path = normalizePath(rawPathname);

  for (const rule of domain.rules) {
    if (rule.kind === "exact" && rule.path === path) return rule;
  }
  for (const rule of domain.rules) {
    if (rule.kind === "suffix" && path.endsWith(rule.path)) return rule;
  }

  let best: MappingRule | null = null;
  for (const rule of domain.rules) {
    if (rule.kind !== "prefix") continue;
    if (path === rule.path || path.startsWith(`${rule.path}/`)) {
      if (!best || rule.path.length > best.path.length) best = rule;
    }
  }
  return best;
}

/**
 * De absolute doel-URL op de canonieke TMC-host. Inkomende query strings
 * worden niet doorgegeven. Technische bestanden krijgen geen UTM.
 */
export function resolveTargetUrl(
  domain: LegacyDomain,
  rawPathname: string,
): string {
  const rule = findRule(domain, rawPathname);
  const target = rule ? rule.target : domain.fallback;
  const withUtm = rule ? rule.utm !== false : true;
  const base = `${CANONICAL_ORIGIN}${target}`;
  if (!withUtm) return base;
  return `${base}?utm_source=${domain.utmSource}&utm_medium=redirect`;
}
