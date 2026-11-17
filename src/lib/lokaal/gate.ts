import { redirect } from "next/navigation";
import type { LokaalPagina } from "@/content/lokaal";
import { conceptRedirectHref } from "./links";

/**
 * Roept redirect() aan (307) als conceptRedirectHref een route geeft. Los van
 * links.ts, zodat de pure logica zonder next/navigation te testen blijft.
 */
export function gateConcept(pagina: LokaalPagina): void {
  const href = conceptRedirectHref(pagina, process.env.VERCEL_ENV);
  if (href) redirect(href);
}
