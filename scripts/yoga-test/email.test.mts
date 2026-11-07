/**
 * Uitslagmail van de yoga-quiz: in de HTML staat nooit een URL of kaal domein
 * als zichtbare tekst (mail met zichtbare URL belandde eerder in spam), de
 * code staat er alleen als hij bruikbaar is, en er is geen em dash.
 * Run: node --import tsx --test scripts/yoga-test/email.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import * as Module from "../../src/emails/yoga_test_result";

function defaultExport<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  const d = m.default as { default?: unknown } | undefined;
  return (typeof d === "function" ? d : d?.default) as T;
}
const YogaTestResult = defaultExport<typeof import("../../src/emails/yoga_test_result").default>(Module);

const CTA = "https://www.themovementclub.nl/proefles/code/start?quiz=yoga&les=8aef0315-e700-4383-a4aa-6929ba1ef563";

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

const base = {
  firstName: "Lotte",
  lessonName: "Pilates",
  why: "Jij zoekt kracht van binnenuit.",
  what: "Gecontroleerde oefeningen.",
  times: ["za 09:00, met Patricia"],
  ctaHref: CTA,
};

test("met actieve code: code zichtbaar, link als tekstlink, geen URL in de zichtbare tekst", async () => {
  const html = await render(YogaTestResult({ ...base, code: "JOUWYOGA" }));
  const text = visibleText(html);
  assert.ok(text.includes("JOUWYOGA"));
  assert.ok(text.includes("Boek je gratis proefles"));
  assert.ok(text.includes("za 09:00, met Patricia"));
  assert.ok(!/https?:\/\//i.test(text), "URL in zichtbare tekst");
  assert.ok(!/www\./i.test(text), "domein in zichtbare tekst");
  assert.ok(html.includes(`href="${CTA.replaceAll("&", "&amp;")}"`), "de href staat wel in het attribuut");
  assert.ok(!html.includes("\u2014"), "em dash");
  assert.ok(text.includes("handdoek"));
  assert.ok(!/verhuur|huur/i.test(text), "geen verhuur noemen");
});

test("zonder actieve code: geen codeblok en de betaalde knoptekst", async () => {
  const html = await render(YogaTestResult({ ...base, code: null }));
  const text = visibleText(html);
  assert.ok(!text.includes("JOUWYOGA"));
  assert.ok(!text.includes("gratis met code"));
  assert.ok(text.includes("Boek je proefles"));
});
