import { formatEuro } from "@/lib/format";
import { formatDateLong } from "@/lib/format-date";
import {
  PaymentStatusBadge,
  type PaymentStatus,
} from "./PaymentStatusBadge";
import { InvoiceDownloadButton } from "./InvoiceDownloadButton";

export interface PaymentRowData {
  id: string;
  paidAt: string | null;
  createdAt: string;
  amountCents: number;
  status: PaymentStatus | string;
  description: string | null;
  method: string | null;
  mollieId: string;
  /** Optioneel: bestaande consumers (bv. PaymentsTab in de admin
   * ledendetail) geven dit nog niet mee. Default 0 -- geen restitutie. */
  refundedAmountCents?: number;
  /** Alleen gezet als er een gefinaliseerde, niet-test factuur bestaat. */
  invoiceId?: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  ideal: "iDEAL",
  creditcard: "Creditcard",
  bancontact: "Bancontact",
  directdebit: "Automatische incasso",
  sofort: "Sofort",
  paypal: "PayPal",
  banktransfer: "Bankoverschrijving",
  applepay: "Apple Pay",
};

function formatDate(iso: string): string {
  return formatDateLong(new Date(iso));
}

export function PaymentRow({ row }: { row: PaymentRowData }) {
  const when = row.paidAt ?? row.createdAt;
  const methodLabel = row.method ? (METHOD_LABEL[row.method] ?? row.method) : null;
  const isFailed = row.status === "failed" || row.status === "expired";

  return (
    <article className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-start gap-5 py-6 border-b border-[color:var(--ink-500)]/60">
      <div className="flex flex-col gap-1.5">
        <span className="tmc-eyebrow text-text-muted/70">
          {formatDate(when)}
        </span>
        <h3 className="text-text text-base leading-snug tracking-[-0.01em]">
          {row.description ?? "Betaling"}
        </h3>
        {methodLabel && (
          <p className="text-text-muted text-xs">Via {methodLabel}</p>
        )}
        {isFailed && (
          <p className="text-text-muted text-xs mt-1 max-w-prose">
            Mollie probeert automatisch opnieuw. Blijft het hangen? Laat het
            Marlon even weten.
          </p>
        )}
      </div>
      <span className="hidden sm:flex flex-col items-end gap-2 pt-1">
        <PaymentStatusBadge
          status={row.status}
          refundedAmountCents={row.refundedAmountCents}
        />
        {row.invoiceId && <InvoiceDownloadButton invoiceId={row.invoiceId} />}
      </span>
      <div className="text-right flex flex-col items-end gap-2">
        <span className="font-[family-name:var(--font-playfair)] text-2xl text-text tracking-[-0.02em] leading-none">
          {formatEuro(Math.round(row.amountCents / 100))}
        </span>
        <span className="sm:hidden flex flex-col items-end gap-2">
          <PaymentStatusBadge
            status={row.status}
            refundedAmountCents={row.refundedAmountCents}
          />
          {row.invoiceId && <InvoiceDownloadButton invoiceId={row.invoiceId} />}
        </span>
      </div>
    </article>
  );
}
