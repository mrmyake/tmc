import type { LegacyDomain, MappingRule } from "./types";

/** Canonieke TMC-host: www, geen trailing slash (behalve de root). */
export const CANONICAL_ORIGIN = "https://www.themovementclub.nl";

function exact(
  path: string,
  target: string,
  finalTarget: string,
  temporaryTarget = false,
): MappingRule {
  return { kind: "exact", path, target, temporaryTarget, finalTarget };
}

function prefix(path: string): MappingRule {
  return {
    kind: "prefix",
    path,
    target: "/",
    temporaryTarget: false,
    finalTarget: "/",
  };
}

/** Technisch bestand: geen UTM, eindbestemming gelijk aan het doel. */
function technical(
  kind: "exact" | "suffix",
  path: string,
  target: string,
): MappingRule {
  return {
    kind,
    path,
    target,
    utm: false,
    temporaryTarget: false,
    finalTarget: target,
  };
}

const PT_LOOSDRECHT_RULES: readonly MappingRule[] = [
  exact("/", "/", "/"),

  // Aanbod. De eindbestemmingen bestaan als pagina in de lokale-pagina's-PR.
  exact("/personal-training-loosdrecht", "/aanbod", "/personal-training", true),
  exact("/kettlebell-training", "/aanbod", "/kettlebell-training", true),
  exact("/kettlebell-bootcamp", "/aanbod", "/kettlebell-training", true),
  // De live pagina gaat over PT, kettlebell, herstel en hormoonprofiel, niet
  // over het 12-wekenprogramma: doel is /aanbod (zie spec-legacy-domains.md).
  exact("/training-en-begeleiding", "/aanbod", "/aanbod"),
  exact("/training-en-begeleiding-old", "/aanbod", "/aanbod"),

  exact("/ervaren-personal-trainer", "/over", "/over"),
  exact("/ervaren-personal-trainer-2", "/over", "/over"),
  // Open: hangt af van het hormoonprofiel-besluit.
  exact("/personal-hormonal-profiling", "/over", "/over", true),
  exact("/kosten", "/prijzen", "/prijzen"),
  exact("/personal-training-loosdrecht-contact", "/contact", "/contact"),
  exact("/neem-contact-op", "/contact", "/contact"),

  // Locatiepagina's: tijdelijk naar /aanbod.
  exact("/personal-trainer-hilversum", "/aanbod", "/personal-trainer-hilversum", true),
  exact("/personal-trainer-bussum", "/aanbod", "/personal-trainer-bussum", true),
  exact("/personal-trainer-laren", "/aanbod", "/personal-trainer-laren", true),
  exact("/personal-trainer-gooi", "/aanbod", "/personal-trainer-gooi", true),
  exact("/personal-trainer-wijdemeren", "/aanbod", "/personal-training", true),

  // Ultimate Member-pagina's zonder TMC-equivalent.
  exact("/account", "/", "/"),
  exact("/login", "/", "/"),
  exact("/logout", "/", "/"),
  exact("/members", "/", "/"),
  exact("/password-reset", "/", "/"),
  exact("/register", "/", "/"),
  exact("/user", "/", "/"),

  // Themademo-inhoud, WordPress-archieven en media.
  prefix("/product"),
  prefix("/product-category"),
  prefix("/product-tag"),
  prefix("/portfolio"),
  prefix("/portfolio-category"),
  prefix("/category"),
  prefix("/tag"),
  prefix("/author"),
  prefix("/page"),
  prefix("/feed"),
  prefix("/comments"),
  prefix("/wp-content"),
  prefix("/wp-json"),
  prefix("/wp-admin"),
  prefix("/wp-includes"),
  exact("/wp-login.php", "/", "/"),
  exact("/xmlrpc.php", "/", "/"),

  // Technische bestanden: zonder UTM.
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
    utmSource: "ptloosdrecht",
    defaultMode: "redirect_permanent",
    rules: PT_LOOSDRECHT_RULES,
    fallback: "/",
  },
  // Plek in de configuratie; inhoudelijke afhandeling volgt apart.
  "hormoonprofiel.com": {
    domain: "hormoonprofiel.com",
    utmSource: "hormoonprofiel",
    defaultMode: "off",
    rules: [],
    fallback: "/",
  },
};
