"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startInvoicePayment } from "@/lib/invoice-payments/start-payment";
import { openCheckout } from "@/lib/native/checkout";

// COPY: confirm met Marlon
const ERROR_COPY: Record<string, string> = {
  already_paid: "Deze factuur is al betaald.",
  credited: "Deze factuur is gecrediteerd; er is niets te betalen.",
  processing:
    "Je betaling wordt nog verwerkt. Ververs deze pagina over een paar minuten.",
  unavailable:
    "Online betalen kan hier niet. Maak het bedrag over naar de gegevens op de factuur.",
  not_found: "Deze betaallink is niet (meer) geldig.",
  try_again: "Er ging iets mis. Probeer het opnieuw.",
};

/**
 * Start de betaling pas bij een klik (niet bij het openen van de pagina):
 * mailscanners, QR-voorbeelden en prefetch openen links zonder te betalen en
 * mogen geen betaling minten. De echte dubbele-betaling-preventie zit
 * server-side (pay-core.ts).
 */
export function PayButton({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await startInvoicePayment(token);
      if (res.ok) {
        await openCheckout(res.checkoutUrl);
        return;
      }
      setError(ERROR_COPY[res.reason] ?? ERROR_COPY.try_again);
      if (res.reason === "already_paid" || res.reason === "credited") {
        router.refresh();
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center px-10 py-4 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait"
      >
        {/* COPY: confirm met Marlon */}
        {isPending ? "Even geduld…" : "Betaal online"}
      </button>
      {error && (
        <p className="text-sm text-red-400 mt-4" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
