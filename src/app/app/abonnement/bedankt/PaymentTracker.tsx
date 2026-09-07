"use client";

import { useEffect } from "react";
import { trackPaymentReturnView } from "@/lib/analytics";

interface Props {
  status: string;
  transactionId: string;
}

/**
 * Aankomst-event op /app/abonnement/bedankt. Vuurt per unieke
 * transactionId één keer (sessionStorage-dedupe), zodat een refresh niet
 * opnieuw meet; de eerste aankomst-status is wat geteld wordt.
 *
 * Gedegradeerd van payment_success/payment_failed naar één
 * payment_return_view zónder value/currency (spec-analytics.md,
 * arrival-voorwaarde 3): de omzet loopt server-side via de Mollie-webhook
 * (sendPurchaseToGa4). payment_failed is hier volledig weg — het
 * server-side equivalent bestaat al als emitEvent "payment.failed" met
 * dedupe_key in de webhook.
 */
export function PaymentTracker({ status, transactionId }: Props) {
  useEffect(() => {
    const key = `tmc_payment_fired_${transactionId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* sessionStorage geblokkeerd — vuur zonder dedupe */
    }
    trackPaymentReturnView({ orderStatus: status });
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [status, transactionId]);
  return null;
}
