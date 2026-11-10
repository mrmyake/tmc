import { invoiceDueDate } from "@/lib/invoice-terms";

/**
 * Betaalstatus van een factuur voor lid, admin en betaalpagina
 * (spec-facturatie.md 9.7). Eén bron voor de labels, zodat lid en admin
 * exact dezelfde woorden zien. De status is afgeleid, niet opgeslagen:
 * betaald = een gekoppelde betaling (invoices.payment_id), gecrediteerd =
 * gefinaliseerde creditnota's die het totaal dekken, vervallen = de
 * vervaldatum (factuurdatum plus de betaaltermijn) ligt in het verleden.
 */
export type InvoicePaymentStatus =
  | "open"
  | "vervallen"
  | "betaald"
  | "gecrediteerd";

// COPY: confirm met Marlon
export const INVOICE_STATUS_LABEL: Record<InvoicePaymentStatus, string> = {
  open: "Open",
  vervallen: "Vervallen",
  betaald: "Betaald",
  gecrediteerd: "Gecrediteerd",
};

/** Vandaag als yyyy-mm-dd in UTC, de vorm waarin issued_at is opgeslagen. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface InvoiceStatusInput {
  isCreditNote: boolean;
  totalGrossCents: number;
  /** Som van gefinaliseerde creditnota's op deze factuur, als positief bedrag. */
  creditedCents: number;
  /** Er is een gekoppelde betaling (invoices.payment_id is gezet). */
  paid: boolean;
  /** yyyy-mm-dd */
  issuedAt: string;
  /** yyyy-mm-dd */
  today: string;
}

/** Een creditnota heeft geen betaalstatus (null). */
export function invoicePaymentStatus(
  i: InvoiceStatusInput,
): InvoicePaymentStatus | null {
  if (i.isCreditNote) return null;
  if (i.totalGrossCents > 0 && i.creditedCents >= i.totalGrossCents) {
    return "gecrediteerd";
  }
  if (i.paid) return "betaald";
  // Datums zijn yyyy-mm-dd, dus een stringvergelijking is een datumvergelijking.
  if (i.today > invoiceDueDate(i.issuedAt)) return "vervallen";
  return "open";
}

/**
 * Mag er online voor betaald worden? Alleen een gefinaliseerde factuur (geen
 * creditnota) met een positief totaal, zonder gekoppelde betaling en niet
 * volledig gecrediteerd. Het te innen bedrag is altijd exact
 * total_gross_cents (display-equals-charge).
 */
export function canPayOnline(i: {
  status: string;
  isCreditNote: boolean;
  totalGrossCents: number | null;
  paymentId: string | null;
  creditedCents: number;
}): boolean {
  const total = i.totalGrossCents ?? 0;
  return (
    i.status === "finalised" &&
    !i.isCreditNote &&
    total > 0 &&
    i.paymentId === null &&
    i.creditedCents < total
  );
}
