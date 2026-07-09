export function formatPriceEuro(cents: number): string {
  return `€${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}
