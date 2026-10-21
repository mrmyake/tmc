/**
 * Linkregel voor de last-minute trainersmail (spec-last-minute-alerts.md): in
 * de HTML-versie staat nooit een URL of kaal domein als zichtbare tekst; de
 * deelnemerslijst is een tekstlink. Zelfde opzet als
 * scripts/opening-trial/emails.test.mts.
 * Run: node --import tsx --test scripts/last-minute-alerts/email.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import * as TemplateModule from "../../src/emails/last_minute_booking";

function defaultExport<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  const d = m.default as { default?: unknown } | undefined;
  return (typeof d === "function" ? d : d?.default) as T;
}
const LastMinuteBooking = defaultExport<typeof import("../../src/emails/last_minute_booking").default>(TemplateModule);

const PARTICIPANTS_URL = "https://www.themovementclub.nl/app/trainer/sessies/6b1c0d1e-1111-4222-8333-444455556666";

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
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
  assert.doesNotMatch(text, /\/app\/trainer\/sessies/, `${label}: zichtbaar pad`);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 0, `${label}: minstens een link`);
  for (const h of hrefs) {
    assert.ok(h.startsWith("https://www.themovementclub.nl"), `${label}: href buiten themovementclub.nl: ${h}`);
  }
  assert.ok(hrefs.includes(PARTICIPANTS_URL), `${label}: link naar de deelnemerslijst aanwezig`);
  assert.doesNotMatch(html, /\u2014/, `${label}: em dash`);
}

const BASE = {
  recipientFirstName: "Noor",
  className: "Yoga & Mobility",
  whenLabel: "woensdag 22 oktober · 18:00 tot 19:00",
  participantName: "Sanne de Vries",
  kindLabel: "gast van Kim",
  totalParticipants: 5,
  participantsUrl: PARTICIPANTS_URL,
  originalRecipientLabel: null,
};

test("trainersmail houdt de linkregel en noemt deelnemer, soort en totaal", async () => {
  const html = await render(LastMinuteBooking(BASE));
  assertLinkRule(html, "trainersmail");
  const text = visibleText(html);
  assert.match(text, /Hoi Noor,/);
  assert.match(text, /Deelnemer:\s*Sanne de Vries/);
  assert.match(text, /Soort:\s*gast van Kim/);
  assert.match(text, /Totaal ingeschreven:\s*5/);
  assert.match(html, />\s*Bekijk de deelnemerslijst\s*</);
  assert.doesNotMatch(text, /Testomgeving/);
});

test("omgeleide mail noemt de oorspronkelijke ontvanger en houdt de linkregel", async () => {
  const html = await render(
    LastMinuteBooking({ ...BASE, recipientFirstName: "", originalRecipientLabel: "trainer: noor@example.com" }),
  );
  assertLinkRule(html, "omgeleide mail");
  const text = visibleText(html);
  assert.match(text, /Testomgeving\. Oorspronkelijke ontvanger:\s*trainer: noor@example\.com/);
  assert.match(text, /Hoi,/);
});

test("platte tekst bevat de deelnemerslijst-URL als link", async () => {
  const text = await render(LastMinuteBooking(BASE), { plainText: true });
  assert.match(text, /Bekijk de deelnemerslijst/);
  assert.ok(text.includes(PARTICIPANTS_URL), "platte tekst heeft de URL nodig, daar bestaat geen tekstlink");
});
