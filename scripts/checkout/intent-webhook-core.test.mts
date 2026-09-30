/**
 * Webhookkern van de gastcheckout (src/lib/checkout/intent-webhook-core.ts)
 * met fakes: nieuw account, bestaand account, herkansing na failed,
 * app_metadata-vergelijking bij email_exists, modecheck, telefoon-botsing,
 * testmodus, niet-betaalde statussen en transiënte fouten.
 * Run: npm run test:checkout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleCheckoutIntentPayment,
  type CheckoutIntentRow,
  type ConvertResult,
  type IntentWebhookDeps,
} from "../../src/lib/checkout/intent-webhook-core";
import { buildPaymentUpsertRow } from "../../src/lib/orders/payment-upsert-row";

const INTENT_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_NEW = "22222222-2222-4222-8222-222222222222";
const PROFILE_OTHER = "33333333-3333-4333-8333-333333333333";

function intent(overrides: Partial<CheckoutIntentRow> = {}): CheckoutIntentRow {
  return {
    id: INTENT_ID,
    status: "pending",
    mode: "test",
    kind: "subscription",
    catalogue_slug: "groepslessen_2x",
    first_charge_cents: 7900,
    email: "nieuw@test.invalid",
    first_name: "Nieuw",
    last_name: "Lid",
    acquisition_source: "test",
    acquisition_medium: null,
    acquisition_campaign: null,
    acquisition_content: null,
    signup_path: "/abonnement",
    first_touch_at: null,
    mollie_payment_id: "tr_1",
    paid_at: null,
    profile_id: null,
    order_id: null,
    conversion_error: null,
    ...overrides,
  };
}

interface Harness {
  deps: IntentWebhookDeps;
  calls: {
    convert: Array<{ profileId: string; profileCreated: boolean }>;
    fail: Array<{ code: string }>;
    cancel: string[];
    createUser: number;
    notify: string[];
    emit: string[];
  };
}

function harness(opts: {
  intent: CheckoutIntentRow | null;
  existingUser?: string | null;
  markerFor?: Record<string, string | null>;
  createUser?: Awaited<ReturnType<IntentWebhookDeps["auth"]["createUser"]>>;
  convert?: ConvertResult | (() => ConvertResult);
  convertThrows?: unknown;
  transient?: (e: unknown) => boolean;
}): Harness {
  const calls: Harness["calls"] = { convert: [], fail: [], cancel: [], createUser: 0, notify: [], emit: [] };
  const deps: IntentWebhookDeps = {
    db: {
      getIntent: async () => opts.intent,
      convert: async (a) => {
        calls.convert.push({ profileId: a.profileId, profileCreated: a.profileCreated });
        if (opts.convertThrows) throw opts.convertThrows;
        const r = opts.convert ?? { ok: true, order_id: "order-1", profile_id: a.profileId, login_token: "a".repeat(64), is_test: true };
        return typeof r === "function" ? r() : r;
      },
      fail: async (a) => {
        calls.fail.push({ code: a.code });
      },
      cancel: async (a) => {
        calls.cancel.push(a.paymentId);
      },
    },
    auth: {
      createUser: async () => {
        calls.createUser += 1;
        return opts.createUser ?? { ok: true, userId: PROFILE_NEW };
      },
      userIdForEmail: async () => opts.existingUser ?? null,
      intentMarkerForUser: async (userId) => opts.markerFor?.[userId] ?? null,
    },
    isTransient: opts.transient ?? (() => false),
    notify: async (title) => {
      calls.notify.push(title);
    },
    emit: async (e) => {
      calls.emit.push(e.type);
    },
    now: () => new Date("2026-10-01T10:00:00Z"),
  };
  return { deps, calls };
}

const PAID = { id: "tr_1", status: "paid", paidAt: "2026-10-01T09:59:00Z", amountCents: 7900 };

test("nieuw account: createUser, convert met profile_created true, drie events, geen alert", async () => {
  const h = harness({ intent: intent() });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "converted");
  if (out.kind !== "converted") return;
  assert.equal(h.calls.createUser, 1);
  assert.deepEqual(h.calls.convert, [{ profileId: PROFILE_NEW, profileCreated: true }]);
  assert.equal(out.loginToken?.length, 64);
  assert.equal(out.isTest, true);
  assert.deepEqual(h.calls.emit, ["checkout_intent.converted", "member.created", "order.created"]);
  assert.deepEqual(h.calls.notify, []);
  assert.deepEqual(h.calls.fail, []);
});

test("bestaand account (precheck): geen createUser, convert met profile_created false, existing_account met alert", async () => {
  const h = harness({
    intent: intent(),
    existingUser: PROFILE_OTHER,
    markerFor: { [PROFILE_OTHER]: null },
    convert: { ok: false, reason: "existing_account", intent_id: INTENT_ID },
  });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.deepEqual(out, { kind: "failed", intentId: INTENT_ID, reason: "existing_account" });
  assert.equal(h.calls.createUser, 0);
  assert.deepEqual(h.calls.convert, [{ profileId: PROFILE_OTHER, profileCreated: false }]);
  // De RPC heeft de intent al op failed gezet; hier geen tweede fail.
  assert.deepEqual(h.calls.fail, []);
  assert.deepEqual(h.calls.notify, ["Gastcheckout: betaald maar niet afgerond"]);
  assert.deepEqual(h.calls.emit, []);
});

test("email_exists na race: marker gelijk aan intent telt als eigen profiel", async () => {
  let lookups = 0;
  const h = harness({
    intent: intent(),
    createUser: { ok: false, emailExists: true },
    markerFor: { [PROFILE_NEW]: INTENT_ID },
  });
  h.deps.auth.userIdForEmail = async () => (lookups++ === 0 ? null : PROFILE_NEW);
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "converted");
  assert.deepEqual(h.calls.convert, [{ profileId: PROFILE_NEW, profileCreated: true }]);
});

test("email_exists na race: andere marker is een bestaand account", async () => {
  let lookups = 0;
  const h = harness({
    intent: intent(),
    createUser: { ok: false, emailExists: true },
    markerFor: { [PROFILE_OTHER]: "andere-intent" },
    convert: { ok: false, reason: "existing_account" },
  });
  h.deps.auth.userIdForEmail = async () => (lookups++ === 0 ? null : PROFILE_OTHER);
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "failed");
  assert.deepEqual(h.calls.convert, [{ profileId: PROFILE_OTHER, profileCreated: false }]);
});

test("herkansing na failed: vastgelegd profiel, geen createUser, from_failed", async () => {
  const h = harness({
    intent: intent({ status: "failed", paid_at: "2026-10-01T09:00:00Z", profile_id: PROFILE_NEW, conversion_error: "order_conflict" }),
    convert: { ok: true, order_id: "order-2", profile_id: PROFILE_NEW, login_token: "b".repeat(64), from_failed: true, is_test: true },
  });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "converted");
  if (out.kind !== "converted") return;
  assert.equal(out.fromFailed, true);
  assert.equal(h.calls.createUser, 0);
  assert.deepEqual(h.calls.convert, [{ profileId: PROFILE_NEW, profileCreated: false }]);
  // Het profiel bestond al (eerdere poging): geen tweede member.created.
  assert.deepEqual(h.calls.emit, ["checkout_intent.converted", "order.created"]);
});

test("al geconverteerd: bestaand resultaat zonder token, geen RPC-aanroep", async () => {
  const h = harness({ intent: intent({ status: "converted", profile_id: PROFILE_NEW, order_id: "order-1" }) });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "converted");
  if (out.kind !== "converted") return;
  assert.equal(out.alreadyConverted, true);
  assert.equal(out.loginToken, null);
  assert.deepEqual(h.calls.convert, []);
  assert.deepEqual(h.calls.emit, []);
});

test("modecheck: live-intent met test-webhook wordt genegeerd met alert", async () => {
  const h = harness({ intent: intent({ mode: "live" }) });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.deepEqual(out, { kind: "ignored", reason: "mode_mismatch" });
  assert.deepEqual(h.calls.notify, ["Gastcheckout: modus klopt niet"]);
  assert.equal(h.calls.createUser, 0);
});

test("vervangen betaling meldt zich met canceled: stil genegeerd, geen alert", async () => {
  const h = harness({ intent: intent({ mollie_payment_id: "tr_new" }) });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: { ...PAID, id: "tr_old", status: "canceled", paidAt: null }, mode: "test" });
  assert.deepEqual(out, { kind: "ignored", reason: "payment_mismatch" });
  assert.deepEqual(h.calls.notify, []);
  assert.deepEqual(h.calls.cancel, []);
});

test("betaalde verweesde betaling: genegeerd met alert paid_orphan_payment", async () => {
  const h = harness({ intent: intent({ mollie_payment_id: "tr_new" }) });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: { ...PAID, id: "tr_old" }, mode: "test" });
  assert.deepEqual(out, { kind: "ignored", reason: "payment_mismatch" });
  assert.deepEqual(h.calls.notify, ["Gastcheckout: betaalde verweesde betaling"]);
  assert.equal(h.calls.createUser, 0);
});

test("markerfout transiënt: retry auth_marker_transient, niets vastgelegd", async () => {
  const h = harness({ intent: intent(), existingUser: PROFILE_OTHER, transient: () => true });
  h.deps.auth.intentMarkerForUser = async () => {
    throw new Error("503");
  };
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "retry");
  assert.equal(out.kind === "retry" && out.reason, "auth_marker_transient");
  assert.deepEqual(h.calls.fail, []);
  assert.deepEqual(h.calls.convert, []);
});

test("markerfout blijvend: failed auth_marker_error met alert, nooit existing_account", async () => {
  const h = harness({ intent: intent(), existingUser: PROFILE_OTHER });
  h.deps.auth.intentMarkerForUser = async () => {
    throw new Error("403");
  };
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.deepEqual(out, { kind: "failed", intentId: INTENT_ID, reason: "auth_marker_error" });
  assert.deepEqual(h.calls.fail, [{ code: "auth_marker_error" }]);
  assert.deepEqual(h.calls.notify, ["Gastcheckout: accountcontrole mislukt"]);
  assert.deepEqual(h.calls.convert, []);
});

test("canceled, failed of expired betaling: cancel_checkout_intent, geen account", async () => {
  for (const status of ["canceled", "failed", "expired"]) {
    const h = harness({ intent: intent() });
    const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: { ...PAID, status, paidAt: null }, mode: "test" });
    assert.deepEqual(out, { kind: "cancelled", intentId: INTENT_ID });
    assert.deepEqual(h.calls.cancel, ["tr_1"]);
    assert.equal(h.calls.createUser, 0);
  }
  const h = harness({ intent: intent() });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: { ...PAID, status: "open", paidAt: null }, mode: "test" });
  assert.deepEqual(out, { kind: "ignored", reason: "not_terminal" });
});

test("transiënte createUser-fout: retry, niets vastgelegd", async () => {
  const h = harness({ intent: intent(), createUser: { ok: false, error: new Error("503") }, transient: () => true });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "retry");
  assert.deepEqual(h.calls.fail, []);
  assert.deepEqual(h.calls.convert, []);
});

test("blijvende createUser-fout: intent failed met createuser_failed en alert", async () => {
  const h = harness({ intent: intent(), createUser: { ok: false, error: new Error("422 invalid") } });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.deepEqual(out, { kind: "failed", intentId: INTENT_ID, reason: "createuser_failed" });
  assert.deepEqual(h.calls.fail, [{ code: "createuser_failed" }]);
  assert.deepEqual(h.calls.notify, ["Gastcheckout: account aanmaken mislukt"]);
});

test("convert throwt transiënt: retry zonder fail; blijvend: convert_rpc_error", async () => {
  const t = harness({ intent: intent(), convertThrows: new Error("timeout"), transient: () => true });
  const out1 = await handleCheckoutIntentPayment(t.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out1.kind, "retry");
  assert.deepEqual(t.calls.fail, []);
  const p = harness({ intent: intent(), convertThrows: new Error("42501") });
  const out2 = await handleCheckoutIntentPayment(p.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.deepEqual(out2, { kind: "failed", intentId: INTENT_ID, reason: "convert_rpc_error" });
  assert.deepEqual(p.calls.fail, [{ code: "convert_rpc_error" }]);
});

test("telefoon-botsing: geconverteerd met phone_skipped en een aparte alert", async () => {
  const h = harness({
    intent: intent(),
    convert: { ok: true, order_id: "order-3", profile_id: PROFILE_NEW, login_token: "c".repeat(64), phone_skipped: true, is_test: false },
  });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.equal(out.kind, "converted");
  if (out.kind !== "converted") return;
  assert.equal(out.phoneSkipped, true);
  assert.deepEqual(h.calls.notify, ["Gastcheckout: telefoonnummer overgeslagen"]);
});

test("order_conflict: failed met alert, geen extra fail (RPC legde het al vast)", async () => {
  const h = harness({ intent: intent(), convert: { ok: false, reason: "order_conflict" } });
  const out = await handleCheckoutIntentPayment(h.deps, { intentId: INTENT_ID, payment: PAID, mode: "test" });
  assert.deepEqual(out, { kind: "failed", intentId: INTENT_ID, reason: "order_conflict" });
  assert.deepEqual(h.calls.fail, []);
  assert.equal(h.calls.notify.length, 1);
});

test("payments-upsert: bij type checkout_intent blijven order_id en profile_id weg", () => {
  const payment = { id: "tr_9", status: "paid", amountValue: "79.00", method: "ideal", description: "x", paidAt: null, subscriptionId: null };
  const intentRow = buildPaymentUpsertRow({ payment, mode: "test", intentId: INTENT_ID });
  assert.equal("order_id" in intentRow, false);
  assert.equal("profile_id" in intentRow, false);
  assert.equal(intentRow.amount_cents, 7900);
  assert.equal(intentRow.is_test, true);
  const orderRow = buildPaymentUpsertRow({ payment, mode: "live", orderId: "order-1", profileId: PROFILE_NEW });
  assert.equal(orderRow.order_id, "order-1");
  assert.equal(orderRow.profile_id, PROFILE_NEW);
  const bareRow = buildPaymentUpsertRow({ payment, mode: "live" });
  assert.equal(bareRow.order_id, null);
  assert.equal(bareRow.profile_id, null);
});
