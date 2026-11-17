import { redirect } from "next/navigation";
import { LocatieTemplate } from "@/components/blocks/lokaal/LocatieTemplate";
import { LOKALE_PAGINAS } from "@/content/lokaal";
import { fallbackHref } from "@/lib/lokaal/links";
import { lokaalMetadata } from "@/lib/lokaal/metadata";

const pagina = LOKALE_PAGINAS["personal-trainer-laren"];

// ISR: het rooster en de status mogen niet langer dan een minuut oud zijn.
export const revalidate = 60;

export function generateMetadata() {
  return lokaalMetadata(pagina);
}

/**
 * Status 'concept': tijdelijke redirect (307), nooit een 404, zodat een
 * redirect vanaf ptloosdrecht.nl altijd ergens landt. Zie spec-locatiepaginas.md.
 */
export default function Page() {
  if (pagina.status === "concept") redirect(fallbackHref(pagina));
  return <LocatieTemplate pagina={pagina} />;
}
