/**
 * Pure kern van de payments-write in de Mollie-webhook (spec-facturatie.md
 * 6.5, webhook-betrouwbaarheid). Geen database, geen Mollie: de drie
 * stappen worden geïnjecteerd, zodat scripts/chargebacks/payment-write.test.mts
 * het gedrag met een nagebouwde PostgREST-tabel kan nalopen.
 *
 * Drie stappen, in volgorde, de eerste die een rij oplevert wint:
 *  1. overgang: update waar de status verschilt van wat Mollie nu zegt;
 *  2. nieuwe rij: insert die een bestaande rij met rust laat
 *     (recurring betalingen maakt Mollie zelf aan, die bestaan hier nog
 *     niet, en komen vaak direct met eindstatus paid of failed binnen);
 *  3. herhaling: alleen lezen, niets schrijven.
 *
 * `transitioned` is waar na stap 1 of 2: ook een nieuwe rij die direct als
 * paid of failed binnenkomt is een overgang. Bij een verloren race (twee
 * webhooks tegelijk voor dezelfde nieuwe betaling) levert stap 2 voor de
 * verliezer niets op (ON CONFLICT DO NOTHING) en valt die terug op stap 3,
 * dus de bijwerkingen horen bij precies één van de twee.
 */

export type PaymentWriteStep<Row> = () => Promise<Row | null>;

export interface PaymentWriteSteps<Row> {
  /** Stap 1: update ... where mollie_payment_id = $1 and status <> $2 returning *. */
  transition: PaymentWriteStep<Row>;
  /** Stap 2: insert ... on conflict (mollie_payment_id) do nothing returning *. */
  insertIfAbsent: PaymentWriteStep<Row>;
  /** Stap 3: select ... where mollie_payment_id = $1. */
  read: PaymentWriteStep<Row>;
}

export interface PaymentWriteResult<Row> {
  row: Row | null;
  transitioned: boolean;
}

export async function writePaymentWithTransition<Row>(
  steps: PaymentWriteSteps<Row>,
): Promise<PaymentWriteResult<Row>> {
  const transitioned = await steps.transition();
  if (transitioned) return { row: transitioned, transitioned: true };
  const inserted = await steps.insertIfAbsent();
  if (inserted) return { row: inserted, transitioned: true };
  const existing = await steps.read();
  return { row: existing, transitioned: false };
}

export const PAYMENT_FAILED_STATUSES = ["failed", "expired", "canceled"] as const;

export function isFailedPaymentStatus(status: string): boolean {
  return (PAYMENT_FAILED_STATUSES as readonly string[]).includes(status);
}

export type MoneyFactEvent = "payment.received" | "payment.failed";

/**
 * Money-fact event dat bij deze webhook hoort: alleen op een echte overgang
 * naar een terminale status. Een nieuwe rij die als open binnenkomt is wel
 * een overgang maar geen money-fact; die volgt bij de webhook die de rij
 * naar paid of failed brengt.
 */
export function moneyFactEventFor(transitioned: boolean, status: string): MoneyFactEvent | null {
  if (!transitioned) return null;
  if (status === "paid") return "payment.received";
  if (isFailedPaymentStatus(status)) return "payment.failed";
  return null;
}

export type RecurringMembershipAction = "reactivate" | "degrade" | "none";

/**
 * Wat de recurring-tak met de membership doet. Alleen op een echte overgang
 * van de betaling: een chargeback-webhook (status nog steeds paid) mag een
 * zojuist op payment_failed gezette membership niet terugzetten, en een
 * herleverde failed-webhook mag een intussen hersteld lid niet opnieuw op
 * payment_failed zetten.
 */
export function recurringMembershipActionFor(args: {
  transitioned: boolean;
  paymentStatus: string;
  membershipStatus: string;
}): RecurringMembershipAction {
  if (!args.transitioned) return "none";
  if (args.paymentStatus === "paid") {
    return args.membershipStatus === "payment_failed" ? "reactivate" : "none";
  }
  if (isFailedPaymentStatus(args.paymentStatus)) {
    return args.membershipStatus === "active" ? "degrade" : "none";
  }
  return "none";
}
