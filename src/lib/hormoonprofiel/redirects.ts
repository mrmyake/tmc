import { normalizePath } from "@/lib/legacy-domains/normalize";
import {
  HP_ORIGIN,
  HP_SECTION_PATH,
  HP_PATHS,
  keyForPath,
  keyForSectionRest,
  sectionPath,
  type HpPageKey,
} from "./slugs";

/**
 * Alle beslissingen voor hormoonprofiel.com in een bestand, puur en zonder
 * Next-imports (spec-hormoonprofiel.md). De proxy voert uit wat hier besloten
 * wordt; de tests dekken elke rij voor elke modus.
 *
 * Modi: `standalone` serveert de eigen site, `redirect_temporary` (307) en
 * `redirect_permanent` (308) sturen alles in een hop naar de sectie op TMC.
 * `off` bestaat voor dit domein niet meer: resolveMode maakt er standalone
 * van, zodat een kale TMC-homepage op hormoonprofiel.com nooit voorkomt.
 */

export type HpMode = "standalone" | "redirect_temporary" | "redirect_permanent";

/** Canonieke TMC-origin (www), gelijk aan CANONICAL_ORIGIN in registry.ts. */
export const TMC_ORIGIN = "https://www.themovementclub.nl";

export type HpDecision =
  /** Laat het verzoek ongemoeid door (assets, de formulier-API). */
  | { kind: "passthrough" }
  /** Rewrite naar de interne route: `/hp-site` + `internalPath`. */
  | { kind: "rewrite"; internalPath: string }
  /** Eigen 404-pagina in de hormoonprofiel-stijl (rewrite met status 404). */
  | { kind: "notfound"; internalPath: string }
  /** 410 Gone. */
  | { kind: "gone" }
  /**
   * Redirect. `location` is absoluut, of een pad dat met "/" begint en dan
   * relatief is aan de host van het verzoek (zo blijft een preview op de
   * preview).
   */
  | { kind: "redirect"; status: 307 | 308; location: string };

const UTM = "utm_source=hormoonprofiel&utm_medium=redirect";

export function statusForMode(mode: HpMode): 307 | 308 {
  return mode === "redirect_temporary" ? 307 : 308;
}

// ---------------------------------------------------------------------------
// Tabellen (sectie C van de opdracht)
// ---------------------------------------------------------------------------

/** Oude shop- en restpagina's met een eigen bestemming (genormaliseerd pad). */
const EXACT_TO_PAGE: ReadonlyArray<readonly [string, HpPageKey]> = [
  ["/product/hormonen-in-balans", "hoewerkt"],
  ["/hormonen-in-balans", "hoewerkt"],
  ["/trainen-op-basis-van-hormoonprofiel", "training"],
];

/** Shoppaden die naar de home gaan. */
const EXACT_TO_HOME: readonly string[] = [
  "/winkelwagen",
  "/test-shop",
  "/payment-failed",
  "/payment-confirmation",
  "/shop-2",
  "/shop",
  "/afrekenen",
  "/mijn-account",
];
const PREFIX_TO_HOME: readonly string[] = [
  "/product",
  "/product-categorie",
  "/product-tag",
];

const EXACT_GONE: readonly string[] = [
  "/our-process",
  "/contact-sidebar",
  "/contact-minimal",
  "/contact-creative",
  "/contact-classic",
  "/portfolios",
  "/wp-login.php",
  "/xmlrpc.php",
  "/feed",
];
/** `pricing-*`, `services-*`, `wp-admin*`, `feed*`: begint met. */
const STARTS_WITH_GONE: readonly string[] = [
  "/pricing-",
  "/services-",
  "/wp-admin",
  "/feed",
];
/** `/portfolios/*`, `/wp-content/*`, `/wp-includes/*`, `/comments/feed*`. */
const PREFIX_GONE: readonly string[] = [
  "/portfolios",
  "/wp-content",
  "/wp-includes",
];

/** Queryparameters van de oude shop: het hele verzoek gaat naar de home. */
const SHOP_QUERY_PARAMS: readonly string[] = ["add-to-cart", "p"];

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isGonePath(rawPath: string): boolean {
  const path = normalizePath(rawPath);
  if (EXACT_GONE.includes(path)) return true;
  if (STARTS_WITH_GONE.some((p) => path.startsWith(p))) return true;
  if (PREFIX_GONE.some((p) => matchesPrefix(path, p))) return true;
  return path === "/comments/feed" || path.startsWith("/comments/feed");
}

function hasShopQuery(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search);
  return SHOP_QUERY_PARAMS.some((key) => params.has(key));
}

/** Overige queryparameters van de preview-override horen niet in een redirect. */
function cleanSearch(search: string): string {
  if (!search) return "";
  const params = new URLSearchParams(search);
  params.delete("__host");
  params.delete("__mode");
  const out = params.toString();
  return out ? `?${out}` : "";
}

/** Doelpad op TMC voor een genormaliseerd standalone-pad. */
function tmcTargetFor(key: HpPageKey | "home-fallback"): string {
  return key === "home-fallback" ? HP_SECTION_PATH : sectionPath(key);
}

function toTmc(mode: HpMode, key: HpPageKey | "home-fallback"): HpDecision {
  return {
    kind: "redirect",
    status: statusForMode(mode),
    location: `${TMC_ORIGIN}${tmcTargetFor(key)}?${UTM}`,
  };
}

// Technische bestanden.
const SITEMAP_ALIASES = new Set([
  "/sitemap_index.xml",
  "/wp-sitemap.xml",
  "/sitemap.rss",
]);

