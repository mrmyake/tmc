export function daysUntil(endDate?: string): number | null {
  if (!endDate) return null;
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function anonymizeName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "Anoniem";
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (parts.length === 1) return first;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function relativeTimeNL(dateString: string): string {
  const then = new Date(dateString).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "zojuist";
  if (m < 60) return `${m} min geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} dag${d === 1 ? "" : "en"} geleden`;
  const w = Math.floor(d / 7);
  return `${w} week${w === 1 ? "" : "en"} geleden`;
}
