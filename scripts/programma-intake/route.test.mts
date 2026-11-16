/**
 * Route-test voor POST /api/leads/programma-intake met een gemockte fetch:
 * Supabase (REST), MailerLite, ntfy en MailerSend. Controleert de volgorde
 * (eerst opslaan), de validatie, de idempotentie, dat een storing in
 * MailerLite, ntfy of de mail de aanvraag niet laat falen, en de inhoud van
 * de mail (ontvanger, reply-to, onderwerp). De echte database wordt door
 * scripts/test-programma-intakes-db.sh gedekt.
 * Run: node --import tsx --import ./scripts/programma-intake/hooks.mjs --test scripts/programma-intake/route.test.mts
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.MAILERLITE_API_KEY = "ml-key";
process.env.MAILERSEND_API_KEY = "ms-key";
process.env.MAILERSEND_FROM_EMAIL = "noreply@themovementclub.nl";
process.env.PROGRAMMA_INTAKE_REDIRECT_EMAIL = "test@example.com";
delete process.env.VERCEL_ENV;

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
let calls: Call[] = [];
let seenKeys = new Set<string>();
let mode = { insertFails: false, mailerliteThrows: false, ntfyFails: false, mailerSendFails: false };

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  let body: unknown = rawBody;
  if (typeof rawBody === "string") {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = rawBody;
    }
  }
  const call: Call = { url, method: init?.method ?? "GET", body, headers: headersOf(init) };
  calls.push(call);

  if (url.startsWith("http://supabase.test/rest/v1/programma_intakes")) {
    if (mode.insertFails) return Response.json({ code: "XX000", message: "boom", details: "", hint: "" }, { status: 500 });
    const key = (body as { idempotency_key: string }).idempotency_key;
    if (seenKeys.has(key)) {
      return Response.json({ code: "23505", message: "duplicate key", details: "", hint: "" }, { status: 409 });
    }
    seenKeys.add(key);
    return Response.json({ id: "11111111-2222-4333-8444-555555555555", created_at: "2026-11-15T13:32:00Z" }, { status: 201 });
  }
  if (url.startsWith("http://supabase.test/rest/v1/lead_attributions")) return new Response(null, { status: 201 });
  if (url.startsWith("https://connect.mailerlite.com")) {
    if (mode.mailerliteThrows) throw new Error("netwerk weg");
    return Response.json({}, { status: 200 });
  }
  if (url.startsWith("https://ntfy.sh")) return new Response("ok", { status: mode.ntfyFails ? 500 : 200 });
  if (url.includes("mailersend.com")) {
    return new Response(null, { status: mode.mailerSendFails ? 500 : 202 });
  }
  throw new Error(`onverwachte fetch: ${url}`);
}) as typeof fetch;

const { POST } = await import("../../src/app/api/leads/programma-intake/route");

const BODY = {
  firstName: "Noor",
  lastName: "de Vries",
  email: "noor@example.com",
  phone: "06 12345678",
  day: "dinsdag",
  message: "Hallo\nMarlon",
  signupPath: "/12-weken-programma/intake",
  submissionId: "6b1c0d1e-1111-4222-8333-444455556666",
  attribution: {
    gclid: "abc123",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "programma",
    landing_path: "/12-weken-programma?gclid=abc123",
    analytics_consent: "denied",
  },
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/leads/programma-intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const to = (prefix: string) => calls.filter((c) => c.url.startsWith(prefix));

// Console-ruis van verwachte fouten onderdrukken, maar bijhouden.
let errors: unknown[][] = [];
console.error = (...args: unknown[]) => void errors.push(args);
console.warn = () => {};

beforeEach(() => {
  calls = [];
  seenKeys = new Set();
  errors = [];
  mode = { insertFails: false, mailerliteThrows: false, ntfyFails: false, mailerSendFails: false };
});

test("geslaagde inzending: eerst opslaan, dan alle vier de kanalen", async () => {
  const res = await post(BODY);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });

  assert.ok(calls[0].url.startsWith("http://supabase.test/rest/v1/programma_intakes"), "opslaan komt eerst");
  const row = calls[0].body as Record<string, unknown>;
  assert.equal(row.first_name, "Noor");
  assert.equal(row.phone, "+31612345678");
  assert.equal(row.preferred_day, "dinsdag");
  assert.equal(row.gclid, "abc123");
  assert.equal(row.utm_campaign, "programma");
  assert.equal(row.landing_path, "/12-weken-programma?gclid=abc123");
  assert.equal(row.idempotency_key, BODY.submissionId);

  const attr = to("http://supabase.test/rest/v1/lead_attributions");
  assert.equal(attr.length, 1);
  const attrRow = (Array.isArray(attr[0].body) ? attr[0].body[0] : attr[0].body) as Record<string, unknown>;
  assert.equal(attrRow.source_type, "programma_intake");
  assert.equal(attrRow.source_id, "11111111-2222-4333-8444-555555555555", "source_id is het id van de intake-rij");

  const ml = to("https://connect.mailerlite.com");
  assert.equal(ml.length, 1);
  assert.equal((ml[0].body as { email: string }).email, "noor@example.com");

  const ntfy = to("https://ntfy.sh");
  assert.equal(ntfy.length, 1);
  assert.equal(ntfy[0].body, "Nieuwe intake-aanvraag. Gegevens staan in de mail aan Marlon en in het admin-dashboard.");
  assert.doesNotMatch(String(ntfy[0].body), /Noor|noor@|0612|\+31/, "geen persoonsgegevens op het publieke topic");

  const ms = to("https://api.mailersend.com");
  assert.equal(ms.length, 1);
  const mail = ms[0].body as {
    to: { email: string }[];
    subject: string;
    reply_to?: { email: string } | { email: string }[];
    html: string;
  };
  assert.equal(mail.to[0].email, "test@example.com", "buiten productie naar het omleidingsadres");
  assert.equal(mail.subject, "[TEST] Nieuwe intake-aanvraag 12 weken: Noor de Vries");
  const reply = Array.isArray(mail.reply_to) ? mail.reply_to[0] : mail.reply_to;
  assert.equal(reply?.email, "noor@example.com");
  assert.match(mail.html, /tel:\+31612345678/);
  assert.match(mail.html, /mailto:noor@example\.com/);
  assert.equal(errors.length, 0, JSON.stringify(errors));
});

test("productie: mail naar Marlon, zonder testprefix", async () => {
  process.env.VERCEL_ENV = "production";
  try {
    await post(BODY);
  } finally {
    delete process.env.VERCEL_ENV;
  }
  const mail = to("https://api.mailersend.com")[0].body as { to: { email: string }[]; subject: string };
  assert.equal(mail.to[0].email, "marlon@themovementclub.nl");
  assert.equal(mail.subject, "Nieuwe intake-aanvraag 12 weken: Noor de Vries");
});

test("dubbele inzending: succes zonder tweede mail, MailerLite, ntfy of attributie", async () => {
  await post(BODY);
  calls = [];
  const res = await post(BODY);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, "alleen de botsende insert");
  assert.equal(to("https://api.mailersend.com").length, 0);
  assert.equal(to("https://connect.mailerlite.com").length, 0);
  assert.equal(to("https://ntfy.sh").length, 0);
});

test("opslaan mislukt: 500 en geen enkel ander kanaal", async () => {
  mode.insertFails = true;
  const res = await post(BODY);
  assert.equal(res.status, 500);
  assert.equal(calls.length, 1);
});

test("MailerLite, ntfy en mail kapot: de bezoeker krijgt toch succes, fouten gelogd met intake-id", async () => {
  mode = { insertFails: false, mailerliteThrows: true, ntfyFails: true, mailerSendFails: true };
  const res = await post(BODY);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
  assert.equal(to("https://api.mailersend.com").length, 1, "de mail is wel geprobeerd");
  const flat = JSON.stringify(errors.map((e) => e.map(String)));
  assert.match(flat, /mailerlite failed/);
  assert.match(flat, /11111111-2222-4333-8444-555555555555/);
});

test("zonder attributie: geen lead_attributions-rij, wel de rij zelf", async () => {
  const noAttr: Record<string, unknown> = { ...BODY };
  delete noAttr.attribution;
  const res = await post(noAttr);
  assert.equal(res.status, 200);
  assert.equal(to("http://supabase.test/rest/v1/lead_attributions").length, 0);
  const row = calls[0].body as Record<string, unknown>;
  assert.equal(row.gclid, null);
  assert.equal(row.landing_path, null);
});

test("validatie: ontbrekend of ongeldig veld geeft 400 en raakt niets aan", async () => {
  for (const patch of [{ lastName: "" }, { phone: "abc" }, { day: "zondag" }, { email: "x" }]) {
    calls = [];
    const res = await post({ ...BODY, ...patch });
    assert.equal(res.status, 400, JSON.stringify(patch));
    assert.equal(calls.length, 0);
  }
  const bad = await POST(new Request("http://localhost/x", { method: "POST", body: "geen json" }));
  assert.equal(bad.status, 400);
});
