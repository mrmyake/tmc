/**
 * Losstaand van revenue-report-query.ts (dat "server-only" importeert):
 * dit bestand wordt zowel server-side (omzet/page.tsx) als client-side
 * (OmzetCsvExport.tsx) geïmporteerd. Een functie kan niet als prop van
 * server- naar client-component; dezelfde kleine lookup op beide plekken
 * los importeren kan wel. UNKNOWN_RATE_CATEGORY staat daarom hier en niet
 * in revenue-report-query.ts, dat deze constante nu van hier importeert
 * -- de omgekeerde afhankelijkheid zou de server-only-guard alsnog in de
 * client-bundel trekken.
 */
export const UNKNOWN_RATE_CATEGORY = "tarief onbekend";
// COPY: confirm met Marlon
const CATEGORY_LABELS: Record<string, string> = {
  [UNKNOWN_RATE_CATEGORY]: "Tarief onbekend",
  proefles: "Proeflessen",
  abonnement: "Abonnementen",
  personal_training: "Personal training",
  les_tegoed: "Lestegoed",
  addon: "Add-ons",
  inschrijfgeld: "Inschrijfgeld",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
