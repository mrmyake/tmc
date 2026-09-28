import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRemainingRefundCents,
  decideRefundAction,
  describeRefundError,
  idempotencyKeyFor,
  mapMollieRefundStatus,
  type MollieRefundLike,
  type PaymentRefundRow,
} from "../../src/lib/refunds/core.ts";

// Annulering door de studio (spec-community-growth.md §1): de pure kern van
// de terugbetaling, zonder Mollie of database.

const intent: PaymentRefundRow = {
  id: "11111111-1111-4111-8111-111111111111",
  paymentId: "pay-1",
  amountCents: 1700,
  status: "requested",
  mollieRefundId: null,
};

function refund(partial: Partial<MollieRefundLike>): MollieRefundLike {
  return { id: "re_x", status: "refunded", amountCents: 0, paymentRefundId: null, ...partial };
}

test("restbedrag: niets terug, niets onderweg", () => {
  assert.equal(computeRemainingRefundCents({ amountCents: 1700, refundedAmountCents: 0 }, []), 1700);
});

test("restbedrag: Mollie meldt al volledig terug via amountRefunded", () => {
  assert.equal(computeRemainingRefundCents({ amountCents: 1700, refundedAmountCents: 1700 }, []), 0);
});

test("restbedrag: geslaagde refund bij Mollie telt ook zonder bijgewerkte payments-rij", () => {
  const remaining = computeRemainingRefundCents(
    { amountCents: 1700, refundedAmountCents: 0 },
    [refund({ id: "re_a", status: "refunded", amountCents: 1700 })],
  );
  assert.equal(remaining, 0);
});

test("restbedrag: geslaagd en amountRefunded worden niet dubbel afgetrokken", () => {
  const remaining = computeRemainingRefundCents(
    { amountCents: 1700, refundedAmountCents: 500 },
    [refund({ id: "re_a", status: "refunded", amountCents: 500 })],
  );
  assert.equal(remaining, 1200);
});

test("restbedrag: onderweg zijnde refund telt mee, mislukte en geannuleerde niet", () => {
  const remaining = computeRemainingRefundCents(
    { amountCents: 1700, refundedAmountCents: 0 },
    [
      refund({ id: "re_p", status: "pending", amountCents: 1000 }),
      refund({ id: "re_f", status: "failed", amountCents: 1700 }),
      refund({ id: "re_c", status: "canceled", amountCents: 1700 }),
    ],
  );
  assert.equal(remaining, 700);
});

test("restbedrag gaat nooit onder nul", () => {
  assert.equal(computeRemainingRefundCents({ amountCents: 1700, refundedAmountCents: 1700 }, [refund({ status: "pending", amountCents: 1700 })]), 0);
});

test("reconciliatie: eerdere poging met ons id in de metadata wordt overgenomen", () => {
  const d = decideRefundAction(intent, { amountCents: 1700, refundedAmountCents: 0 }, [
    refund({ id: "re_ours", status: "pending", amountCents: 1700, paymentRefundId: intent.id }),
  ]);
  assert.equal(d.kind, "adopt");
  if (d.kind === "adopt") {
    assert.equal(d.mollieRefund.id, "re_ours");
    assert.equal(d.status, "pending");
  }
});

test("reconciliatie: bekend mollie_refund_id op de rij wordt ook overgenomen", () => {
  const d = decideRefundAction(
    { ...intent, status: "failed", mollieRefundId: "re_known" },
    { amountCents: 1700, refundedAmountCents: 0 },
    [refund({ id: "re_known", status: "refunded", amountCents: 1700 })],
  );
  assert.equal(d.kind, "adopt");
  if (d.kind === "adopt") assert.equal(d.status, "refunded");
});

test("reconciliatie: al volledig terug via een refund die niet van ons is: niets aanmaken", () => {
  const d = decideRefundAction(intent, { amountCents: 1700, refundedAmountCents: 0 }, [
    refund({ id: "re_dash", status: "refunded", amountCents: 1700 }),
  ]);
  assert.equal(d.kind, "nothing_left");
});

test("reconciliatie: aanmaken voor het restbedrag, begrensd op de intentie", () => {
  const d1 = decideRefundAction(intent, { amountCents: 1700, refundedAmountCents: 0 }, []);
  assert.deepEqual(d1, { kind: "create", amountCents: 1700 });
  const d2 = decideRefundAction({ ...intent, amountCents: 500 }, { amountCents: 1700, refundedAmountCents: 0 }, []);
  assert.deepEqual(d2, { kind: "create", amountCents: 500 });
  const d3 = decideRefundAction(intent, { amountCents: 1700, refundedAmountCents: 1000 }, []);
  assert.deepEqual(d3, { kind: "create", amountCents: 700 });
});

test("idempotency key is stabiel per intentie", () => {
  assert.equal(idempotencyKeyFor(intent.id), idempotencyKeyFor(intent.id));
  assert.notEqual(idempotencyKeyFor(intent.id), idempotencyKeyFor("22222222-2222-4222-8222-222222222222"));
  assert.match(idempotencyKeyFor(intent.id), /^tmc-refund-/);
});

test("Mollie-status: bekende waarden een op een, onbekend wordt pending", () => {
  for (const s of ["queued", "pending", "processing", "refunded", "failed", "canceled"]) {
    assert.equal(mapMollieRefundStatus(s), s);
  }
  assert.equal(mapMollieRefundStatus("something_new"), "pending");
});

test("faalpad: fouten worden een korte last_error zonder stacktrace", () => {
  const err = Object.assign(new Error("Insufficient balance"), { name: "ApiError", statusCode: 422 });
  assert.equal(describeRefundError(err), "ApiError: Insufficient balance (HTTP 422)");
  assert.equal(describeRefundError("boom"), "boom");
  assert.ok(describeRefundError(new Error("x".repeat(900))).length <= 500);
});
