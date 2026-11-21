/**
 * Route-test voor POST /api/leads/hormoonprofiel met een gemockte fetch:
 * Supabase (REST), MailerLite, ntfy en MailerSend. Echte database en mail
 * worden nooit aangeraakt.
 * Run: node --import tsx --import ./scripts/programma-intake/hooks.mjs --test scripts/hormoonprofiel/route.test.mts
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.MAILERLITE_API_KEY = "ml-key";
process.env.MAILERSEND_API_KEY = "ms-key";
process.env.MAILERSEND_FROM_EMAIL = "noreply@themovementclub.nl";
process.env.PROGRAMMA_INTAKE_REDIRECT_EMAIL = "test@example.com";
process.env.MAILERLITE_HORMOONPROFIEL_GROUP_ID = "999";
delete process.env.VERCEL_ENV;

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
let calls: Call[] = [];
let seenKeys = new Set<string>();

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  let body: unknown = raw;
  if (typeof raw === "string") {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => (headers[k.toLowerCase()] = v));
  calls.push({ url, method: init?.method ?? "GET", body, headers });

  if (url.startsWith("http://supabase.test/rest/v1/programma_intakes")) {
    const key = (body as { idempotency_key: string }).idempotency_key;
    if (seenKeys.has(key)) return Response.json({ code: "23505", message: "dup", details: "", hint: "" }, { status: 409 });
    seenKeys.add(key);
    return Response.json({ id: "11111111-2222-4333-8444-555555555555", created_at: "2026-11-21T10:00:00Z" }, { status: 201 });
  }
  if (url.startsWith("http://supabase.test/rest/v1/lead_attributions")) return new Response(null, { status: 201 });
  if (url.startsWith("https://connect.mailerlite.com")) return Response.json({}, { status: 200 });
  if (url.startsWith("https://ntfy.sh")) return new Response("ok", { status: 200 });
  if (url.includes("mailersend.com")) return new Response(null, { status: 202 });
  throw new Error(`onverwachte fetch: ${url}`);
}) as typeof fetch;

const { POST } = await import("../../src/app/api/leads/hormoonprofiel/route");

const BODY = {
  firstName: "Noor",
  lastName: "de Vries",
  email: "noor@example.com",
  phone: "06 12345678",
  message: "Meer energie",
  website: "",
  elapsedMs: 12000,
  variant: "standalone",
  submissionId: "6b1c0d1e-1111-4222-8333-444455556666",
};

function post(body: unknown, host = "hormoonprofiel.com") {
  return POST(
    new Request(`https://${host}/api/leads/hormoonprofiel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
const to = (prefix: string) => calls.filter((c) => c.url.startsWith(prefix));
let errors: unknown[][] = [];
let warnings: unknown[][] = [];
console.error = (...a: unknown[]) => void errors.push(a);
console.warn = (...a: unknown[]) => void warnings.push(a);
beforeEach(() => {
  calls = [];
  seenKeys = new Set();
  errors = [];
  warnings = [];
  process.env.MAILERLITE_HORMOONPROFIEL_GROUP_ID = "999";
});

test("geslaagde inzending: rij, MailerLite-groep, ntfy met TEST-prefix, mail zonder voorkeursdag", async () => {
  const res = await post(BODY);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });

  assert.ok(calls[0].url.startsWith("http://supabase.test/rest/v1/programma_intakes"), "opslaan komt eerst");
  const row = calls[0].body as Record<string, unknown>;
  assert.equal(row.phone, "+31612345678");
  assert.equal(row.preferred_day, "geen voorkeur");
  assert.equal(row.signup_path, "/hormoonprofiel");
  assert.equal(row.landing_path, "/hormoonprofiel?host=hormoonprofiel.com&mode=standalone");

  const ml = to("https://connect.mailerlite.com");
  assert.equal(ml.length, 1);
  assert.deepEqual((ml[0].body as { groups: string[] }).groups, ["999"]);

  const ntfy = to("https://ntfy.sh");
  assert.equal(ntfy.length, 1);
  assert.equal(ntfy[0].headers.title, "TEST: Hormoonprofiel: kennismaking aangevraagd!");
  assert.doesNotMatch(String(ntfy[0].body), /Noor|noor@|0612/);

  const mail = to("https://api.mailersend.com")[0].body as { subject: string; to: { email: string }[]; html: string };
  assert.equal(mail.subject, "[TEST] Kennismaking hormoonprofiel");
  assert.equal(mail.to[0].email, "test@example.com");
  assert.doesNotMatch(mail.html, /Voorkeursdag/);
  assert.match(mail.html, /tel:\+31612345678/);
  assert.match(mail.html, /Meer energie/);
  // Geen volledige URL als zichtbare tekst: alleen in href-attributen.
  const visible = mail.html.replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(visible, /https?:\/\//);
  assert.equal(errors.length, 0, JSON.stringify(errors));
});

test("productie: ntfy zonder prefix, mail naar Marlon met het exacte onderwerp", async () => {
  process.env.VERCEL_ENV = "production";
  try { await post(BODY); } finally { delete process.env.VERCEL_ENV; }
  assert.equal(to("https://ntfy.sh")[0].headers.title, "Hormoonprofiel: kennismaking aangevraagd!");
  const mail = to("https://api.mailersend.com")[0].body as { subject: string; to: { email: string }[] };
  assert.equal(mail.subject, "Kennismaking hormoonprofiel");
  assert.equal(mail.to[0].email, "marlon@themovementclub.nl");
});

test("sectie op TMC: host en modus in landing_path, advertentielanding als lp", async () => {
  await post(
    {
      ...BODY,
      variant: "section",
      attribution: { gclid: "abc", utm_source: "google", landing_path: "/hormoonprofiel?gclid=abc" },
    },
    "www.themovementclub.nl",
  );
  const row = calls[0].body as Record<string, unknown>;
  assert.equal(
    row.landing_path,
    "/hormoonprofiel?host=www.themovementclub.nl&mode=section&lp=%2Fhormoonprofiel%3Fgclid%3Dabc",
  );
  assert.equal(row.gclid, "abc");
  assert.equal(to("http://supabase.test/rest/v1/lead_attributions").length, 1);
});

test("zonder MAILERLITE_HORMOONPROFIEL_GROUP_ID: MailerLite overgeslagen met een warning", async () => {
  process.env.MAILERLITE_HORMOONPROFIEL_GROUP_ID = "";
  const res = await post(BODY);
  assert.equal(res.status, 200);
  assert.equal(to("https://connect.mailerlite.com").length, 0);
  assert.ok(warnings.some((w) => /MAILERLITE_HORMOONPROFIEL_GROUP_ID/.test(String(w[0]))));
  assert.equal(to("https://api.mailersend.com").length, 1);
});

test("honeypot gevuld of te snel: stil succes, niets opgeslagen of verstuurd", async () => {
  for (const bad of [{ ...BODY, website: "http://spam.test" }, { ...BODY, elapsedMs: 800 }, { ...BODY, elapsedMs: undefined }]) {
    calls = [];
    const res = await post(bad);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true });
    assert.equal(calls.length, 0);
  }
});

test("validatie: ontbrekende of ongeldige velden geven 400", async () => {
  for (const bad of [
    { ...BODY, firstName: "" },
    { ...BODY, email: "geen-mail" },
    { ...BODY, phone: "abc" },
    { ...BODY, variant: "x" },
  ]) {
    const res = await post(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(calls.length, 0);
});

test("buitenlandse telefoonnummers worden geaccepteerd", async () => {
  const res = await post({ ...BODY, phone: "+49 170 1234567", submissionId: "6b1c0d1e-1111-4222-8333-444455557777" });
  assert.equal(res.status, 200);
  assert.equal((calls[0].body as { phone: string }).phone, "+491701234567");
});

test("dubbele inzending: succes zonder tweede mail", async () => {
  await post(BODY);
  calls = [];
  const res = await post(BODY);
  assert.equal(res.status, 200);
  assert.equal(to("https://api.mailersend.com").length, 0);
});
