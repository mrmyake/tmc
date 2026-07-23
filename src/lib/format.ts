export function formatEuro(amount: number): string {
  const n = new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `€${n},-`;
}
