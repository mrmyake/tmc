/**
 * Pure kern van de intake 12 weken programma: validatie en mailhelpers.
 * Run: node --import ./scripts/ts-loader.mjs --test scripts/programma-intake/core.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgrammaIntake } from "../../src/lib/programma-intake/validate";
import {
  buildSourceLines,
  buildSubject,
  decideRecipient,
  formatSubmittedAt,
} from "../../src/lib/programma-intake/mail";

const VALID = {
  firstName: "Noor",
  lastName: "de Vries",
  email: "Noor@Example.com",
  phone: "06 12345678",
  day: "Dinsdag",
  message: "Regel een\nregel twee",
  signupPath: "/12-weken-programma/intake",
  submissionId: "6b1c0d1e-1111-4222-8333-444455556666",
};

test("geldige inzending: genormaliseerd", () => {
  const r = parseProgrammaIntake(VALID);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.email, "noor@example.com");
  assert.equal(r.value.phone, "+31612345678");
  assert.equal(r.value.day, "dinsdag");
  assert.equal(r.value.message, "Regel een\nregel twee");
  assert.equal(r.value.submissionId, VALID.submissionId);
});

test("buitenlands nummer blijft behouden", () => {
  const r = parseProgrammaIntake({ ...VALID, phone: "+32 470 12 34 56" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.phone, "+32470123456");
});

for (const key of ["firstName", "lastName", "email", "phone", "day"] as const) {
  test(`ontbrekend ${key} geeft missing`, () => {
    const r = parseProgrammaIntake({ ...VALID, [key]: "  " });
    assert.deepEqual(r.ok ? null : [r.field, r.reason], [key, "missing"]);
  });
}

test("ongeldig e-mail, telefoon en dag geven invalid", () => {
  for (const [field, value] of [
    ["email", "geen-adres"],
    ["phone", "123"],
    ["day", "zondag"],
  ] as const) {
    const r = parseProgrammaIntake({ ...VALID, [field]: value });
    assert.deepEqual(r.ok ? null : [r.field, r.reason], [field, "invalid"], field);
  }
});

test("telefoon met toevoeging wordt afgewezen", () => {
  const r = parseProgrammaIntake({ ...VALID, phone: "06 12345678 ext. 5" });
  assert.equal(r.ok, false);
});

test("bericht optioneel, te lang wordt afgewezen, ongeldige metadata valt weg", () => {
  const a = parseProgrammaIntake({ ...VALID, message: "", signupPath: "https://evil.example", submissionId: "x" });
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.value.message, null);
    assert.equal(a.value.signupPath, null);
    assert.equal(a.value.submissionId, null);
  }
  const b = parseProgrammaIntake({ ...VALID, message: "x".repeat(2001) });
  assert.equal(b.ok, false);
});

test("geen object geeft invalid", () => {
  assert.equal(parseProgrammaIntake(null).ok, false);
  assert.equal(parseProgrammaIntake("tekst").ok, false);
});

test("ontvanger: productie naar Marlon, elders alleen het omleidingsadres", () => {
  assert.deepEqual(decideRecipient({ vercelEnv: "production", redirectEmail: "x@example.com" }), {
    to: "marlon@themovementclub.nl",
    redirected: false,
  });
  assert.deepEqual(decideRecipient({ vercelEnv: "preview", redirectEmail: " test@example.com " }), {
    to: "test@example.com",
    redirected: true,
  });
  assert.deepEqual(decideRecipient({ vercelEnv: undefined, redirectEmail: "test@example.com" }), {
    to: "test@example.com",
    redirected: true,
  });
});

test("ontvanger: buiten productie zonder geldig omleidingsadres geen mail", () => {
  assert.equal(decideRecipient({ vercelEnv: "preview", redirectEmail: undefined }).to, null);
  assert.equal(decideRecipient({ vercelEnv: "preview", redirectEmail: "kapot" }).to, null);
});

test("onderwerp, met en zonder testprefix", () => {
  assert.equal(buildSubject("Noor", "de Vries", false), "Nieuwe intake-aanvraag 12 weken: Noor de Vries");
  assert.equal(buildSubject("Noor", "de Vries", true), "[TEST] Nieuwe intake-aanvraag 12 weken: Noor de Vries");
});

test("tijdstip in Europe/Amsterdam (winter en zomer)", () => {
  assert.equal(formatSubmittedAt(new Date("2026-11-15T13:32:00Z")), "zondag 15 november 2026 om 14:32");
  assert.equal(formatSubmittedAt(new Date("2026-07-01T10:05:00Z")), "woensdag 1 juli 2026 om 12:05");
});

test("bronregels: leeg zonder parameters, anders utm, klik-id en landingspad", () => {
  assert.deepEqual(buildSourceLines(undefined), []);
  assert.deepEqual(buildSourceLines({}), []);
  const lines = buildSourceLines({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "programma",
    gclid: "abc123",
    landing_path: "/12-weken-programma?gclid=abc123",
  });
  assert.deepEqual(lines, [
    "Campagne: google / cpc / programma",
    "Google Ads klik-id: abc123",
    "Landingspad: /12-weken-programma?gclid=abc123",
  ]);
});

test("geen em dashes in de bronnen van deze feature", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of [
    "src/lib/programma-intake/validate.ts",
    "src/lib/programma-intake/mail.ts",
    "src/lib/programma-intake/notify.ts",
    "src/lib/programma-intake/status.ts",
    "src/emails/programma_intake.tsx",
    "src/app/api/leads/programma-intake/route.ts",
    "supabase/migrations/20261115120000_programma_intakes.sql",
  ]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /\u2014/, f);
  }
});
