"use client";

import { useEffect } from "react";
import { trackPaymentSuccess, trackPaymentFailed } from "@/lib/analytics";

interface Props {
  status: string;
  amount: number;
  transactionId: string;
}

/**
 * Client-side event emitter op /app/abonnement/bedankt. Vuurt per
 * unieke transactionId één keer (sessionStorage-dedupe), zodat refresh
 * niet opnieuw meet.
 */
export function PaymentTracker({ status, amount, transactionId }: Props) {
  useEffect(() => {
    const key = `tmc_payment_fired_${transactionId}`;
    if (sessionStorage.getItem(key)) return;
    if (status === "activated") {
      trackPaymentSuccess({
        amount,
        context: "first_membership",
        transactionId,
      });
    } else if (status === "expired" || status === "cancelled") {
      trackPaymentFailed({
        amount,
        context: "first_membership",
        reason: "mollie_failed",
      });
    } else {
      return; // pending/paid — niks vuren
    }
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [status, amount, transactionId]);
  return null;
}
