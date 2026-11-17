import { LOKALE_PAGINAS, LOKAAL_SLUGS, type LokaalPagina, type LokaalSlug } from "@/content/lokaal";

/**
 * Waar een concept-pagina naartoe stuurt (tijdelijke redirect, 307). Een
 * redirect vanaf ptloosdrecht.nl komt zo nooit op een 404 uit.
 * Locatiepagina: de hub. Hub en dienstpagina's: /aanbod.
 */
export function fallbackHref(pagina: LokaalPagina): string {
  switch (pagina.slug) {
    case "personal-trainer-hilversum":
    case "personal-trainer-bussum":
    case "personal-trainer-laren":
      return "/personal-trainer-gooi";
    default:
      return "/aanbod";
  }
}

export function lokaalSlugFromHref(href: string): LokaalSlug | null {
  const path = href.split(/[?#]/)[0].replace(/^\//, "");
  return (LOKAAL_SLUGS as readonly string[]).includes(path)
    ? (path as LokaalSlug)
    : null;
}

/**
 * Interne link naar een van de acht pagina's: alleen als die pagina live is.
 * Anders null, zodat een live pagina nooit naar een redirect-pagina linkt.
 * Links naar andere routes komen ongewijzigd terug.
 */
export function resolveHref(href: string): string | null {
  const slug = lokaalSlugFromHref(href);
  if (!slug) return href;
  return LOKALE_PAGINAS[slug].status === "live" ? href : null;
}

export function paginaUrl(slug: LokaalSlug): string {
  return `/${slug}`;
}

/**
 * Waar een pagina naartoe moet redirecten, of null als hij moet renderen.
 * Alleen een 'concept'-pagina in productie (VERCEL_ENV === 'production')
 * redirect (307). Op preview en lokaal rendert een concept-pagina, met een
 * conceptbalk en noindex, zodat de pagina's te beoordelen zijn voor ze live
 * staan. Pure functie, zodat de tests beide gevallen dekken.
 */
export function conceptRedirectHref(
  pagina: LokaalPagina,
  vercelEnv: string | undefined,
): string | null {
  if (pagina.status !== "concept") return null;
  if (vercelEnv !== "production") return null;
  return fallbackHref(pagina);
}
