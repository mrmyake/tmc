/**
 * PDF en mail in beide gevallen: met betaallink (online betalen beschikbaar)
 * en zonder (alleen "Zelf overmaken"). Draait met tsx omdat het JSX en
 * react-pdf rendert.
 * Run: node --import tsx --test scripts/invoice-payments/render.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { render } from "@react-email/render";

// Een react-pdf-instantie voor component en renderer (de CJS-build), anders
// kent de renderer de geregistreerde fonts niet.
const renderToBuffer = createRequire(import.meta.url)("@react-pdf/renderer")
  .renderToBuffer as (el: unknown) => Promise<Buffer>;

function defaultExport<T>(mod: unknown, name?: string): T {
  const m = mod as Record<string, unknown> & { default?: unknown };
  if (name && typeof m[name] === "function") return m[name] as T;
  const d = m.default as Record<string, unknown> | undefined;
  if (typeof d === "function") return d as unknown as T;
  if (name && d && typeof d[name] === "function") return d[name] as T;
  return (d?.default ?? d) as T;
}

const pdfMod = await import("../../src/pdfs/CustomerInvoicePdf.tsx");
const CustomerInvoicePdf = defaultExport<
  (d: Record<string, unknown>) => unknown
>(pdfMod, "CustomerInvoicePdf");
const mailMod = await import("../../src/emails/invoice_ready.tsx");
const InvoiceReady = defaultExport<(p: Record<string, unknown>) => unknown>(mailMod);

const PAY_URL =
  "https://www.themovementclub.nl/factuur/betalen/3d817839-2d0f-4221-a5e9-3cc76ebe9f5d";

const pdfBase = {
  invoiceNumber: "2026.004",
  issuedAt: "2026-11-10",
  dueDate: "2026-11-17",
  isCreditNote: false,
  creditOfInvoiceNumber: null,
  billToName: "Anna de Vries",
  billToCompany: null,
  billToVatNumber: null,
  billToStreet: "Tjalk 68",
  billToPostalCode: "1231TX",
  billToCity: "Loosdrecht",
  billToCountry: "NL",
  lines: [{ description: "Les", quantity: 1, netCents: 2294, vatRateBp: 900, grossCents: 2500 }],
  subtotalNetCents: 2294,
  vatByRate: [{ rateBp: 900, vatCents: 206 }],
  totalGrossCents: 2500,
  tmcName: "The Movement Club",
  tmcTagline: "Where Strength Meets Movement",
  tmcAddress: "Industrieweg 14P, 1231 KH Loosdrecht",
  tmcKvk: "42063910",
  tmcBtw: "NL869541651B01",
  tmcEmail: "info@themovementclub.nl",
  payment: { iban: "NL36 RABO 0175 6438 06", accountHolder: "The Movement Club" },
};

function contains(buf: Buffer, text: string): boolean {
  return buf.toString("latin1").includes(text);
}

test("PDF met betaallink: bevat de link als URI-annotatie", async () => {
  const buf = await renderToBuffer(
    CustomerInvoicePdf({ ...pdfBase, payUrl: PAY_URL, payQr: null }),
  );
  assert.ok(contains(buf, PAY_URL), "de PDF moet de betaal-URL als link bevatten");
});

test("PDF zonder betaallink: geen link, wel een geldige PDF", async () => {
  const buf = await renderToBuffer(
    CustomerInvoicePdf({ ...pdfBase, payUrl: null, payQr: null }),
  );
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(contains(buf, "/factuur/betalen/"), false);
});

const mailBase = {
  firstName: "Anna",
  invoiceNumber: "2026.004",
  amountEuro: "€25,00",
  isCreditNote: false,
  portalUrl: "https://www.themovementclub.nl/app/facturen",
  payment: {
    iban: "NL36 RABO 0175 6438 06",
    accountHolder: "The Movement Club",
    reference: "2026.004",
    dueDate: "17-11-2026",
  },
};

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

test("mail met betaallink: knop Betaal nu, URL alleen als href, nooit als tekst", async () => {
  const html = await render(InvoiceReady({ ...mailBase, payUrl: PAY_URL }) as never);
  assert.match(html, /Betaal nu/);
  assert.ok(html.includes(`href="${PAY_URL}"`));
  assert.equal(visibleText(html).includes("themovementclub.nl/factuur"), false);
  assert.match(visibleText(html), /Zelf overmaken/);
  assert.match(visibleText(html), /Betalen kan op twee manieren/);
});

test("mail zonder betaallink: alleen overmaken, geen knop", async () => {
  for (const payUrl of [null, undefined]) {
    const html = await render(InvoiceReady({ ...mailBase, payUrl }) as never);
    assert.equal(/Betaal nu/.test(html), false);
    assert.equal(html.includes("/factuur/betalen/"), false);
    assert.match(visibleText(html), /Zelf overmaken/);
    assert.match(visibleText(html), /NL36 RABO 0175 6438 06/);
  }
});

test("creditnota-mail: nooit een knop, ook met een payUrl", async () => {
  const html = await render(
    InvoiceReady({ ...mailBase, isCreditNote: true, payment: undefined, payUrl: PAY_URL }) as never,
  );
  assert.equal(/Betaal nu/.test(html), false);
});
