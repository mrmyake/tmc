"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startPaymentLinkCheckout } from "@/lib/orders/payment-link";

// COPY: confirm met Marlon
const ERROR_COPY: Record<string, string> = {
  expired: "Deze betaallink is verlopen.",
  already_paid: "Deze bestelling is al betaald.",
  processing:
    "Je betaling wordt nog verwerkt. Ververs deze pagina over een paar minuten.",
  not_found: "Deze betaallink is niet (meer) geldig.",
  try_again: "Er ging iets mis. Probeer het opnieuw.",
};

/**
 * Start de checkout via de server action. Disabled tijdens de aanvraag
 * tegen dubbelkliks; de echte dubbele-betaling-preventie zit server-side
 * (payment-link-core.ts). Bij expired/already_paid verversen we de pagina,
 * die toont dan de juiste eindstaat.
 */
export function PayButton({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await startPaymentLinkCheckout(token);
      if (res.ok) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setError(ERROR_COPY[res.reason] ?? ERROR_COPY.try_again);
      if (res.reason === "expired" || res.reason === "already_paid") {
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
        {isPending ? "Even geduld…" : "Betaal via Mollie"}
      </button>
      {error && (
        <p className="text-sm text-red-400 mt-4" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