function technicalFile(path: string): "robots" | "sitemap" | "favicon" | null {
  if (path === "/robots.txt") return "robots";
  if (path === "/sitemap.xml" || SITEMAP_ALIASES.has(path) || path.endsWith("-sitemap.xml")) {
    return "sitemap";
  }
  if (path === "/favicon.ico" || path === "/favicon.svg") return "favicon";
  return null;
}

/** Paden die in standalone nooit herschreven of omgeleid worden. */
const PASSTHROUGH_PREFIXES: readonly string[] = [
  "/_next",
  "/_vercel",
  "/hp-assets",
  "/.well-known",
  "/api/leads/hormoonprofiel",
];

// ---------------------------------------------------------------------------
// Beslissing voor een verzoek op hormoonprofiel.com
// ---------------------------------------------------------------------------

export interface HpRequest {
  mode: HpMode;
  /** Ruw pad uit het verzoek (met eventuele trailing slash of hoofdletters). */
  pathname: string;
  /** Query string inclusief "?", of "". */
  search: string;
  /** True voor www.hormoonprofiel.com. */
  www: boolean;
}

export function decideHormoonprofielRequest(req: HpRequest): HpDecision {
  const { mode, pathname, www } = req;
  const search = cleanSearch(req.search);
  const path = normalizePath(pathname);
  const standalone = mode === "standalone";

  // Assets en de formulier-API: alleen in standalone relevant. www stuurt ze
  // gewoon naar de apex, zodat er een canonieke host is.
  if (PASSTHROUGH_PREFIXES.some((p) => matchesPrefix(path, p))) {
    if (standalone && !www) return { kind: "passthrough" };
    if (standalone && www) {
      return { kind: "redirect", status: 308, location: `${HP_ORIGIN}${pathname}${search}` };
    }
  }

  // 410: in elke modus, ook op www.
  if (isGonePath(pathname)) return { kind: "gone" };

  // Technische bestanden.
  const tech = technicalFile(path);
  if (tech) {
    if (standalone) {
      if (www) {
        return {
          kind: "redirect",
          status: 308,
          location: `${HP_ORIGIN}${tech === "favicon" ? path : tech === "robots" ? "/robots.txt" : "/sitemap.xml"}`,
        };
      }
      const internal =
        tech === "robots" ? "/robots.txt" : tech === "sitemap" ? "/sitemap.xml" : "/favicon.svg";
      return { kind: "rewrite", internalPath: internal };
    }
    const target = tech === "robots" ? "/robots.txt" : tech === "favicon" ? "/favicon.ico" : "/sitemap.xml";
    return { kind: "redirect", status: statusForMode(mode), location: `${TMC_ORIGIN}${target}` };
  }

  // Oude shopquery: alles naar de home.
  if (hasShopQuery(req.search)) return homeRedirect(mode, www);

  // Oude shop- en restpagina's met een eigen bestemming.
  for (const [from, key] of EXACT_TO_PAGE) {
    if (path === from) return pageRedirect(mode, key, www);
  }
  if (EXACT_TO_HOME.includes(path) || PREFIX_TO_HOME.some((p) => matchesPrefix(path, p))) {
    return homeRedirect(mode, www);
  }

  // De tien pagina's.
  const key = keyForPath(path);
  if (key) {
    if (!standalone) return toTmc(mode, key);
    const canonical = HP_PATHS[key];
    if (www || pathname !== canonical) {
      // Een hop naar de canonieke vorm (apex, zonder slash, lowercase).
      return {
        kind: "redirect",
        status: 308,
        location: `${HP_ORIGIN}${canonical}${search}`,
      };
    }
    return { kind: "rewrite", internalPath: canonical };
  }

  // Onbekend.
  if (!standalone) return toTmc(mode, "home-fallback");
  if (www) {
    return { kind: "redirect", status: 308, location: `${HP_ORIGIN}${pathname}${search}` };
  }
  return { kind: "notfound", internalPath: pathname === "/" ? "/" : pathname };
}

function homeRedirect(mode: HpMode, www: boolean): HpDecision {
  if (mode === "standalone") {
    return { kind: "redirect", status: 308, location: www ? `${HP_ORIGIN}/` : "/" };
  }
  return toTmc(mode, "home");
}

function pageRedirect(mode: HpMode, key: HpPageKey, www: boolean): HpDecision {
  if (mode === "standalone") {
    const path = HP_PATHS[key];
    return { kind: "redirect", status: 308, location: www ? `${HP_ORIGIN}${path}` : path };
  }
  return toTmc(mode, key);
}

// ---------------------------------------------------------------------------
// Beslissing voor /hormoonprofiel/* op de TMC-host
// ---------------------------------------------------------------------------

export type TmcSectionDecision =
  | { kind: "serve" }
  | { kind: "redirect"; status: 307 | 308; location: string };

/**
 * `mode` is de modus van hormoonprofiel.com. Standalone (en dus ook off): er
 * bestaat maar een publieke versie, dus 307 naar hormoonprofiel.com. Een
 * redirect-modus toont de sectie; een pad met slash of hoofdletters gaat in
 * een hop naar de canonieke vorm.
 */
export function decideTmcSection(mode: HpMode, pathname: string): TmcSectionDecision {
  const path = normalizePath(pathname);
  const rest = path === HP_SECTION_PATH ? "" : path.slice(HP_SECTION_PATH.length);
  if (mode === "standalone") {
    const key = keyForSectionRest(rest);
    const target = key ? HP_PATHS[key] : rest === "" ? "/" : rest;
    return { kind: "redirect", status: 307, location: `${HP_ORIGIN}${target}` };
  }
  if (pathname !== path) {
    return { kind: "redirect", status: 308, location: `${TMC_ORIGIN}${path}` };
  }
  return { kind: "serve" };
}
