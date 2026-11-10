import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mollieAmountValue,
  startInvoicePaymentCore,
  type InvoiceAttempt,
  type InvoicePayDeps,
  type MolliePaymentView,
  type PayInvoice,
} from "../../src/lib/invoice-payments/pay-core.ts";

// De dubbele-betaling-invariant van de factuurbetaling met fakes: reuse,
// idempotency-key, exact bedrag en alle weigeringen.

const TOKEN = "3d817839-2d0f-4221-a5e9-3cc76ebe9f5d";

function invoice(over: Partial<PayInvoice> = {}): PayInvoice {
  return {
    id: "inv-1",
    invoice_number: "TEST-2026.010",
    status: "finalised",
    is_test: true,
    total_gross_cents: 50459,
    payment_id: null,
    credit_of_invoice_id: null,
    profile_id: "prof-1",
    credited_cents: 0,
    ...over,
  };
}

function setup(opts: {
  invoice?: PayInvoice | null;
  attempts?: InvoiceAttempt[];
  mollie?: Record<string, MolliePaymentView | Error>;
}) {
  const created: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const deps: InvoicePayDeps = {
    db: {
      getInvoiceByToken: async () => (opts.invoice === undefined ? invoice() : opts.invoice),
      listAttempts: async () => opts.attempts ?? [],
      insertAttempt: async (row) => {
        inserted.push(row);
      },
    },
    mollie: {
      getPayment: async (id) => {
        const r = opts.mollie?.[id];
        if (r instanceof Error) throw r;
        if (!r) throw new Error("onbekend");
        return r;
      },
      createPayment: async (args) => {
        created.push(args);
        return { id: "tr_new", status: "open", checkoutUrl: "https://pay.example/new" };
      },
    },
    urls: { site: "https://www.themovementclub.nl/", webhook: "https://x/api/invoices/webhook" },
  };
  return { deps, created, inserted };
}

test("mollieAmountValue: exact in centen", () => {
  assert.equal(mollieAmountValue(50459), "504.59");
  assert.equal(mollieAmountValue(100), "1.00");
  assert.equal(mollieAmountValue(5), "0.05");
});

test("nieuwe poging: exact factuurtotaal, metadata en idempotency-key", async () => {
  const { deps, created, inserted } = setup({});
  const r = await startInvoicePaymentCore(deps, TOKEN);
  assert.deepEqual(r, { ok: true, checkoutUrl: "https://pay.example/new" });
  assert.equal(created.length, 1);
  assert.equal(created[0].amountValue, "504.59");
  assert.equal(created[0].idempotencyKey, "invoice-inv-1-1");
  assert.equal(created[0].invoiceId, "inv-1");
  assert.equal(
    created[0].redirectUrl,
    `https://www.themovementclub.nl/factuur/betalen/${TOKEN}`,
  );
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].amount_cents, 50459);
  assert.equal(inserted[0].status, "open");
  assert.equal(inserted[0].is_test, true);
});

test("reuse: een open poging geeft zijn checkout-URL en mint niets", async () => {
  const { deps, created } = setup({
    attempts: [{ mollie_payment_id: "tr_open", status: "open" }],
    mollie: { tr_open: { id: "tr_open", status: "open", checkoutUrl: "https://pay.example/open" } },
  });
  const r = await startInvoicePaymentCore(deps, TOKEN);
  assert.deepEqual(r, { ok: true, checkoutUrl: "https://pay.example/open" });
  assert.equal(created.length, 0);
});

test("terminale poging: nieuwe poging met volgnummer in de key", async () => {
  const { deps, created } = setup({
    attempts: [{ mollie_payment_id: "tr_old", status: "open" }],
    mollie: { tr_old: { id: "tr_old", status: "expired", checkoutUrl: null } },
  });
  await startInvoicePaymentCore(deps, TOKEN);
  assert.equal(created.length, 1);
  assert.equal(created[0].idempotencyKey, "invoice-inv-1-2");
});

test("lokaal al failed: telt mee voor de key, geen Mollie-call", async () => {
  const { deps, created } = setup({
    attempts: [
      { mollie_payment_id: "tr_a", status: "failed" },
      { mollie_payment_id: "tr_b", status: "canceled" },
    ],
  });
  await startInvoicePaymentCore(deps, TOKEN);
  assert.equal(created[0].idempotencyKey, "invoice-inv-1-3");
});

test("pending, authorized en paid bij Mollie geven processing en minten niets", async () => {
  for (const status of ["pending", "authorized", "paid"]) {
    const { deps, created } = setup({
      attempts: [{ mollie_payment_id: "tr_x", status: "open" }],
      mollie: { tr_x: { id: "tr_x", status, checkoutUrl: null } },
    });
    const r = await startInvoicePaymentCore(deps, TOKEN);
    assert.deepEqual(r, { ok: false, reason: "processing" }, status);
    assert.equal(created.length, 0, status);
  }
});

test("Mollie-lookup faalt: try_again, niet doorminten", async () => {
  const { deps, created } = setup({
    attempts: [{ mollie_payment_id: "tr_x", status: "open" }],
    mollie: { tr_x: new Error("timeout") },
  });
  const r = await startInvoicePaymentCore(deps, TOKEN);
  assert.deepEqual(r, { ok: false, reason: "try_again" });
  assert.equal(created.length, 0);
});

test("weigeringen: onbekend token, concept, creditnota, nul, betaald, gecrediteerd", async () => {
  const cases: Array<[string, PayInvoice | null, string]> = [
    ["geen factuur", null, "not_found"],
    ["concept", invoice({ status: "draft" }), "not_found"],
    ["creditnota", invoice({ credit_of_invoice_id: "x" }), "not_found"],
    ["nul", invoice({ total_gross_cents: 0 }), "not_found"],
    ["negatief", invoice({ total_gross_cents: -5 }), "not_found"],
    ["betaald", invoice({ payment_id: "p1" }), "already_paid"],
    ["gecrediteerd", invoice({ credited_cents: 50459 }), "credited"],
  ];
  for (const [label, inv, reason] of cases) {
    const { deps, created } = setup({ invoice: inv });
    const r = await startInvoicePaymentCore(deps, TOKEN);
    assert.deepEqual(r, { ok: false, reason }, label);
    assert.equal(created.length, 0, label);
  }
});

test("ongeldig token geeft not_found zonder database", async () => {
  const { deps } = setup({});
  const r = await startInvoicePaymentCore(deps, "geen-uuid");
  assert.deepEqual(r, { ok: false, reason: "not_found" });
});
