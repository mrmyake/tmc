import type { Metadata } from "next";
import type { LokaalPagina } from "@/content/lokaal";

/**
 * Metadata uit het contentbestand. Title is merkvrij (de layout-template voegt
 * " | The Movement Club" toe); canonical is relatief en resolvet via
 * metadataBase naar https://www.themovementclub.nl/<slug>.
 */
export function lokaalMetadata(pagina: LokaalPagina): Metadata {
  const path = `/${pagina.slug}`;
  return {
    // Een conceptpagina rendert alleen buiten productie en hoort nooit in de index.
    ...(pagina.status === "concept"
      ? { robots: { index: false, follow: false } }
      : {}),
    title: pagina.seo.title,
    description: pagina.seo.description,
    alternates: { canonical: path },
    openGraph: {
      title: `${pagina.seo.title} | The Movement Club`,
      description: pagina.seo.description,
      url: path,
      type: "website",
      locale: "nl_NL",
    },
  };
}
