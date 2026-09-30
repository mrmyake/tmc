"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { openCheckout } from "@/lib/native/checkout";
import { retryGuestCheckoutPayment } from "@/lib/actions/guest-checkout";

// COPY: confirm met Marlon
const RETRY_COPY: Record<string, string> = {
  expired: "Je aanmelding is verlopen. Begin opnieuw via het aanbod.",
  already_paid: "Deze betaling is al binnen. Ververs de pagina.",
  processing: "Je vorige betaling wordt nog verwerkt. Wacht even en ververs de pagina.",
  try_again: "Dat lukte net niet. Probeer het zo nog eens.",
  not_found: "We kunnen deze aanmelding niet vinden. Begin opnieuw via het aanbod.",
};

/**
 * "Opnieuw proberen" op de publieke bedankpagina (scherm 6 onder): een nieuwe
 * Mollie-betaling op dezelfde intent, via retryGuestCheckoutPayment
 * (payment-link-invariant: hergebruik, deterministische key, compare-and-swap
 * in de RPC). Op "app" opent Mollie in de in-app browser.
 */
export function RetryPaymentButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const res = await retryGuestCheckoutPayment(token);
      if (!res.ok) {
        setError(RETRY_COPY[res.reason] ?? RETRY_COPY.try_again);
        if (res.reason === "already_paid") router.refresh();
        return;
      }
      await openCheckout(res.checkoutUrl);
    });
  }

  return (
    <div>
      <Button type="button" onClick={handleRetry} className={pending ? "opacity-50 pointer-events-none" : ""}>
        {/* COPY: confirm met Marlon */}
        {pending ? "Doorsturen..." : "Opnieuw proberen"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[color:var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
