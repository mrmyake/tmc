import { isValidPayToken } from "./pay-url";

/**
 * Kernlogica van /factuur/betalen/<token>: start of hervat de Mollie-betaling
 * voor het exacte factuurtotaal. Los van de "use server"-wrapper en zonder
 * server-only imports; DB en Mollie komen binnen via deps, zodat de
 * dubbele-betaling-invariant met fakes aantoonbaar te testen is (naar het
 * model van src/lib/orders/payment-link-core.ts).
 *
 * De invariant, in drie lagen:
 *  1. Reuse: staat er een niet-terminale poging (open, pending, authorized)
 *     voor deze factuur, dan hergebruiken we hem (open geeft zijn checkout-URL,
 *     pending/authorized "processing", paid "processing" tot de webhook de
 *     factuur koppelt). Een nieuwe poging ontstaat alleen als er geen levende
 *     is.
 *  2. Idempotency: de key is deterministisch uit het aantal reeds
 *     geregistreerde pogingen; twee gelijktijdige mints sturen dezelfde key
 *     en krijgen bij Mollie hetzelfde payment-object.
 *  3. Koppeling: invoices.payment_id is write-once en wordt met een
 *     compare-and-swap gezet door de webhook; de partiele unieke index op
 *     payments laat nooit twee betaalde factuurbetalingen toe.
 * Het bedrag is altijd exact total_gross_cents (display-equals-charge).
 */

export interface PayInvoice {
  id: string;
  invoice_number: string;
  status: string;
  is_test: boolean;
  total_gross_cents: number | null;
  payment_id: string | null;
  credit_of_invoice_id: string | null;
  profile_id: string;
  /** Som van gefinaliseerde creditnota's, positief. */
  credited_cents: number;
}

export interface InvoiceAttempt {
  mollie_payment_id: string;
  status: string;
}

export interface MolliePaymentView {
  id: string;
  status: string;
  checkoutUrl: string | null;
}

export interface InvoicePayDeps {
  db: {
    getInvoiceByToken(token: string): Promise<PayInvoice | null>;
    /** Alle betaalpogingen (payments, kind invoice) van deze factuur. */
    listAttempts(invoiceId: string): Promise<InvoiceAttempt[]>;
    insertAttempt(row: {
      mollie_payment_id: string;
      profile_id: string;
      invoice_id: string;
      amount_cents: number;
      status: string;
      description: string;
      is_test: boolean;
    }): Promise<void>;
  };
  mollie: {
    getPayment(paymentId: string): Promise<MolliePaymentView>;
    createPayment(args: {
      amountValue: string;
      description: string;
      redirectUrl: string;
      webhookUrl: string;
      invoiceId: string;
      profileId: string;
      idempotencyKey: string;
    }): Promise<MolliePaymentView>;
  };
  urls: { site: string; webhook: string };
}

export type InvoicePayResult =
  | { ok: true; checkoutUrl: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "already_paid"
        | "credited"
        | "processing"
        /** Online betalen kan in deze omgeving niet (geen Mollie-key voor de modus). */
        | "unavailable"
        | "try_again";
    };

const LIVE = ["open", "pending", "authorized"];

export function mollieAmountValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function startInvoicePaymentCore(
  deps: InvoicePayDeps,
  token: string,
): Promise<InvoicePayResult> {
  if (!isValidPayToken(token)) return { ok: false, reason: "not_found" };

  const invoice = await deps.db.getInvoiceByToken(token);
  const total = invoice?.total_gross_cents ?? 0;
  if (
    !invoice ||
    invoice.status !== "finalised" ||
    invoice.credit_of_invoice_id !== null ||
    total <= 0
  ) {
    return { ok: false, reason: "not_found" };
  }
  if (invoice.payment_id) return { ok: false, reason: "already_paid" };
  if (invoice.credited_cents >= total) return { ok: false, reason: "credited" };

  // Laag 1: een levende poging hergebruiken.
  const attempts = await deps.db.listAttempts(invoice.id);
  for (const a of attempts) {
    if (!LIVE.includes(a.status)) continue;
    let existing: MolliePaymentView;
    try {
      existing = await deps.mollie.getPayment(a.mollie_payment_id);
    } catch (e) {
      // Status onbekend: NIET doorminten (dat kan een tweede open payment
      // opleveren), maar de klant vragen het zo nog eens te proberen.
      console.error("[invoice-pay] bestaande poging ophalen faalde", e);
      return { ok: false, reason: "try_again" };
    }
    if (existing.status === "paid") return { ok: false, reason: "processing" };
    if (existing.status === "open") {
      return existing.checkoutUrl
        ? { ok: true, checkoutUrl: existing.checkoutUrl }
        : { ok: false, reason: "try_again" };
    }
    if (existing.status === "pending" || existing.status === "authorized") {
      return { ok: false, reason: "processing" };
    }
    // failed, expired of canceled bij Mollie: terminaal, verder zoeken.
  }

  // Laag 2: deterministische idempotency-key uit het aantal pogingen.
  const attempt = attempts.length + 1;
  const payment = await deps.mollie.createPayment({
    amountValue: mollieAmountValue(total),
    description: `The Movement Club | Factuur ${invoice.invoice_number}`,
    redirectUrl: `${deps.urls.site.replace(/\/+$/, "")}/factuur/betalen/${token}`,
    webhookUrl: deps.urls.webhook,
    invoiceId: invoice.id,
    profileId: invoice.profile_id,
    idempotencyKey: `invoice-${invoice.id}-${attempt}`,
  });

  await deps.db.insertAttempt({
    mollie_payment_id: payment.id,
    profile_id: invoice.profile_id,
    invoice_id: invoice.id,
    amount_cents: total,
    status: "open",
    description: `Factuur ${invoice.invoice_number} (online)`,
    is_test: invoice.is_test,
  });

  return payment.checkoutUrl
    ? { ok: true, checkoutUrl: payment.checkoutUrl }
    : { ok: false, reason: "try_again" };
}
