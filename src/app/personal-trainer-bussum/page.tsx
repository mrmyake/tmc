import { ConceptBalk } from "@/components/blocks/lokaal/ConceptBalk";
import { LocatieTemplate } from "@/components/blocks/lokaal/LocatieTemplate";
import { LOKALE_PAGINAS } from "@/content/lokaal";
import { gateConcept } from "@/lib/lokaal/gate";
import { lokaalMetadata } from "@/lib/lokaal/metadata";

const pagina = LOKALE_PAGINAS["personal-trainer-bussum"];

// ISR: het rooster en de status mogen niet langer dan een minuut oud zijn.
export const revalidate = 60;

export function generateMetadata() {
  return lokaalMetadata(pagina);
}

/**
 * Status 'concept': in productie een tijdelijke redirect (307), nooit een 404,
 * zodat een redirect vanaf ptloosdrecht.nl altijd ergens landt. Op preview en
 * lokaal rendert de pagina met een conceptbalk en noindex. Zie gate.ts en
 * spec-locatiepaginas.md.
 */
export default function Page() {
  gateConcept(pagina);
  return (
    <>
      <ConceptBalk status={pagina.status} />
      <LocatieTemplate pagina={pagina} />
    </>
  );
}
