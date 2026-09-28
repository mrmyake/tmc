/**
 * Pure kern van de terugbetaling van een proefles (spec-community-growth.md
 * §1 "Annulering door de studio", spec-facturatie.md 4.7 en 7.4). Geen I/O,
 * zodat restbedrag, reconciliatie en idempotency in scripts/refunds/
 * getest kunnen worden zonder Mollie of database.
 */

export type PaymentRefundStatus =
  | "requested"
  | "queued"
  | "pending"
  | "processing"
  | "refunded"
  | "failed"
  | "canceled";

/** Mollie-statussen die betekenen: geld is onderweg of al terug. */
export const ACTIVE_REFUND_STATUSES: readonly PaymentRefundStatus[] = [
  "requested",
  "queued",
  "pending",
  "processing",
];

export interface PaymentRefundRow {
  id: string;
  paymentId: string;
  amountCents: number;
  status: PaymentRefundStatus;
  mollieRefundId: string | null;
}

/** De betaalregel (tmc.payments) zoals de webhook hem spiegelt. */
export interface PaymentRowLike {
  id: string;
  molliePaymentId: string;
  amountCents: number;
  refundedAmountCents: number;
  isTest: boolean;
}

/** Een refund zoals Mollie hem teruggeeft bij de betaling. */
export interface MollieRefundLike {
  id: string;
  status: string;
  amountCents: number;
  /** Ons payment_refunds.id uit metadata, als wij deze refund hebben gemaakt. */
  paymentRefundId: string | null;
}

/** Idempotency key richting Mollie: een per intentie, stabiel over retries. */
export function idempotencyKeyFor(refundId: string): string {
  return `tmc-refund-${refundId}`;
}

export function mapMollieRefundStatus(status: string): PaymentRefundStatus {
  switch (status) {
    case "queued":
    case "pending":
    case "processing":
    case "refunded":
    case "failed":
    case "canceled":
      return status;
    default:
      // Onbekende waarde uit een nieuwere API: niet als geslaagd behandelen.
      return "pending";
  }
}

export function eurosFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function centsFromMollieValue(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

/**
 * Restbedrag dat nog terug kan: het betaalde bedrag minus wat Mollie al als
 * terugbetaald meldt en minus wat bij Mollie nog onderweg is. Mollie's
 * eigen lijst is leidend boven onze rijen, zodat een retry na een time-out
 * nooit een tweede refund voor hetzelfde bedrag maakt.
 */
export function computeRemainingRefundCents(
  payment: Pick<PaymentRowLike, "amountCents" | "refundedAmountCents">,
  mollieRefunds: readonly MollieRefundLike[],
): number {
  const settled = mollieRefunds
    .filter((r) => r.status === "refunded")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const inFlight = mollieRefunds
    .filter((r) => r.status === "queued" || r.status === "pending" || r.status === "processing")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const alreadyBack = Math.max(payment.refundedAmountCents, settled);
  return Math.max(0, payment.amountCents - alreadyBack - inFlight);
}

export type RefundDecision =
  | { kind: "adopt"; mollieRefund: MollieRefundLike; status: PaymentRefundStatus }
  | { kind: "create"; amountCents: number }
  | { kind: "nothing_left" };

/**
 * Wat te doen met een intentie, gegeven wat Mollie al kent voor deze
 * betaling.
 * - Bestaat er bij Mollie al een refund met ons id in de metadata (een
 *   eerdere poging die na een time-out toch is doorgekomen): overnemen,
 *   niet opnieuw aanmaken.
 * - Is er niets meer terug te betalen (al volledig terug, of nog onderweg
 *   via een refund die niet van ons is): niets doen en de intentie sluiten.
 * - Anders: aanmaken voor het restbedrag, begrensd op het bedrag van de
 *   intentie.
 */
export function decideRefundAction(
  intent: PaymentRefundRow,
  payment: Pick<PaymentRowLike, "amountCents" | "refundedAmountCents">,
  mollieRefunds: readonly MollieRefundLike[],
): RefundDecision {
  const ours = mollieRefunds.find(
    (r) => r.paymentRefundId === intent.id || (intent.mollieRefundId !== null && r.id === intent.mollieRefundId),
  );
  if (ours) {
    return { kind: "adopt", mollieRefund: ours, status: mapMollieRefundStatus(ours.status) };
  }
  const remaining = computeRemainingRefundCents(payment, mollieRefunds);
  if (remaining <= 0) return { kind: "nothing_left" };
  return { kind: "create", amountCents: Math.min(remaining, intent.amountCents) };
}

/** Eerste regel van een fout, zonder stacktrace, geschikt voor last_error. */
export function describeRefundError(err: unknown): string {
  if (err instanceof Error) {
    const detail = (err as { field?: string; statusCode?: number }).statusCode;
    return `${err.name}: ${err.message}${detail ? ` (HTTP ${detail})` : ""}`.slice(0, 500);
  }
  return String(err).slice(0, 500);
}
