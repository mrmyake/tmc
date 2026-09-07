"use client";

import { useState, useTransition } from "react";
import { getInvoiceDownloadUrl } from "@/lib/member/invoice-actions";

/**
 * On-demand: geen signed URL vooraf voor elke rij op de pagina (tot vijftig
 * per paginaload), alleen bij een klik. Sluit aan bij de vijf-minuten-TTL
 * uit 5.4: de URL wordt direct gevolgd, nooit bewaard.
 */
export function InvoiceDownloadButton({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await getInvoiceDownloadUrl(invoiceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
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
        {isPending ? "Bezig…" : "Download"}
      </button>
      {error && (
        <p className="text-text-muted text-xs max-w-[14rem] text-right">
          {error}
        </p>
      )}
    </div>
  );
}
