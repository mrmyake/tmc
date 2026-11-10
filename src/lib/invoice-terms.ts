/**
 * Betaalvoorwaarden en kleine helpers rond de verkoopfactuur
 * (spec-facturatie.md 5.2, 5.5). Pure functies zonder server-only
 * afhankelijkheden, zodat PDF, mail en tests ze delen.
 *
 * De vervaldatum is geen kolom: hij wordt bij het renderen berekend uit
 * `issued_at` (factuurdatum) plus de betaaltermijn. Een datum als
 * "2026-11-10" is een kalenderdatum zonder tijdzone, dus de optelling
 * gebeurt in UTC: dan geeft elke serverzone hetzelfde antwoord.
 */

/** Betaaltermijn in dagen (besluit Ilja, 2026-11-10). */
export const PAYMENT_TERM_DAYS = 7;

/** Eigen bovengrens voor de PDF-bijlage; een factuur-PDF is tientallen kB. */
export const MAX_INVOICE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function parseIso(iso: string): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Ongeldige datum: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Telt dagen op bij een yyyy-mm-dd-datum, in UTC. */
export function addDaysIso(iso: string, days: number): string {
  const { y, m, d } = parseIso(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Vervaldatum: factuurdatum plus de betaaltermijn. */
export function invoiceDueDate(issuedAt: string): string {
  return addDaysIso(issuedAt, PAYMENT_TERM_DAYS);
}

/** "2026-11-10" naar "10-11-2026"; zonder Date, dus zonder tijdzone. */
export function formatNlDate(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

/** Bestandsnaam van de bijlage in de factuurmail. */
export function invoiceAttachmentName(
  invoiceNumber: string,
  isCreditNote: boolean,
): string {
  // COPY: confirm met Marlon
  return `${isCreditNote ? "Creditnota" : "Factuur"} ${invoiceNumber}.pdf`;
}

/** IBAN zonder spaties, hoofdletters: de vorm waarin hij wordt opgeslagen. */
export function normaliseIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** IBAN in groepen van vier voor weergave: "NL36 RABO 0175 6438 06". */
export function formatIban(raw: string): string {
  return normaliseIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

export interface PaymentDetails {
  /** Gegroepeerd voor weergave. */
  iban: string;
  accountHolder: string;
}

/**
 * Overmaakgegevens: Sanity wint per veld, de constants zijn de fallback
 * (zelfde patroon als KvK en BTW, 1.5). Een Sanity-document zonder
 * IBAN-veld geeft `undefined`, vandaar `||` per veld.
 */
export function resolvePaymentDetails(
  settingsIban: string | undefined | null,
  fallback: { iban: string; accountHolder: string },
): PaymentDetails {
  return {
    iban: formatIban(settingsIban?.trim() || fallback.iban),
    accountHolder: fallback.accountHolder,
  };
}
