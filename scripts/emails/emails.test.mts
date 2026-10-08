import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEmails, unregisteredTemplates } from "../check-emails.mts";
import { loadLint } from "./load.mts";

const { lintAuthTemplate, lintHtml } = await loadLint();

test("alle templates en Auth-templates volgen de linkregel", async () => {
  assert.deepEqual(await checkEmails(), []);
});

test("een template zonder registry-entry wordt gemeld, _layout niet", () => {
  assert.deepEqual(
    unregisteredTemplates(["_layout.tsx", "a.tsx", "b.tsx", "registry.ts"], ["a"]),
    ["b"],
  );
});

const rules = (html: string) => lintHtml(html).map((v) => v.rule);

test("zichtbare URL, www en kaal domein worden geweigerd", () => {
  assert.deepEqual(rules("<p>Ga naar https://www.themovementclub.nl/x</p>"), ["visible-url"]);
  assert.deepEqual(rules("<p>Ga naar www.themovementclub.nl</p>"), ["visible-url"]);
  assert.deepEqual(rules("<p>Ga naar themovementclub.nl/contact</p>"), ["bare-domain"]);
});

test("toegestaan e-mailadres, bedragen en datums zijn geen domein", () => {
  assert.deepEqual(rules("<p>Mail marlon@themovementclub.nl, €17,00, 23 apr. 2026, 1.5 uur</p>"), []);
  assert.deepEqual(rules("<p>Mail iemand@example.com</p>"), ["bare-domain"]);
});

test("head, style en title tellen niet als zichtbare tekst", () => {
  assert.deepEqual(rules("<html><head><title>themovementclub.nl</title><style>a{}</style></head><body><p>Hoi</p></body></html>"), []);
});

test("lege en URL-achtige linktekst worden geweigerd", () => {
  const href = "https://www.themovementclub.nl/a";
  assert.deepEqual(rules(`<a href="${href}"> </a>`), ["empty-link-text"]);
  assert.deepEqual(rules(`<a href="${href}"><img src="x.png"></a>`), ["empty-link-text"]);
  assert.ok(rules(`<a href="${href}">themovementclub.nl/aanbod</a>`).includes("url-like-link-text"));
  assert.deepEqual(rules(`<a href="${href}">Bekijk ons aanbod</a>`), []);
});

test("href buiten themovementclub.nl wordt geweigerd, mailto en tel niet", () => {
  assert.deepEqual(rules('<a href="https://tmc-git-x.vercel.app/a">Open</a>'), ["href-domain"]);
  assert.deepEqual(rules('<a href="https://abc.supabase.co/auth/v1/verify">Open</a>'), ["href-domain"]);
  assert.deepEqual(rules('<a href="https://www.themovementclub.nl.evil.com/">Open</a>'), ["href-domain"]);
  assert.deepEqual(rules('<a href="mailto:marlon@themovementclub.nl">Mail ons</a>'), []);
  assert.deepEqual(rules('<a href="tel:+31600000000">Bel ons</a>'), []);
});

test("Auth-template: variabele-href mag, variabele als zichtbare tekst niet", () => {
  const button = '<a href="{{ .ConfirmationURL }}">Inloggen</a>';
  assert.deepEqual(lintAuthTemplate(button).map((v) => v.rule), []);
  const fallback = `${button}<p>Werkt de knop niet? <a href="{{ .ConfirmationURL }}">{{ .ConfirmationURL }}</a></p>`;
  assert.ok(lintAuthTemplate(fallback).length > 0);
  assert.deepEqual(
    lintAuthTemplate('<p>{{ if .Data.first_name }}{{ .Data.first_name }}{{ else }}daar{{ end }}</p><p>{{ .Token }}</p>'),
    [],
  );
});
