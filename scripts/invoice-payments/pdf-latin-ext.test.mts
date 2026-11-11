/**
 * latin-ext in de factuur-PDF: een afnemernaam met tekens buiten latin
 * (ł, č, ř, ő) moet leesbaar in de PDF staan, niet als leeg vlak of notdef.
 * react-pdf kent geen unicode-range, dus de PDF registreert latin-ext als
 * fallback-familie (zie CustomerInvoicePdf.tsx). We lezen de tekst terug uit
 * de PDF met pdfjs-dist.
 * Run: node --import tsx --test scripts/invoice-payments/pdf-latin-ext.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

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

async function pdfText(buf: Buffer): Promise<string> {
  // pdfjs-dist (devDependency) leest de tekst terug via de ToUnicode-map van
  // de ingebedde fonts: precies wat een lezer of zoekfunctie ziet.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // pdfjs knipt de tekst op bij elke fontwissel (latin naar latin-ext);
    // zonder scheidingsteken lezen we de regel zoals een mens hem ziet.
    out += content.items.map((it) => ("str" in it ? it.str : "")).join("") + "\n";
  }
  return out;
}

test("PDF toont latin-ext-tekens in naam, adres en plaats", async () => {
  const buf = await renderToBuffer(
    CustomerInvoicePdf({
      ...pdfBase,
      billToName: "Łukasz Dvořák",
      billToStreet: "Őrmester utca 5",
      billToCity: "Wrocław",
      payUrl: null,
      payQr: null,
    }),
  );
  const text = (await pdfText(buf)).replace(/\s+/g, " ");
  assert.ok(text.includes("Łukasz Dvořák"), `naam ontbreekt in: ${text.slice(0, 500)}`);
  assert.ok(text.includes("Őrmester utca 5"), "straat ontbreekt");
  assert.ok(text.includes("Wrocław"), "plaats ontbreekt");
  assert.ok(text.includes("The Movement Club"), "gewone latin-tekst ontbreekt");
  // Regressie: latin en latin-ext hadden dezelfde PostScript-naam, waardoor
  // glyphs door elkaar liepen ("Subtotaal" werd "SuŐtotaal" en Ł een
  // kluwen). De ext-bestanden dragen daarom een eigen naam (...Ext).
  assert.ok(text.includes("Subtotaal excl. BTW"), "latin-tekst is vervormd door de ext-font");
});
