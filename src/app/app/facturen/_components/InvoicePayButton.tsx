"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMyInvoicePayPath } from "@/lib/member/invoice-pay-actions";

/** Brengt het lid naar de betaalpagina van een openstaande factuur. */
export function InvoicePayButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await getMyInvoicePayPath(invoiceId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(r.path);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent hover:text-text transition-colors duration-300 disabled:opacity-50"
      >
        {/* COPY: confirm met Marlon */}
        {isPending ? "Bezig…" : "Betaal online"}
      </button>
      {error && (
        <p className="text-text-muted text-xs max-w-[14rem] text-right">{error}</p>
      )}
    </div>
  );
}
