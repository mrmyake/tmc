"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoiceFromPayment } from "@/lib/admin/invoice-actions";

/** 9.1: "Factuur maken" op een paid-betaalregel in het ledendetail. */
export function MaakFactuurKnop({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await createInvoiceFromPayment(paymentId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/app/admin/facturen/${r.invoiceId}`);
    });
  }

  return (
    <span className="inline-flex items-center gap-2 mt-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-accent text-xs uppercase tracking-[0.14em] hover:text-text disabled:opacity-50"
      >
        {/* COPY: confirm met Marlon */}
        {isPending ? "Bezig…" : "Factuur maken"}
      </button>
      {error && <span className="text-[color:var(--danger)] text-xs">{error}</span>}
    </span>
  );
}
