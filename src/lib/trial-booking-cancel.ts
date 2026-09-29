import "server-only";
import { processPaymentRefund } from "@/lib/refunds/process";
import { sendTrialBookingCancelledEmail } from "@/lib/trial-booking-email";

/**
 * Wat er na de commit van een annulering door de studio gebeurt, voor alle
 * paden hetzelfde (losse admin-annulering, sessie-annulering, webhook-
 * bijvangst): refund-intentie bij Mollie indienen als die er is, daarna de
 * annuleringsmail. Een mislukte refund of mail draait de annulering nooit
 * terug; de refund blijft als requested/failed zichtbaar met retry-knop.
 */
export interface CancelCoreResult {
  ok: boolean;
  reason?: string;
  trial_booking_id?: string;
  session_id?: string;
  trial_code_id?: string | null;
  price_paid_cents?: number;
  refund_id?: string | null;
  refund_amount_cents?: number | null;
  refund_skipped?: string | null;
}

export interface FinalizeOutcome {
  refundStatus: string | null;
  refundOk: boolean | null;
  mailed: boolean;
}

export async function finalizeTrialBookingCancellation(
  result: CancelCoreResult,
  reason: string,
): Promise<FinalizeOutcome> {
  let refundStatus: string | null = null;
  let refundOk: boolean | null = null;
  let refundAmount: number | null = null;

  if (result.refund_id) {
    const r = await processPaymentRefund(result.refund_id);
    refundOk = r.ok;
    refundStatus = r.status;
    refundAmount = r.ok ? r.amountCents : (result.refund_amount_cents ?? null);
  } else if ((result.price_paid_cents ?? 0) > 0 && result.refund_skipped === "refund_already_active") {
    // Er loopt al een terugbetaling (eerdere poging); de mail mag dat gewoon zeggen.
    refundAmount = result.price_paid_cents ?? null;
  }

  const mailed = result.trial_booking_id
    ? await sendTrialBookingCancelledEmail({
        trialBookingId: result.trial_booking_id,
        reason,
        refundAmountCents: refundAmount,
      })
    : false;

  return { refundStatus, refundOk, mailed };
}
