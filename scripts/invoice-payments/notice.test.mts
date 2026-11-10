import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoicePaidNotice,
  uniqueSlugs,
} from "../../src/lib/invoice-payments/notice.ts";

// Melding bij betaling (9.7): factuurnummer, afnemer, bedrag en de
// vermelding dat een product handmatig klaargezet moet worden.

test("melding noemt nummer, afnemer, bedrag en de handmatige productstap", () => {
  const n = buildInvoicePaidNotice({
    invoiceNumber: "2026.004",
    billToName: "Anna de Vries",
    billToCompany: "Acme BV",
    totalGrossCents: 50459,
    via: "online",
    catalogueSlugs: ["duo_10"],
  });
  assert.equal(n.title, "Factuur 2026.004 is betaald");
  assert.match(n.message, /2026\.004/);
  assert.match(n.message, /Acme BV, Anna de Vries/);
  assert.match(n.message, /€504,59/);
  assert.match(n.message, /online/);
  assert.match(n.message, /duo_10/);
  assert.match(n.message, /handmatig klaargezet/);
});

test("zonder catalogue_slug staat de vermelding er toch", () => {
  const n = buildInvoicePaidNotice({
    invoiceNumber: "2026.005",
    billToName: "Jan",
    billToCompany: null,
    totalGrossCents: 100,
    via: "overboeking",
    catalogueSlugs: [],
  });
  assert.match(n.message, /overboeking/);
  assert.match(n.message, /handmatig klaargezet/);
  assert.doesNotMatch(n.message, /\(\)/);
});

test("melding verwijst naar de knop Product klaarzetten, met link als die er is", () => {
  const base = {
    invoiceNumber: "2026.006",
    billToName: "Jan",
    billToCompany: null,
    totalGrossCents: 110000,
    via: "online" as const,
    catalogueSlugs: ["duo_10"],
  };
  const zonder = buildInvoicePaidNotice(base);
  assert.match(zonder.message, /Product klaarzetten/);
  assert.doesNotMatch(zonder.message, /Naar de factuur/);
  const met = buildInvoicePaidNotice({
    ...base,
    invoiceUrl: "https://www.themovementclub.nl/app/admin/facturen/abc#product-klaarzetten",
  });
  assert.equal(
    met.lines.at(-1),
    "Naar de factuur: https://www.themovementclub.nl/app/admin/facturen/abc#product-klaarzetten",
  );
  const leeg = buildInvoicePaidNotice({ ...base, catalogueSlugs: [] });
  assert.match(leeg.message, /Product klaarzetten/);
});

test("uniqueSlugs: dubbele en lege slugs vallen weg", () => {
  assert.deepEqual(uniqueSlugs(["duo_10", null, "duo_10", "signup_fee", undefined]), [
    "duo_10",
    "signup_fee",
  ]);
});
