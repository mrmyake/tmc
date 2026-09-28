import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { siteUrl } from "@/lib/site-url";
import {
  ACTIVE_REFUND_STATUSES,
  centsFromMollieValue,
  decideRefundAction,
  describeRefundError,
  eurosFromCents,
  idempotencyKeyFor,
  mapMollieRefundStatus,
  type MollieRefundLike,
  type PaymentRefundRow,
  type PaymentRefundStatus,
} from "./core";

/**
 * Het enige pad naar Mollie voor terugbetalingen van proeflessen. Losse
 * admin-annulering, sessie-annulering, de retry-knop en de webhook-
 * bijvangst komen hier allemaal langs (spec-community-growth.md §1
 * "Annulering door de studio").
 *
 * Volgorde per intentie:
 * 1. Rij en betaalregel lezen; alleen 'requested' en 'failed' worden
 *    ingediend.
 * 2. Bestaande refunds van de betaling bij Mollie ophalen en reconcilieren
 *    (decideRefundAction): een eerdere poging die na een time-out toch is
 *    doorgekomen wordt overgenomen, niet herhaald.
 * 3. Aanmaken met een idempotency key per intentie.
 * 4. Rij bijwerken naar de Mollie-status, of naar 'failed' met last_error
 *    plus een ntfy zonder persoonsgegevens.
 * Nooit throwen: de aanroeper (annulering) mag hier niet op stuklopen.
 */

export type ProcessRefundResult =
  | { ok: true; status: PaymentRefundStatus; mollieRefundId: string | null; amountCents: number }
  | { ok: false; status: "failed" | "skipped"; message: string };

type RefundRowDb = {
  id: string;
  payment_id: string;
  trial_booking_id: string | null;
  amount_cents: number;
  status: PaymentRefundStatus;
  mollie_refund_id: string | null;
};

type PaymentRowDb = {
  id: string;
  mollie_payment_id: string;
  amount_cents: number;
  refunded_amount_cents: number;
  is_test: boolean;
};

function toRefundLike(r: {
  id: string;
  status: string;
  amount: { value: string };
  metadata?: unknown;
}): MollieRefundLike {
  const meta = (r.metadata ?? null) as { payment_refund_id?: unknown } | null;
  return {
    id: r.id,
    status: r.status,
    amountCents: centsFromMollieValue(r.amount.value),
    paymentRefundId:
      meta && typeof meta.payment_refund_id === "string" ? meta.payment_refund_id : null,
  };
}

async function fetchMollieRefunds(
  mollie: NonNullable<ReturnType<typeof getMollieClient>>,
  molliePaymentId: string,
): Promise<MollieRefundLike[]> {
  const out: MollieRefundLike[] = [];
  for await (const r of mollie.paymentRefunds.iterate({ paymentId: molliePaymentId })) {
    out.push(toRefundLike(r));
  }
  return out;
}

async function markFailed(refundId: string, message: string, ctx: { amountCents: number; trialBookingId: string | null; sessionId: string | null }) {
  const admin = createAdminClient();
  await admin
    .from("payment_refunds")
    .update({ status: "failed", last_error: message, updated_at: new Date().toISOString() })
    .eq("id", refundId);
  await emitEvent({
    type: "trial_booking.refund_failed",
    actorType: "system",
    actorId: null,
    subjectType: "payment_refund",
    subjectId: refundId,
    payload: { trial_booking_id: ctx.trialBookingId, amount_cents: ctx.amountCents, error: message },
  });
  // Zonder persoonsgegevens: bedrag en een link naar de admin-pagina.
  const link = ctx.sessionId
    ? `${siteUrl()}/app/admin/sessies/${ctx.sessionId}`
    : `${siteUrl()}/app/admin/rooster`;
  await sendNotification(
    "Terugbetaling proefles mislukt",
    `Refund van EUR ${eurosFromCents(ctx.amountCents)} is niet bij Mollie aangekomen. Opnieuw proberen via ${link}`,
    "warning,money_with_wings",
  );
}

