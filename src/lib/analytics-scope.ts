/**
 * De meetgrens als code: welke paden meet GA4 (G-2VFCDM4KRZ)?
 *
 * Dit bestand is leidend; `spec-analytics-scope.md` verwijst ernaar.
 * Het is een ALLOWLIST: een pad dat hier niet in staat wordt niet gemeten.
 * Een nieuwe publieke pagina moet dus bewust worden toegevoegd.
 *
 * Prefix-match op padsegmenten: "/proefles" matcht "/proefles" en
 * "/proefles/boeken", niet "/proefles-extra". Querystring en hash tellen
 * niet mee, een trailing slash ook niet.
 */

/** Exact te matchen paden (geen subpaden). */
const EXACT_PATHS = ["/"] as const;

/** Paden die zelf en alles eronder gemeten worden. */
const PREFIX_PATHS = [
  "/over",
  "/aanbod",
  "/prijzen",
  "/rooster",
  "/contact",
  "/proefles",
  "/welke-yoga-past-bij-jou",
  "/yoga",
  "/12-weken-programma",
  "/huisregels",
  "/voorwaarden",
  "/privacybeleid",
  "/abonnement",
  "/kopen",
] as const;

/** Uitzonderingen binnen een gemeten prefix: zelfservice na conversie. */
const EXCLUDED_PREFIXES = ["/proefles/annuleren"] as const;

function normalise(pathname: string): string {
  const [path] = pathname.split(/[?#]/);
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed === "" ? "/" : trimmed;
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isMeasuredPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = normalise(pathname);
  if (EXCLUDED_PREFIXES.some((p) => matchesPrefix(path, p))) return false;
  if ((EXACT_PATHS as readonly string[]).includes(path)) return true;
  return PREFIX_PATHS.some((p) => matchesPrefix(path, p));
}
