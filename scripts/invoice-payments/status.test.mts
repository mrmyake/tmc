import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVOICE_STATUS_LABEL,
  canPayOnline,
  invoicePaymentStatus,
} from "../../src/lib/invoice-payments/status.ts";

// Betaalstatus (spec-facturatie.md 9.7): afgeleid, identiek voor lid en admin.

const base = {
  isCreditNote: false,
  totalGrossCents: 50459,
  creditedCents: 0,
  paid: false,
  issuedAt: "2026-11-10",
  today: "2026-11-10",
};

test("labels: Open, Vervallen, Betaald, Gecrediteerd", () => {
  assert.deepEqual(INVOICE_STATUS_LABEL, {
    open: "Open",
    vervallen: "Vervallen",
    betaald: "Betaald",
    gecrediteerd: "Gecrediteerd",
  });
});

test("open binnen de termijn, ook op de vervaldatum zelf", () => {
  assert.equal(invoicePaymentStatus(base), "open");
  assert.equal(invoicePaymentStatus({ ...base, today: "2026-11-17" }), "open");
});

test("vervallen de dag na de vervaldatum", () => {
  assert.equal(invoicePaymentStatus({ ...base, today: "2026-11-18" }), "vervallen");
});

test("betaald wint van vervallen", () => {
  assert.equal(
    invoicePaymentStatus({ ...base, today: "2026-12-31", paid: true }),
    "betaald",
  );
});

test("volledig gecrediteerd wint van betaald en open", () => {
  assert.equal(
    invoicePaymentStatus({ ...base, creditedCents: 50459, paid: true }),
    "gecrediteerd",
  );
  assert.equal(invoicePaymentStatus({ ...base, creditedCents: 50459 }), "gecrediteerd");
});

test("deels gecrediteerd blijft open of betaald", () => {
  assert.equal(invoicePaymentStatus({ ...base, creditedCents: 1000 }), "open");
  assert.equal(
    invoicePaymentStatus({ ...base, creditedCents: 1000, paid: true }),
    "betaald",
  );
});

test("een creditnota heeft geen betaalstatus", () => {
  assert.equal(invoicePaymentStatus({ ...base, isCreditNote: true }), null);
});

const payable = {
  status: "finalised",
  isCreditNote: false,
  totalGrossCents: 50459,
  paymentId: null,
  creditedCents: 0,
};

test("canPayOnline: een gefinaliseerde factuur zonder betaling", () => {
  assert.equal(canPayOnline(payable), true);
});

test("canPayOnline: nooit bij creditnota, payment_id, concept, nul of lager", () => {
  assert.equal(canPayOnline({ ...payable, isCreditNote: true }), false);
  assert.equal(canPayOnline({ ...payable, paymentId: "p1" }), false);
  assert.equal(canPayOnline({ ...payable, status: "draft" }), false);
  assert.equal(canPayOnline({ ...payable, totalGrossCents: 0 }), false);
  assert.equal(canPayOnline({ ...payable, totalGrossCents: -100 }), false);
  assert.equal(canPayOnline({ ...payable, totalGrossCents: null }), false);
});

test("canPayOnline: niet bij volledig gecrediteerd, wel bij deels", () => {
  assert.equal(canPayOnline({ ...payable, creditedCents: 50459 }), false);
  assert.equal(canPayOnline({ ...payable, creditedCents: 100 }), true);
});
