import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_TERM_DAYS,
  MAX_INVOICE_ATTACHMENT_BYTES,
  addDaysIso,
  formatIban,
  formatNlDate,
  invoiceAttachmentName,
  invoiceDueDate,
  normaliseIban,
  resolvePaymentDetails,
} from "../../src/lib/invoice-terms.ts";

// feat/factuur-pdf-bijlage: vervaldatum, bijlagenaam en IBAN zijn pure
// functies; PDF en mail delen ze.

const SITE_FALLBACK = { iban: "NL36RABO0175643806", accountHolder: "The Movement Club" };

test("betaaltermijn is zeven dagen", () => {
  assert.equal(PAYMENT_TERM_DAYS, 7);
});

test("invoiceDueDate: factuurdatum plus zeven dagen", () => {
  assert.equal(invoiceDueDate("2026-11-10"), "2026-11-17");
});

test("invoiceDueDate: maand- en jaarovergang", () => {
  assert.equal(invoiceDueDate("2026-11-28"), "2026-12-05");
  assert.equal(invoiceDueDate("2026-12-28"), "2027-01-04");
});

test("invoiceDueDate: schrikkeljaar", () => {
  assert.equal(invoiceDueDate("2028-02-25"), "2028-03-03");
  assert.equal(invoiceDueDate("2027-02-25"), "2027-03-04");
});

test("invoiceDueDate: zomer- en wintertijd veranderen niets (UTC-optelling)", () => {
  assert.equal(invoiceDueDate("2026-03-25"), "2026-04-01");
  assert.equal(invoiceDueDate("2026-10-25"), "2026-11-01");
});

test("invoiceDueDate: ook met een tijdstempel achter de datum", () => {
  assert.equal(invoiceDueDate("2026-11-10T00:00:00+00:00"), "2026-11-17");
});

test("addDaysIso: ongeldige invoer gooit", () => {
  assert.throws(() => addDaysIso("morgen", 7));
});

test("formatNlDate: dd-mm-jjjj zonder Date", () => {
  assert.equal(formatNlDate("2026-11-17"), "17-11-2026");
  assert.equal(formatNlDate("2026-01-05"), "05-01-2026");
});

test("invoiceAttachmentName: factuur en creditnota", () => {
  assert.equal(invoiceAttachmentName("2026.003", false), "Factuur 2026.003.pdf");
  assert.equal(invoiceAttachmentName("TEST-2026.009", true), "Creditnota TEST-2026.009.pdf");
});

test("IBAN: opslaan zonder spaties, tonen gegroepeerd", () => {
  assert.equal(normaliseIban("nl36 rabo 0175 6438 06"), "NL36RABO0175643806");
  assert.equal(formatIban("NL36RABO0175643806"), "NL36 RABO 0175 6438 06");
  assert.equal(formatIban("NL36 RABO 0175 6438 06"), "NL36 RABO 0175 6438 06");
});

test("resolvePaymentDetails: Sanity wint per veld, anders de constants", () => {
  assert.equal(resolvePaymentDetails(undefined, SITE_FALLBACK).iban, "NL36 RABO 0175 6438 06");
  assert.equal(resolvePaymentDetails("  ", SITE_FALLBACK).iban, "NL36 RABO 0175 6438 06");
  assert.equal(
    resolvePaymentDetails("NL91ABNA0417164300", SITE_FALLBACK).iban,
    "NL91 ABNA 0417 1643 00",
  );
  assert.equal(resolvePaymentDetails(null, SITE_FALLBACK).accountHolder, "The Movement Club");
});

test("bijlagelimiet is 5 MB", () => {
  assert.equal(MAX_INVOICE_ATTACHMENT_BYTES, 5 * 1024 * 1024);
});
