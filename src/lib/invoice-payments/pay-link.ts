import { canPayOnline } from "./status";
import { invoicePayUrl } from "./pay-url";

/**
 * Beslist of een PDF of mail een betaallink (en QR, en knop "Betaal nu")
 * krijgt: alleen als de factuur online betaald kan worden EN online betalen
 * in de omgeving waar het document gemaakt wordt beschikbaar is
 * (onlinePaymentAvailable). Anders geen link en, bewust, geen token: een link
 * naar een host die niet kan innen (een LIVE-factuur op een preview) is erger
 * dan geen link, zeker in een write-once PDF. De PDF of mail valt dan terug op
 * alleen "Zelf overmaken". Zie spec-facturatie.md 9.7.
 *
 * Pure kern met geinjecteerde token-aanmaak, zodat het gedrag bewijsbaar is.
 */
export async function resolveInvoicePayLink(args: {
  invoice: {
    status: string;
    isCreditNote: boolean;
    totalGrossCents: number | null;
    paymentId: string | null;
  };
  creditedCents: number;
  /** onlinePaymentAvailable(invoice.is_test) in deze omgeving. */
  available: boolean;
  /** Maakt het token idempotent aan; wordt alleen aangeroepen als het mag. */
  ensureToken: () => Promise<string | null>;
  site: string;
}): Promise<string | null> {
  if (!args.available) return null;
  if (
    !canPayOnline({
      status: args.invoice.status,
      isCreditNote: args.invoice.isCreditNote,
      totalGrossCents: args.invoice.totalGrossCents,
      paymentId: args.invoice.paymentId,
      creditedCents: args.creditedCents,
    })
  ) {
    return null;
  }
  const token = await args.ensureToken();
  return token ? invoicePayUrl(args.site, token) : null;
}
