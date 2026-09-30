/**
 * "Opnieuw proberen" op de publieke bedankpagina
 * (src/lib/checkout/intent-retry-core.ts): hergebruik van een open betaling,
 * deterministische idempotency key, compare-and-swap via de RPC, en de
 * weigeringen. Run: npm run test:checkout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  retryIntentPaymentCore,
  type IntentRetryDeps,
  type RetryIntentView,
} from "../../src/lib/checkout/intent-retry-core";

const TOKEN = "a".repeat(64);
const INTENT_ID = "11111111-1111-4111-8111-111111111111";

function view(overrides: Partial<RetryIntentView> = {}): RetryIntentView {
  return {
    intent_id: INTENT_ID,
    status: "cancelled",
    mode: "test",
    kind: "subscription",
    catalogue_slug: "groepslessen_2x",
    first_charge_cents: 7900,
    mollie_customer_id: "cst_1",
    mollie_payment_id: "tr_old",
    return_target: "web",
    expired: false,
    ...overrides,
  };
}

function harness(opts: {
  view: RetryIntentView | null;
  existing?: { status: string; checkoutUrl: string | null } | Error;
  replace?: { ok: boolean; reason?: string };
}) {
  const calls = { getPayment: [] as string[], create: [] as Parameters<IntentRetryDeps["mollie"]["createPayment"]>[0][], replace: [] as Parameters<IntentRetryDeps["db"]["replacePayment"]>[0][] };
  const deps: IntentRetryDeps = {
    db: {
      forRetry: async () => opts.view,
      replacePayment: async (a) => {
        calls.replace.push(a);
        return opts.replace ?? { ok: true };
      },
    },
    mollie: {
      getPayment: async (id) => {
        calls.getPayment.push(id);
        if (opts.existing instanceof Error) throw opts.existing;
        return opts.existing ?? { status: "canceled", checkoutUrl: null };
      },
      createPayment: async (a) => {
        calls.create.push(a);
        return { id: "tr_new", checkoutUrl: "https://mollie.test/checkout/tr_new" };
      },
    },
    urls: { site: "https://preview.test", webhook: "https://preview.test/api/mollie/webhook?mode=test" },
  };
  return { deps, calls };
}

test("ongeldig of onbekend token: not_found", async () => {
  const h = harness({ view: null });
  assert.deepEqual(await retryIntentPaymentCore(h.deps, "kort"), { ok: false, reason: "not_found" });
  assert.deepEqual(await retryIntentPaymentCore(h.deps, TOKEN), { ok: false, reason: "not_found" });
});

test("cancelled intent met dode betaling: nieuwe betaling met deterministische key en swap", async () => {
  const h = harness({ view: view(), existing: { status: "canceled", checkoutUrl: null } });
  const out = await retryIntentPaymentCore(h.deps, TOKEN);
  assert.deepEqual(out, { ok: true, checkoutUrl: "https://mollie.test/checkout/tr_new" });
  assert.deepEqual(h.calls.getPayment, ["tr_old"]);
  const c = h.calls.create[0];
  assert.equal(c.idempotencyKey, `checkout-${INTENT_ID}-after-tr_old`);
  assert.equal(c.customerId, "cst_1");
  assert.equal(c.isSubscription, true);
  assert.equal(c.redirectUrl, `https://preview.test/abonnement/bedankt?t=${TOKEN}`);
  assert.deepEqual(h.calls.replace, [{ intentId: INTENT_ID, oldPaymentId: "tr_old", newPaymentId: "tr_new" }]);
});

test("open betaling: dezelfde checkout-URL terug, niets geminted", async () => {
  const h = harness({ view: view({ status: "pending" }), existing: { status: "open", checkoutUrl: "https://mollie.test/checkout/tr_old" } });
  assert.deepEqual(await retryIntentPaymentCore(h.deps, TOKEN), { ok: true, checkoutUrl: "https://mollie.test/checkout/tr_old" });
  assert.deepEqual(h.calls.create, []);
});

test("betaalde of verwerkende betaling: already_paid of processing", async () => {
  const paid = harness({ view: view({ status: "pending" }), existing: { status: "paid", checkoutUrl: null } });
  assert.deepEqual(await retryIntentPaymentCore(paid.deps, TOKEN), { ok: false, reason: "already_paid" });
  const busy = harness({ view: view({ status: "pending" }), existing: { status: "pending", checkoutUrl: null } });
  assert.deepEqual(await retryIntentPaymentCore(busy.deps, TOKEN), { ok: false, reason: "processing" });
});

test("Mollie onbereikbaar bij het ophalen: try_again, niets geminted", async () => {
  const h = harness({ view: view(), existing: new Error("timeout") });
  assert.deepEqual(await retryIntentPaymentCore(h.deps, TOKEN), { ok: false, reason: "try_again" });
  assert.deepEqual(h.calls.create, []);
});

test("statussen: converted en failed zijn already_paid, expired en verlopen zijn expired", async () => {
  assert.deepEqual(await retryIntentPaymentCore(harness({ view: view({ status: "converted" }) }).deps, TOKEN), { ok: false, reason: "already_paid" });
  assert.deepEqual(await retryIntentPaymentCore(harness({ view: view({ status: "failed" }) }).deps, TOKEN), { ok: false, reason: "already_paid" });
  assert.deepEqual(await retryIntentPaymentCore(harness({ view: view({ status: "expired" }) }).deps, TOKEN), { ok: false, reason: "expired" });
  assert.deepEqual(await retryIntentPaymentCore(harness({ view: view({ expired: true }) }).deps, TOKEN), { ok: false, reason: "expired" });
});

test("verliezende gelijktijdige retry: payment_mismatch uit de RPC wordt try_again", async () => {
  const h = harness({ view: view(), replace: { ok: false, reason: "payment_mismatch" } });
  assert.deepEqual(await retryIntentPaymentCore(h.deps, TOKEN), { ok: false, reason: "try_again" });
  const gone = harness({ view: view(), replace: { ok: false, reason: "invalid_status" } });
  assert.deepEqual(await retryIntentPaymentCore(gone.deps, TOKEN), { ok: false, reason: "already_paid" });
});

test("app als terugkeerdoel: custom scheme in de redirect", async () => {
  const h = harness({ view: view({ return_target: "app", mollie_payment_id: null }) });
  await retryIntentPaymentCore(h.deps, TOKEN);
  assert.equal(h.calls.create[0].redirectUrl.startsWith("nl.themovementclub.app://abonnement/bedankt?t="), true);
  assert.equal(h.calls.create[0].idempotencyKey, `checkout-${INTENT_ID}-after-none`);
});
