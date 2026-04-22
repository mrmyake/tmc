import { ExternalLink } from "lucide-react";
import { PaymentRow } from "@/app/app/facturen/_components/PaymentRow";
import type { MemberDetail } from "@/lib/admin/member-detail-query";

export function PaymentsTab({ detail }: { detail: MemberDetail }) {
  const { payments } = detail;

  if (payments.length === 0) {
    return (
      <p className="text-text-muted text-sm py-8">
        Geen betalingen gevonden voor dit lid.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted text-sm max-w-xl">
        Klik op &ldquo;Open in Mollie&rdquo; om de betaling in het Mollie-
        dashboard te openen (voor handmatig herverwerken). Automatische retry
        gebeurt al via de webhook.
      </p>
      <div className="flex flex-col">
        {payments.map((p) => (
          <div
            key={p.id}
            className="border-b border-[color:var(--ink-500)]/60 py-2"
          >
            <PaymentRow
              row={{
                id: p.id,
                paidAt: p.paidAt,
                createdAt: p.createdAt,
                amountCents: p.amountCents,
                status: p.status,
                description: p.description,
                method: p.method,
                mollieId: p.mollieId,
              }}
            />
            {p.mollieId && (
              <a
                href={`https://my.mollie.com/dashboard/payments/${p.mollieId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
              >
                <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
                Open in Mollie
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
