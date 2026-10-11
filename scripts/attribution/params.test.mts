import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTION_KEYS,
  attributionQuery,
  hasAttribution,
  parseAdConsent,
  parseAttribution,
  resolveAttribution,
  sanitizeLandingPath,
  sanitizeLeadAttribution,
  sanitizeValue,
  withAttribution,
} from "../../src/lib/attribution/params.ts";

// First-party attributie (spec-marketing-attribution.md): de pure laag die
// server pages, client-componenten, acties en route delen.

test("parseAttribution: alleen bekende sleutels, getrimd, onbekende weg", () => {
  const params = parseAttribution({
    gclid: " test123 ",
    utm_source: "google",
    utm_campaign: "test",
    soort: "vrij",
    dag: "2026-10-20",
    foo: "bar",
  });
  assert.deepEqual(params, { gclid: "test123", utm_source: "google", utm_campaign: "test" });
  assert.equal(hasAttribution(params), true);
});

test("parseAttribution: zonder parameters een leeg object, ook met lp", () => {
  assert.deepEqual(parseAttribution({ soort: "vrij", lp: "/proefles?x=1" }), {});
  assert.deepEqual(parseAttribution(new URLSearchParams("dag=2026-10-20")), {});
  assert.deepEqual(parseAttribution(null), {});
  assert.equal(hasAttribution({}), false);
  assert.equal(hasAttribution({ landing_path: "/proefles" }), false);
});

test("parseAttribution: URLSearchParams en arrays (eerste waarde)", () => {
  assert.deepEqual(parseAttribution(new URLSearchParams("fbclid=abc.DEF_1-2&utm_medium=cpc")), {
    fbclid: "abc.DEF_1-2",
    utm_medium: "cpc",
  });
  assert.deepEqual(parseAttribution({ gclid: ["eerste", "tweede"] }), { gclid: "eerste" });
});

test("sanitizeValue: klik-ID's alleen uit het toegestane tekenbereik", () => {
  assert.equal(sanitizeValue("gclid", "Cj0KCQjw_abc-123.x"), "Cj0KCQjw_abc-123.x");
  assert.equal(sanitizeValue("gclid", "met spatie"), null);
  assert.equal(sanitizeValue("gbraid", "a<b>"), null);
  assert.equal(sanitizeValue("wbraid", "a/b"), null);
  assert.equal(sanitizeValue("fbclid", "é"), null);
  assert.equal(sanitizeValue("gclid", ""), null);
  assert.equal(sanitizeValue("gclid", 123), null);
});

test("sanitizeValue: utm-velden vrij, maar getrimd, zonder besturingstekens en begrensd", () => {
  assert.equal(sanitizeValue("utm_campaign", " herfst actie 2026 / A|B "), "herfst actie 2026 / A|B");
  assert.equal(sanitizeValue("utm_term", "regel\nbreuk"), null);
  assert.equal(sanitizeValue("utm_content", "x".repeat(512)), "x".repeat(512));
  assert.equal(sanitizeValue("utm_content", "x".repeat(513)), null);
});

test("sanitizeLandingPath: begint met /, geen host, geen protocol, max 2048", () => {
  assert.equal(sanitizeLandingPath("/proefles?gclid=test123"), "/proefles?gclid=test123");
  assert.equal(sanitizeLandingPath("/proefles"), "/proefles");
  assert.equal(sanitizeLandingPath("proefles"), null);
  assert.equal(sanitizeLandingPath("//evil.example/x"), null);
  assert.equal(sanitizeLandingPath("https://evil.example/proefles"), null);
  assert.equal(sanitizeLandingPath("/javascript:alert(1)"), null);
  assert.equal(sanitizeLandingPath("/proefles met spatie"), null);
  assert.equal(sanitizeLandingPath("/" + "a".repeat(2047)), "/" + "a".repeat(2047));
  assert.equal(sanitizeLandingPath("/" + "a".repeat(2048)), null);
  assert.equal(sanitizeLandingPath(""), null);
  assert.equal(sanitizeLandingPath(undefined), null);
});

test("resolveAttribution: zonder lp is de huidige URL de landing", () => {
  const params = resolveAttribution(
    { gclid: "test123", utm_source: "google", utm_campaign: "test" },
    "/proefles",
  );
  assert.equal(params.landing_path, "/proefles?gclid=test123&utm_source=google&utm_campaign=test");
});

