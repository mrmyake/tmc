export function formatEuro(amount: number): string {
  const n = new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `€${n},-`;
}

/**
 * Bedrag in centen naar "€79,00", altijd met twee decimalen. Voor alles wat
 * een geldbedrag met btw-splitsing toont (bevestigingsmail): daar mag niets
 * afgerond worden, in tegenstelling tot formatEuro voor prijskaarten.
 */
export function formatEuroCents(cents: number): string {
  const n = new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `€${n}`;
}
