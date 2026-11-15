/**
 * Linkregel voor de intake-mail aan Marlon: in de HTML staat nooit een URL of
 * kaal domein als zichtbare tekst; telefoon, e-mail en dashboard zijn
 * tekstlinks. Reply-to zit in notify.ts (sendEmail) en wordt in de
 * end-to-end test gecontroleerd.
 * Run: node --import tsx --test scripts/programma-intake/email.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import * as TemplateModule from "../../src/emails/programma_intake";

function defaultExport<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  const d = m.default as { default?: unknown } | undefined;
  return (typeof d === "function" ? d : d?.default) as T;
}
const ProgrammaIntake = defaultExport<typeof import("../../src/emails/programma_intake").default>(TemplateModule);

const DASHBOARD_URL = "https://www.themovementclub.nl/app/admin/intakes";

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;|&#39;/g, "'");
}

/** Alles voor de voettekst van EmailLayout (die noemt het kale domein). */
function bodyText(html: string): string {
  const text = visibleText(html);
  const idx = text.lastIndexOf("themovementclub.nl");
  return idx === -1 ? text : text.slice(0, idx);
}

function assertLinkRule(html: string, label: string) {
  const text = bodyText(html);
  assert.doesNotMatch(text, /https?:\/\//, `${label}: zichtbare URL`);
  assert.doesNotMatch(text, /themovementclub\.nl/i, `${label}: zichtbaar domein`);
  assert.doesNotMatch(text, /\/app\/admin/, `${label}: zichtbaar pad`);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    assert.ok(
      h.startsWith("tel:") || h.startsWith("mailto:") || h.startsWith("https://www.themovementclub.nl"),
      `${label}: href buiten tel, mailto en themovementclub.nl: ${h}`,
    );
  }
  assert.ok(hrefs.includes("tel:+31612345678"), `${label}: tel-link`);
  assert.ok(hrefs.includes("mailto:noor@example.com"), `${label}: mailto-link`);
  assert.ok(hrefs.includes(DASHBOARD_URL), `${label}: dashboardlink`);
  assert.doesNotMatch(html, /\u2014/, `${label}: em dash`);
}

const BASE = {
  firstName: "Noor",
  lastName: "de Vries",
  phone: "+31612345678",
  email: "noor@example.com",
  preferredDay: "dinsdag",
  message: "Regel een\nregel twee",
  submittedAtLabel: "zondag 15 november 2026 om 14:32",
  sourceLines: ["Campagne: google / cpc / programma", "Landingspad: /12-weken-programma?gclid=abc"],
  dashboardUrl: DASHBOARD_URL,
  originalRecipientLabel: null,
};

test("mail houdt de linkregel en toont alle velden", async () => {
  const html = await render(ProgrammaIntake(BASE));
  assertLinkRule(html, "intake-mail");
  const text = visibleText(html);
  assert.match(text, /Noor de Vries/);
  assert.match(text, /Telefoon:\s*\+31612345678/);
  assert.match(text, /E-mail:\s*noor@example\.com/);
  assert.match(text, /Voorkeursdag:\s*dinsdag/);
  assert.match(text, /Aangevraagd:\s*zondag 15 november 2026 om 14:32/);
  assert.match(text, /Regel een\s+regel twee/);
  assert.match(text, /Campagne: google \/ cpc \/ programma/);
  assert.match(html, />\s*Bekijk in dashboard\s*</);
  assert.match(html, /white-space:\s*pre-wrap/, "berichtregels blijven behouden");
  assert.doesNotMatch(text, /Testomgeving/);
});

test("zonder bron en zonder bericht", async () => {
  const html = await render(ProgrammaIntake({ ...BASE, message: null, sourceLines: [] }));
  assertLinkRule(html, "zonder bron");
  const text = visibleText(html);
  assert.match(text, /Geen bericht/);
  assert.doesNotMatch(text, /Bron:/);
});

test("omgeleide mail noemt de oorspronkelijke ontvanger", async () => {
  const html = await render(ProgrammaIntake({ ...BASE, originalRecipientLabel: "marlon@themovementclub.nl" }));
  const text = visibleText(html);
  assert.match(text, /Testomgeving\. Oorspronkelijke ontvanger:\s*marlon@themovementclub\.nl/);
});
