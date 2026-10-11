/**
 * Linkregel voor de mails van de gratis proefles (testplan h): in de
 * HTML-versie staat nooit een URL of kaal domein als zichtbare tekst; de
 * annuleerlink is een tekstlink. Rendert de bevestiging (variant opening,
 * groepsles en vrij trainen) en de nieuwe herinnering met @react-email/render.
 * Run: node --import tsx --test scripts/opening-trial/emails.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import * as ConfirmationModule from "../../src/emails/trial_code_confirmation";
import * as ReminderModule from "../../src/emails/trial_booking_reminder";

// tsx levert de default export van een .tsx als CJS-interop ({ default: fn })
// of direct als functie, afhankelijk van de node-versie; beide vormen vangen.
function defaultExport<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  const d = m.default as { default?: unknown } | undefined;
  return (typeof d === "function" ? d : d?.default) as T;
}
const TrialCodeConfirmation = defaultExport<typeof import("../../src/emails/trial_code_confirmation").default>(ConfirmationModule);
const TrialBookingReminder = defaultExport<typeof import("../../src/emails/trial_booking_reminder").default>(ReminderModule);

const CANCEL_URL = "https://www.themovementclub.nl/proefles/annuleren/2d8f1d7d-b7cc-46c3-bc30-c6b921e5e824";

/** Zichtbare tekst: alle tags weg, entities genegeerd (ruwe check, streng genoeg). */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
}

/**
 * Het kale domein in de voettekst van EmailLayout (_layout.tsx) valt onder de
 * guardrails-PR (#281, nog open); hier toetsen we alleen de inhoud van deze
 * twee templates: alles voor de voettekst.
 */
function bodyText(html: string): string {
  const text = visibleText(html);
  const idx = text.lastIndexOf("themovementclub.nl");
  return idx === -1 ? text : text.slice(0, idx);
}

function assertLinkRule(html: string, label: string) {
  const text = bodyText(html);
  assert.doesNotMatch(text, /https?:\/\//, `${label}: zichtbare URL`);
  assert.doesNotMatch(text, /themovementclub\.nl/i, `${label}: zichtbaar domein`);
  assert.doesNotMatch(text, /\/proefles\/annuleren/, `${label}: zichtbaar pad`);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, `${label}: minstens een link`);
  for (const h of hrefs) {
    assert.ok(
      h.startsWith("https://www.themovementclub.nl") || h.startsWith("mailto:") || h.startsWith("tel:"),
      `${label}: href buiten themovementclub.nl: ${h}`,
    );
  }
  assert.ok(hrefs.includes(CANCEL_URL), `${label}: annuleerlink aanwezig`);
  assert.doesNotMatch(html, /\u2014/, `${label}: em dash`);
}

test("bevestiging gratis proefles (groepsles) houdt de linkregel en noemt de openingsperiode", async () => {
  const html = await render(
    TrialCodeConfirmation({
      firstName: "Sam",
      className: "Yoga & Mobility",
      trainerName: "Marlon",
      whenLabel: "maandag 20 oktober · 10:00 tot 11:00",
      cancelUrl: CANCEL_URL,
      cancellationWindowHours: 6,
      source: "opening",
      priceLabel: null,
    }),
  );
  assertLinkRule(html, "bevestiging groepsles");
  assert.match(visibleText(html), /openingsperiode/);
  assert.match(html, /Annuleer je proefles/);
  assert.doesNotMatch(visibleText(html), /Betaald:/);
});

test("bevestiging gratis proefuur vrij trainen houdt de linkregel", async () => {
  const html = await render(
    TrialCodeConfirmation({
      firstName: "Sam",
      className: "Vrij trainen",
      trainerName: "Marlon",
      whenLabel: "maandag 20 oktober · 09:00 tot 10:00",
      cancelUrl: CANCEL_URL,
      cancellationWindowHours: 6,
      source: "opening",
      variant: "vrij_trainen",
    }),
  );
  assertLinkRule(html, "bevestiging vrij trainen");
  assert.match(visibleText(html), /eigen handdoek/);
});

test("bevestiging via code en betaald blijven zonder de openingsregel", async () => {
  const code = await render(
    TrialCodeConfirmation({
      firstName: "Sam", className: "Kettlebell", trainerName: "Marlon",
      whenLabel: "x", cancelUrl: CANCEL_URL, cancellationWindowHours: 6, source: "code",
    }),
  );
  assert.doesNotMatch(visibleText(code), /openingsperiode/);
  const paid = await render(
    TrialCodeConfirmation({
      firstName: "Sam", className: "Kettlebell", trainerName: "Marlon",
      whenLabel: "x", cancelUrl: CANCEL_URL, cancellationWindowHours: 6, source: "paid", priceLabel: "€17,-",
    }),
  );
  assert.doesNotMatch(visibleText(paid), /openingsperiode/);
  assert.match(visibleText(paid), /Betaald:/);
});

test("herinnering proefles houdt de linkregel, met tekstlink en termijn", async () => {
  for (const variant of ["group", "vrij_trainen"] as const) {
    const html = await render(
      TrialBookingReminder({
        firstName: "Sam",
        className: variant === "group" ? "Yoga & Mobility" : "Vrij trainen",
        trainerName: "Marlon",
        whenLabel: "maandag 20 oktober · 10:00 tot 11:00",
        cancelUrl: CANCEL_URL,
        cancellationWindowHours: 6,
        variant,
      }),
    );
    assertLinkRule(html, `herinnering ${variant}`);
    assert.match(visibleText(html), /tot\s+6\s+uur van tevoren/);
    assert.match(html, />\s*Annuleer je proefles\s*</);
    assert.doesNotMatch(html, /\/app\/boekingen/);
  }
});
