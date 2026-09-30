/**
 * De rij die de Mollie-webhook in tmc.payments upsert (onConflict
 * mollie_payment_id). Pure functie zodat scripts/checkout kan bewijzen dat
 * een betaling van de gastcheckout (metadata type checkout_intent) de
 * kolommen order_id en profile_id NIET meestuurt: die koppeling legt
 * convert_checkout_intent later op dezelfde rij, en een volgende webhook
 * voor dezelfde betaling (retry, refund) mag hem niet weer op null zetten.
 */
export interface PaymentUpsertInput {
  payment: {
    id: string;
    status: string;
    amountValue: string;
    method: string | null;
    description: string | null;
    paidAt: string | null;
    subscriptionId: string | null;
  };
  mode: "live" | "test";
  membershipId?: string;
  ptBookingId?: string;
  orderId?: string;
  profileId?: string;
  /** Gezet bij metadata.type === "checkout_intent". */
  intentId?: string;
}

export function buildPaymentUpsertRow(input: PaymentUpsertInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    mollie_payment_id: input.payment.id,
    is_test: input.mode === "test",
    membership_id: input.membershipId ?? null,
    pt_booking_id: input.ptBookingId ?? null,
    amount_cents: Math.round(parseFloat(input.payment.amountValue) * 100),
    status: input.payment.status,
    method: input.payment.method,
    description: input.payment.description,
    paid_at: input.payment.paidAt,
    mollie_subscription_id: input.payment.subscriptionId,
  };
  if (!input.intentId) {
    row.order_id = input.orderId ?? null;
    row.profile_id = input.profileId ?? null;
  }
  return row;
}