export async function processPaymentRefund(refundId: string): Promise<ProcessRefundResult> {
  const admin = createAdminClient();
  let ctx = { amountCents: 0, trialBookingId: null as string | null, sessionId: null as string | null };

  try {
    const { data: row, error } = await admin
      .from("payment_refunds")
      .select("id, payment_id, trial_booking_id, amount_cents, status, mollie_refund_id")
      .eq("id", refundId)
      .maybeSingle<RefundRowDb>();
    if (error || !row) {
      return { ok: false, status: "skipped", message: "Refund-intentie niet gevonden." };
    }
    ctx = { amountCents: row.amount_cents, trialBookingId: row.trial_booking_id, sessionId: null };
    if (row.status !== "requested" && row.status !== "failed") {
      return { ok: true, status: row.status, mollieRefundId: row.mollie_refund_id, amountCents: row.amount_cents };
    }
    if (row.trial_booking_id) {
      const { data: tb } = await admin
        .from("trial_bookings")
        .select("session_id")
        .eq("id", row.trial_booking_id)
        .maybeSingle();
      ctx.sessionId = tb?.session_id ?? null;
    }

    const { data: payment } = await admin
      .from("payments")
      .select("id, mollie_payment_id, amount_cents, refunded_amount_cents, is_test")
      .eq("id", row.payment_id)
      .maybeSingle<PaymentRowDb>();
    if (!payment) {
      const message = "Betaalregel niet gevonden.";
      await markFailed(refundId, message, ctx);
      return { ok: false, status: "failed", message };
    }

    const mollie = getMollieClient(payment.is_test ? "test" : "live");
    if (!mollie) {
      const message = `Mollie niet geconfigureerd (mode=${payment.is_test ? "test" : "live"}).`;
      await markFailed(refundId, message, ctx);
      return { ok: false, status: "failed", message };
    }

    const intent: PaymentRefundRow = {
      id: row.id,
      paymentId: row.payment_id,
      amountCents: row.amount_cents,
      status: row.status,
      mollieRefundId: row.mollie_refund_id,
    };
    const existing = await fetchMollieRefunds(mollie, payment.mollie_payment_id);
    const decision = decideRefundAction(
      intent,
      { amountCents: payment.amount_cents, refundedAmountCents: payment.refunded_amount_cents },
      existing,
    );

    if (decision.kind === "nothing_left") {
      await admin
        .from("payment_refunds")
        .update({ status: "canceled", last_error: "Niets meer terug te betalen bij Mollie.", updated_at: new Date().toISOString() })
        .eq("id", refundId);
      return { ok: true, status: "canceled", mollieRefundId: null, amountCents: 0 };
    }

    if (decision.kind === "adopt") {
      await admin
        .from("payment_refunds")
        .update({
          status: decision.status,
          mollie_refund_id: decision.mollieRefund.id,
          amount_cents: decision.mollieRefund.amountCents,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundId);
      return { ok: true, status: decision.status, mollieRefundId: decision.mollieRefund.id, amountCents: decision.mollieRefund.amountCents };
    }

    const created = await mollie.paymentRefunds.create({
      paymentId: payment.mollie_payment_id,
      amount: { currency: "EUR", value: eurosFromCents(decision.amountCents) },
      // COPY: confirm met Marlon
      description: "The Movement Club | Proefles geannuleerd",
      metadata: { payment_refund_id: refundId, trial_booking_id: row.trial_booking_id },
      idempotencyKey: idempotencyKeyFor(refundId),
    });
    const status = mapMollieRefundStatus(created.status);
    await admin
      .from("payment_refunds")
      .update({
        status,
        mollie_refund_id: created.id,
        amount_cents: decision.amountCents,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId);
    await emitEvent({
      type: "payment.refund_created",
      actorType: "system",
      actorId: null,
      subjectType: "payment_refund",
      subjectId: refundId,
      payload: {
        payment_id: payment.id,
        mollie_refund_id: created.id,
        amount_cents: decision.amountCents,
        mollie_status: created.status,
        is_test: payment.is_test,
      },
    });
    return { ok: true, status, mollieRefundId: created.id, amountCents: decision.amountCents };
  } catch (err) {
    const message = describeRefundError(err);
    console.error("[refunds] processPaymentRefund failed", refundId, err);
    try {
      await markFailed(refundId, message, ctx);
    } catch (inner) {
      console.error("[refunds] markFailed failed", refundId, inner);
    }
    return { ok: false, status: "failed", message };
  }
}

/**
 * Spiegel na een webhook: refunded_amount_cents en refunded_at uit
 * payment.amountRefunded, en de status van onze intenties uit Mollie's
 * refundlijst. Alleen als er intenties voor deze betaling bestaan wordt
 * de lijst opgehaald (anders geen extra Mollie-call per webhook).
 */
export async function syncPaymentRefundsFromMollie(args: {
  paymentRowId: string;
  molliePaymentId: string;
  amountRefundedValue: string | null | undefined;
  isTest: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  try {
    if (args.amountRefundedValue) {
      const cents = centsFromMollieValue(args.amountRefundedValue);
      const { data: current } = await admin
        .from("payments")
        .select("refunded_amount_cents, amount_cents")
        .eq("id", args.paymentRowId)
        .maybeSingle();
      if (current && cents !== current.refunded_amount_cents && cents <= current.amount_cents) {
        await admin
          .from("payments")
          .update({ refunded_amount_cents: cents, refunded_at: new Date().toISOString() })
          .eq("id", args.paymentRowId);
        await emitEvent({
          type: "payment.refunded",
          actorType: "system",
          actorId: null,
          subjectType: "payment",
          subjectId: args.paymentRowId,
          payload: { refunded_amount_cents: cents, previous_cents: current.refunded_amount_cents, is_test: args.isTest },
        });
      }
    }

    const { data: intents } = await admin
      .from("payment_refunds")
      .select("id, status, mollie_refund_id")
      .eq("payment_id", args.paymentRowId);
    const open = (intents ?? []).filter((i) => i.status !== "requested" && i.status !== "failed");
    if (open.length === 0) return;

    const mollie = getMollieClient(args.isTest ? "test" : "live");
    if (!mollie) return;
    const remote = await fetchMollieRefunds(mollie, args.molliePaymentId);
    for (const intent of open) {
      const match = remote.find((r) => r.id === intent.mollie_refund_id || r.paymentRefundId === intent.id);
      if (!match) continue;
      const status = mapMollieRefundStatus(match.status);
      if (status !== intent.status) {
        await admin
          .from("payment_refunds")
          .update({ status, mollie_refund_id: match.id, updated_at: new Date().toISOString() })
          .eq("id", intent.id);
      }
    }
  } catch (err) {
    console.error("[refunds] syncPaymentRefundsFromMollie failed", args.paymentRowId, err);
  }
}

/** Voor de admin-UI: mag deze intentie opnieuw ingediend worden? */
export function isRetryableRefund(status: PaymentRefundStatus, requestedAtIso: string, nowMs = Date.now()): boolean {
  if (status === "failed") return true;
  if (status === "requested") {
    return nowMs - new Date(requestedAtIso).getTime() > 2 * 60 * 1000;
  }
  return false;
}

export { ACTIVE_REFUND_STATUSES };
