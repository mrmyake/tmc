import type { LegacyDomain, MappingRule } from "./types";

/** Canonieke TMC-host: www, geen trailing slash (behalve de root). */
export const CANONICAL_ORIGIN = "https://www.themovementclub.nl";

function exact(path: string, target: string): MappingRule {
  return { kind: "exact", path, target };
}

/** 410 Gone voor een exact pad (geen redirect). */
function goneExact(path: string): MappingRule {
  return { kind: "exact", path, target: "/", gone: true };
}

/** 410 Gone voor het pad zelf en alles eronder. */
function gonePrefix(path: string): MappingRule {
  return { kind: "prefix", path, target: "/", gone: true };
}

/** Technisch bestand: doel is het gelijknamige bestand op TMC. */
function technical(kind: "exact" | "suffix", path: string, target: string): MappingRule {
  return { kind, path, target };
}

const PT_LOOSDRECHT_RULES: readonly MappingRule[] = [
  exact("/", "/"),

  // Aanbod en dienstpagina's.
  exact("/personal-training-loosdrecht", "/personal-training"),
  exact("/kettlebell-training", "/kettlebell-training"),
  exact("/kettlebell-bootcamp", "/kettlebell-training"),
  // De live pagina gaat over PT, kettlebell, herstel en hormoonprofiel, niet
  // over het 12-wekenprogramma: doel is /aanbod (zie spec-legacy-domains.md).
  exact("/training-en-begeleiding", "/aanbod"),

  exact("/ervaren-personal-trainer", "/over"),
  exact("/ervaren-personal-trainer-2", "/over"),
  // Blijft /over tot het hormoonprofiel-besluit.
  exact("/personal-hormonal-profiling", "/over"),
  exact("/kosten", "/prijzen"),
  exact("/personal-training-loosdrecht-contact", "/contact"),
  exact("/neem-contact-op", "/contact"),

  // Locatiepagina's.
  exact("/personal-trainer-hilversum", "/personal-trainer-hilversum"),
  exact("/personal-trainer-bussum", "/personal-trainer-bussum"),
  exact("/personal-trainer-laren", "/personal-trainer-laren"),
  exact("/personal-trainer-gooi", "/personal-trainer-gooi"),
  exact("/personal-trainer-wijdemeren", "/personal-training"),

  // Ultimate Member-pagina's zonder TMC-equivalent.
  exact("/account", "/"),
  exact("/login", "/"),
  exact("/logout", "/"),
  exact("/members", "/"),
  exact("/password-reset", "/"),
  exact("/register", "/"),
  exact("/user", "/"),
  exact("/xmlrpc.php", "/"),

  // 410 Gone: oude variant, themademo-inhoud, WordPress-archieven en media.
  goneExact("/training-en-begeleiding-old"),
  gonePrefix("/product"),
  gonePrefix("/product-category"),
  gonePrefix("/product-tag"),
  gonePrefix("/portfolio"),
  gonePrefix("/portfolio-category"),
  gonePrefix("/category"),
  gonePrefix("/tag"),
  gonePrefix("/author"),
  gonePrefix("/page"),
  gonePrefix("/feed"),
  gonePrefix("/comments"),
  gonePrefix("/wp-content"),
  gonePrefix("/wp-json"),
  gonePrefix("/wp-admin"),
  gonePrefix("/wp-includes"),
  goneExact("/wp-login.php"),

  // Technische bestanden.
  technical("exact", "/robots.txt", "/robots.txt"),
  technical("exact", "/sitemap.xml", "/sitemap.xml"),
  technical("exact", "/sitemap_index.xml", "/sitemap.xml"),
  technical("exact", "/wp-sitemap.xml", "/sitemap.xml"),
  technical("exact", "/sitemap.rss", "/sitemap.xml"),
  technical("suffix", "-sitemap.xml", "/sitemap.xml"),
  technical("exact", "/favicon.ico", "/favicon.ico"),
];

/**
 * Het register, op apex-domein. Een host die hier niet in staat, loopt door
 * de bestaande proxy-flow. De mapping staat in code; Global Config bepaalt
 * alleen de modus.
 */
export const LEGACY_DOMAINS: Readonly<Record<string, LegacyDomain>> = {
  "ptloosdrecht.nl": {
    domain: "ptloosdrecht.nl",
    defaultMode: "redirect_permanent",
    rules: PT_LOOSDRECHT_RULES,
    fallback: "/",
  },
  // Eigen site of doorverwijzing naar de sectie op TMC: de afhandeling staat
  // in src/lib/hormoonprofiel (spec-hormoonprofiel.md), niet in deze regels.
  "hormoonprofiel.com": {
    domain: "hormoonprofiel.com",
    utmSource: "hormoonprofiel",
    defaultMode: "standalone",
    allowStandalone: true,
    rules: [],
    fallback: "/",
  },
};
