/**
 * Bron van waarheid voor welke versie van welk juridisch document nu live
 * staat. Elke pagina in src/app/{voorwaarden,huisregels,onbegeleide-toegang}
 * toont zijn eigen entry onderaan de pagina (versienummer + datum), zodat
 * lezer en code altijd hetzelfde versienummer zien.
 *
 * In een volgende PR wordt dit bestand ook de bron voor de
 * acceptatie-registratie (welke versie een lid heeft geaccepteerd, wanneer).
 * Verhoog `version` en zet een nieuwe `date` zodra de tekst van een document
 * inhoudelijk wijzigt — leden accepteren per versie, niet per document.
 *
 * De privacyverklaring staat hier bewust niet in: dat is een informatieplicht
 * (AVG-kennisgeving), geen document waar een lid apart "akkoord" op geeft.
 */

export type LegalDocumentSlug =
  | "algemene_voorwaarden"
  | "huisregels"
  | "onbegeleide_toegang";

export interface LegalDocumentVersion {
  slug: LegalDocumentSlug;
  version: number;
  /** PLACEHOLDER: datum nog in te vullen. Niet zelf invullen — deze datum hoort bij het moment dat Marlon de tekst definitief maakt. */
  date: string;
}

export const LEGAL_DOCUMENT_VERSIONS: Record<
  LegalDocumentSlug,
  LegalDocumentVersion
> = {
  algemene_voorwaarden: {
    slug: "algemene_voorwaarden",
    version: 1,
    date: "[datum]", // PLACEHOLDER: datum
  },
  huisregels: {
    slug: "huisregels",
    version: 1,
    date: "[datum]", // PLACEHOLDER: datum
  },
  onbegeleide_toegang: {
    slug: "onbegeleide_toegang",
    version: 1,
    date: "[datum]", // PLACEHOLDER: datum
  },
};
