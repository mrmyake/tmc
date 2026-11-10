import { formatEuroCentsSigned } from "@/lib/format";

/**
 * Interne melding (ntfy en e-mail naar SITE.email) zodra een factuur betaald
 * is, online of als overboeking gemarkeerd. Een factuurbetaling activeert
 * niets: een product bij de factuur moet nog handmatig klaargezet worden,
 * en de melding zegt dat expliciet (spec-facturatie.md 9.7).
 */
export interface InvoicePaidNoticeInput {
  invoiceNumber: string;
  billToName: string | null;
  billToCompany: string | null;
  totalGrossCents: number;
  via: "online" | "overboeking";
  /** catalogue_slug van de factuurregels waar die er zijn (duplicaten weg). */
  catalogueSlugs: string[];
}

export interface InvoicePaidNotice {
  title: string;
  /** Platte regels, ook voor de e-mail. */
  lines: string[];
  message: string;
}

export function uniqueSlugs(slugs: Array<string | null | undefined>): string[] {
  return Array.from(new Set(slugs.filter((s): s is string => !!s)));
}

export function buildInvoicePaidNotice(
  i: InvoicePaidNoticeInput,
): InvoicePaidNotice {
  const customer = [i.billToCompany, i.billToName]
    .filter((p): p is string => !!p && p.trim() !== "")
    .join(", ");
  // COPY: confirm met Marlon
  const title = `Factuur ${i.invoiceNumber} is betaald`;
  const lines = [
    `Factuur ${i.invoiceNumber} is betaald (${i.via === "online" ? "online" : "overboeking"}).`,
    `Afnemer: ${customer || "onbekend"}.`,
    `Bedrag: ${formatEuroCentsSigned(i.totalGrossCents)}.`,
    i.catalogueSlugs.length > 0
      ? `Een product bij deze factuur (${i.catalogueSlugs.join(", ")}) moet nog handmatig klaargezet worden.`
      : "Hoort er een product bij deze factuur, dan moet dat nog handmatig klaargezet worden.",
  ];
  return { title, lines, message: lines.join(" ") };
}
