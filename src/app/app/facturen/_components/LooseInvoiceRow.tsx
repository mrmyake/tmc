import { formatEuroCentsSigned } from "@/lib/format";
import { formatDateLong } from "@/lib/format-date";
import { InvoiceDownloadButton } from "./InvoiceDownloadButton";

export interface LooseInvoiceRowData {
  id: string;
  invoiceNumber: string;
  issuedAt: string | null;
  totalGrossCents: number;
  isCreditNote: boolean;
}

/**
 * Factuur of creditnota zonder betaling (handmatig aangemaakt, spec 9.2).
 * Zelfde grid en typografie als PaymentRow, met een eigen label in plaats
 * van de betaalstatus.
 */
export function LooseInvoiceRow({ row }: { row: LooseInvoiceRowData }) {
  return (
    <article className="grid grid-cols-[1fr_auto] items-start gap-5 py-6 border-b border-[color:var(--ink-500)]/60">
      <div className="flex flex-col gap-1.5">
        {row.issuedAt && (
          <span className="tmc-eyebrow text-text-muted/70">
            {formatDateLong(new Date(row.issuedAt))}
          </span>
        )}
        <h3 className="text-text text-base leading-snug tracking-[-0.01em]">
          {/* COPY: confirm met Marlon */}
          {row.isCreditNote ? "Creditnota" : "Factuur"} {row.invoiceNumber}
        </h3>
      </div>
      <div className="text-right flex flex-col items-end gap-2">
        <span className="font-[family-name:var(--font-playfair)] text-2xl text-text tracking-[-0.02em] leading-none">
          {formatEuroCentsSigned(row.totalGrossCents)}
        </span>
        <InvoiceDownloadButton invoiceId={row.id} />
      </div>
    </article>
  );
}