test("resolveAttribution: een geldige lp blijft staan, ook op een vervolgpagina", () => {
  const params = resolveAttribution(
    { gclid: "test123", soort: "vrij", lp: "/proefles?gclid=test123" },
    "/proefles/gratis",
  );
  assert.equal(params.landing_path, "/proefles?gclid=test123");
});

test("resolveAttribution: een ongeldige lp wordt vervangen door de huidige URL, zonder de lp zelf", () => {
  const params = resolveAttribution(
    { gclid: "test123", lp: "https://evil.example/x", dag: "2026-10-20" },
    "/proefles/gratis",
  );
  assert.equal(params.landing_path, "/proefles/gratis?gclid=test123&dag=2026-10-20");
});

test("resolveAttribution: zonder parameters geen landing en een leeg object", () => {
  assert.deepEqual(resolveAttribution({ soort: "vrij" }, "/proefles/gratis"), {});
});

test("attributionQuery en withAttribution: schone links zonder parameters", () => {
  assert.equal(attributionQuery({}), "");
  assert.equal(withAttribution("/proefles/gratis", {}), "/proefles/gratis");
  assert.equal(withAttribution("/proefles/gratis?soort=vrij", undefined), "/proefles/gratis?soort=vrij");
});

test("withAttribution: ? of & afhankelijk van de href, lp als laatste", () => {
  const params = { gclid: "test123", utm_source: "google", landing_path: "/proefles?gclid=test123" };
  assert.equal(
    withAttribution("/proefles/gratis", params),
    "/proefles/gratis?gclid=test123&utm_source=google&lp=%2Fproefles%3Fgclid%3Dtest123",
  );
  assert.equal(
    withAttribution("/proefles/gratis?soort=vrij&dag=2026-10-20", params),
    "/proefles/gratis?soort=vrij&dag=2026-10-20&gclid=test123&utm_source=google&lp=%2Fproefles%3Fgclid%3Dtest123",
  );
});

test("rondreis: wat withAttribution schrijft leest resolveAttribution ongewijzigd terug", () => {
  const start = resolveAttribution(
    { gclid: "test123", utm_source: "google", utm_campaign: "test" },
    "/proefles",
  );
  const href = withAttribution("/proefles/gratis?soort=vrij", start);
  const next = resolveAttribution(new URL(href, "https://x.invalid").searchParams, "/proefles/gratis");
  assert.deepEqual(next, start);
});

test("parseAdConsent: drie waarden, alles anders unknown", () => {
  assert.equal(parseAdConsent("granted"), "granted");
  assert.equal(parseAdConsent("denied"), "denied");
  assert.equal(parseAdConsent("unknown"), "unknown");
  assert.equal(parseAdConsent("yes"), "unknown");
  assert.equal(parseAdConsent(undefined), "unknown");
  assert.equal(parseAdConsent(null), "unknown");
});

test("sanitizeLeadAttribution: server-side, onbekende sleutels weg, ongeldige lp weggelaten", () => {
  const result = sanitizeLeadAttribution({
    gclid: "test123",
    utm_source: "google",
    landing_path: "https://evil.example/x",
    ad_consent: "denied",
    email: "niet@hier.nl",
    __proto__: { x: 1 },
  });
  assert.deepEqual(result, {
    params: { gclid: "test123", utm_source: "google" },
    adConsent: "denied",
  });
});

test("sanitizeLeadAttribution: zonder parameters null, ook met alleen lp of consent", () => {
  assert.equal(sanitizeLeadAttribution(undefined), null);
  assert.equal(sanitizeLeadAttribution(null), null);
  assert.equal(sanitizeLeadAttribution("gclid=x"), null);
  assert.equal(sanitizeLeadAttribution({ landing_path: "/proefles", ad_consent: "granted" }), null);
  assert.equal(sanitizeLeadAttribution({ gclid: "met spatie" }), null);
});

test("sanitizeLeadAttribution: alle negen sleutels komen door", () => {
  const input = Object.fromEntries(ATTRIBUTION_KEYS.map((k) => [k, `v_${k}`]));
  const result = sanitizeLeadAttribution({ ...input, landing_path: "/proefles?x=1" });
  assert.ok(result);
  for (const key of ATTRIBUTION_KEYS) assert.equal(result.params[key], `v_${key}`);
  assert.equal(result.params.landing_path, "/proefles?x=1");
  assert.equal(result.adConsent, "unknown");
});
