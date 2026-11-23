/**
 * Draait de ECHTE webhook-kern (src/lib/access/pin-webhook-core.ts) met
 * fakes voor de dedupe-tabel, de profiel-lookup, ntfy en events. Bewijst de
 * signatuurcheck, de selectie op pincode, de dedupe op event-id, de
 * naamvolgorde, het vertraagde event en de no-op zonder configuratie.
 * Run: npm run test:access
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildPinPush,
  formatAmsterdam,
  handlePinWebhook,
  verifyAkilesSignature,
  type PinProfile,
  type PinUsedEvent,
  type PinWebhookDeps,
} from "../../src/lib/access/pin-webhook-core";

const SECRET = "f305d484fd10de285b00bb203659e863";
const DOOR_TOPIC = "tmc-deur-test";

const FENNA: PinProfile = { id: "11111111-1111-4111-8111-111111111111", first_name: "Fenna", last_name: "de Vries", is_test: false };
const TESTLID: PinProfile = { id: "22222222-2222-4222-8222-222222222222", first_name: "Test", last_name: "Lid", is_test: true };

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

interface Harness {
  deps: PinWebhookDeps;
  claimed: Map<string, { occurredAt: string | null; notified: boolean }>;
  pushes: Array<{ title: string; message: string; topic: string; test: boolean }>;
  events: PinUsedEvent[];
  logs: string[];
  lookups: { pin: string[]; member: string[] };
}

function harness(over: {
  env?: Partial<PinWebhookDeps["env"]>;
  byPin?: Record<string, PinProfile>;
  byMember?: Record<string, PinProfile>;
  notifyOk?: boolean;
  claimThrows?: boolean;
  lookupThrows?: boolean;
} = {}): Harness {
  const h: Harness = {
    claimed: new Map(),
    pushes: [],
    events: [],
    logs: [],
    lookups: { pin: [], member: [] },
    deps: undefined as unknown as PinWebhookDeps,
  };
  h.deps = {
    env: { webhookSecret: SECRET, doorTopic: DOOR_TOPIC, hasNtfyToken: true, ...over.env },
    db: {
      async claimEvent(eventId, occurredAt) {
        if (over.claimThrows) throw new Error("db weg");
        if (h.claimed.has(eventId)) return false;
        h.claimed.set(eventId, { occurredAt, notified: false });
        return true;
      },
      async markNotified(eventId) {
        const row = h.claimed.get(eventId);
        if (row) row.notified = true;
      },
      async findProfileByPinId(pinId) {
        h.lookups.pin.push(pinId);
        if (over.lookupThrows) throw new Error("db weg");
        return over.byPin?.[pinId] ?? null;
      },
      async findProfileByMemberId(memberId) {
        h.lookups.member.push(memberId);
        if (over.lookupThrows) throw new Error("db weg");
        return over.byMember?.[memberId] ?? null;
      },
    },
    async notify(title, message, opts) {
      h.pushes.push({ title, message, ...opts });
      return over.notifyOk ?? true;
    },
    async emit(event) {
      h.events.push(event);
    },
    log: {
      info: (message, meta) => h.logs.push(`${message} ${JSON.stringify(meta ?? {})}`),
      error: (message, meta) => h.logs.push(`${message} ${JSON.stringify(meta ?? {})}`),
    },
  };
  return h;
}

function pinEvent(over: Record<string, unknown> = {}, subject: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "evt_1",
    verb: "use",
    created_at: "2026-11-23T13:05:02.000Z",
    occurred_at: "2026-11-23T13:05:00.000Z",
    subject: {
      member_id: "mem_fenna",
      member_pin_id: "mp_fenna",
      access_method: "pin",
      ...subject,
    },
    object: { type: "gadget_action", gadget_id: "gad_1", gadget_action_id: "open" },
    subject_member: { name: "Fenna in Akiles", emails: [{ email: "fenna@example.com" }] },
    object_gadget: { name: "Voordeur" },
    ...over,
  });
}

async function deliver(h: Harness, body: string, signature: string | null = sign(body)) {
  return handlePinWebhook(h.deps, body, signature);
}

// ---------------------------------------------------------------------------
// Signatuur
// ---------------------------------------------------------------------------

test("geldige signatuur: push naar het deur-topic met naam, deur en tijd", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA } });
  const res = await deliver(h, pinEvent());
  assert.deepEqual(res, { status: 200, outcome: "notified" });
  assert.equal(h.pushes.length, 1);
  assert.deepEqual(h.pushes[0], {
    title: "Code gebruikt: Fenna de Vries",
    message: "Voordeur, ma 23 nov 14:05",
    topic: DOOR_TOPIC,
    test: false,
  });
  assert.equal(h.claimed.get("evt_1")?.notified, true);
});

test("ongeldige signatuur: 401, geen claim, geen push, niets van de payload in de log", async () => {
  const body = pinEvent();
  for (const bad of [
    sign(body, "ander-secret"),
    sign(body).slice(0, 40),
    "geen-hex",
    "",
    null,
    sign(body + " "),
  ]) {
    const h = harness({ byPin: { mp_fenna: FENNA } });
    const res = await deliver(h, body, bad);
    assert.deepEqual(res, { status: 401, outcome: "bad_signature" }, `signatuur ${String(bad)}`);
    assert.equal(h.claimed.size, 0);
    assert.equal(h.pushes.length, 0);
    assert.equal(h.events.length, 0);
    assert.doesNotMatch(h.logs.join("\n"), /evt_1|mem_fenna|mp_fenna|Fenna|Voordeur/);
  }
});

test("signatuur gaat over de ruwe body: hoofdletters in de hex mogen, een gewijzigde byte niet", () => {
  const body = pinEvent();
  assert.equal(verifyAkilesSignature(body, sign(body).toUpperCase(), SECRET), true);
  assert.equal(verifyAkilesSignature(body.replace("evt_1", "evt_2"), sign(body), SECRET), false);
});

// ---------------------------------------------------------------------------
// Selectie: alleen pincodes
// ---------------------------------------------------------------------------

test("andere toegangsmethodes: 200, geen rij, geen push, geen event", async () => {
  for (const method of ["online", "bluetooth", "mobile_nfc", "card", "google_wallet", null]) {
    const h = harness({ byPin: { mp_fenna: FENNA } });
    const res = await deliver(h, pinEvent({}, { access_method: method }));
    assert.deepEqual(res, { status: 200, outcome: "ignored" }, `methode ${String(method)}`);
    assert.equal(h.claimed.size, 0, "geen spoor in de dedupe-tabel");
    assert.equal(h.pushes.length, 0);
    assert.equal(h.events.length, 0);
    assert.equal(h.lookups.pin.length + h.lookups.member.length, 0);
  }
});

test("ander verb of objecttype met access_method pin: genegeerd zonder spoor", async () => {
  const cases = [
    pinEvent({ verb: "edit" }),
    pinEvent({ object: { type: "gadget_signal", gadget_id: "gad_1", gadget_signal_id: "pressed" } }),
    pinEvent({ object: { type: "gadget_state", gadget_id: "gad_1", gadget_state_id: "open" } }),
    pinEvent({ object: { type: "member_pin" }, verb: "reveal" }),
    pinEvent({ subject: null }),
    "[]",
    "geen json",
    "null",
  ];
  for (const body of cases) {
    const h = harness();
    const res = await deliver(h, body);
    assert.deepEqual(res, { status: 200, outcome: "ignored" }, body.slice(0, 60));
    assert.equal(h.claimed.size, 0);
    assert.equal(h.pushes.length, 0);
  }
});

test("pin-event zonder id: genegeerd, want dedupe is dan onmogelijk", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA } });
  const res = await deliver(h, pinEvent({ id: undefined }));
  assert.deepEqual(res, { status: 200, outcome: "ignored" });
  assert.equal(h.pushes.length, 0);
});

// ---------------------------------------------------------------------------
// Idempotentie
// ---------------------------------------------------------------------------

test("dubbel event (retry van Akiles): precies een push en een event", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA } });
  const body = pinEvent();
  const first = await deliver(h, body);
  const second = await deliver(h, body);
  const third = await deliver(h, body);
  assert.equal(first.outcome, "notified");
  assert.deepEqual(second, { status: 200, outcome: "duplicate" });
  assert.deepEqual(third, { status: 200, outcome: "duplicate" });
  assert.equal(h.pushes.length, 1);
  assert.equal(h.events.length, 1);
});

test("twee gelijktijdige leveringen van hetzelfde event: een push", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA } });
  const body = pinEvent();
  const results = await Promise.all([deliver(h, body), deliver(h, body)]);
  assert.deepEqual(results.map((r) => r.outcome).sort(), ["duplicate", "notified"]);
  assert.equal(h.pushes.length, 1);
});

test("ntfy weigert: 200 (webhook faalt niet), rij blijft notified false, retry pusht niet alsnog", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA }, notifyOk: false });
  const body = pinEvent();
  const res = await deliver(h, body);
  assert.deepEqual(res, { status: 200, outcome: "notify_failed" });
  assert.equal(h.claimed.get("evt_1")?.notified, false);
  assert.equal(h.events[0].payload.notified, false);
  assert.equal((await deliver(h, body)).outcome, "duplicate");
  assert.equal(h.pushes.length, 1);
});

test("claim faalt (database weg): 500 zodat Akiles herhaalt, geen push", async () => {
  const h = harness({ claimThrows: true });
  const res = await deliver(h, pinEvent());
  assert.deepEqual(res, { status: 500, outcome: "claim_failed" });
  assert.equal(h.pushes.length, 0);
  assert.equal(h.events.length, 0);
});

// ---------------------------------------------------------------------------
// Naam
// ---------------------------------------------------------------------------

test("naamvolgorde: PIN van het platform wint, daarna het lid, daarna Akiles, daarna onbekend", async () => {
  // 1. PIN bekend: member-lookup wordt niet eens gedaan.
  let h = harness({ byPin: { mp_fenna: FENNA }, byMember: { mem_fenna: TESTLID } });
  await deliver(h, pinEvent());
  assert.equal(h.pushes[0].title, "Code gebruikt: Fenna de Vries");
  assert.deepEqual(h.lookups.member, []);
  assert.equal(h.events[0].payload.name_source, "profile_pin");
  assert.equal(h.events[0].profileId, FENNA.id);

  // 2. PIN onbekend, lid bekend: code buiten het platform op een bekend lid.
  h = harness({ byMember: { mem_fenna: FENNA } });
  await deliver(h, pinEvent({}, { member_pin_id: "mp_vreemd" }));
  assert.equal(h.pushes[0].title, "Code gebruikt: Fenna de Vries");
  assert.match(h.pushes[0].message, /buiten het platform aangemaakt/);
  assert.equal(h.events[0].payload.name_source, "profile_member");

  // 3. Geen profiel: de membernaam uit de expand.
  h = harness();
  await deliver(h, pinEvent({}, { member_id: "mem_schoonmaak", member_pin_id: "mp_schoonmaak" }));
  assert.equal(h.pushes[0].title, "Code gebruikt: Fenna in Akiles");
  assert.match(h.pushes[0].message, /Niet gekoppeld aan een profiel/);
  assert.equal(h.events[0].payload.name_source, "akiles_member");
  assert.equal(h.events[0].profileId, null);
});

test("onbekende code: geen profiel en geen expand geeft toch een push", async () => {
  const h = harness();
  const res = await deliver(
    h,
    pinEvent({ subject_member: undefined, object_gadget: undefined }, { member_id: null, member_pin_id: null }),
  );
  assert.equal(res.outcome, "notified");
  assert.equal(h.pushes[0].title, "Code gebruikt: Onbekende code");
  assert.match(h.pushes[0].message, /^Deur, ma 23 nov 14:05\n/);
  assert.equal(h.events[0].payload.name_source, "unknown");
});

test("expand in geneste vorm (subject.member, object.gadget) wordt ook gelezen", async () => {
  const h = harness();
  await deliver(
    h,
    pinEvent({
      subject_member: undefined,
      object_gadget: undefined,
      subject: { member_id: "mem_x", member_pin_id: "mp_x", access_method: "pin", member: { name: "Schoonmaak" } },
      object: { type: "gadget_action", gadget_id: "gad_1", gadget: { name: "Achterdeur" } },
    }),
  );
  assert.equal(h.pushes[0].title, "Code gebruikt: Schoonmaak");
  assert.match(h.pushes[0].message, /^Achterdeur, /);
});

test("profiel-lookup faalt: de push gaat door met de Akiles-naam", async () => {
  const h = harness({ lookupThrows: true });
  const res = await deliver(h, pinEvent());
  assert.equal(res.outcome, "notified");
  assert.equal(h.pushes[0].title, "Code gebruikt: Fenna in Akiles");
});

test("testprofiel: de testvlag gaat mee naar ntfy (TEST-prefix)", async () => {
  const h = harness({ byPin: { mp_fenna: TESTLID } });
  await deliver(h, pinEvent());
  assert.equal(h.pushes[0].test, true);
  assert.ok(!h.pushes[0].title.startsWith("TEST: "), "het prefix wordt alleen in sendNotification gezet");
});

test("geen e-mail, telefoon of pincode in de push of het event; geen naam in het event", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA } });
  await deliver(
    h,
    pinEvent({
      subject_member: { name: "Fenna", emails: [{ email: "fenna@example.com" }], phone: "+31612345678" },
      pin: "123456",
    }),
  );
  const push = JSON.stringify(h.pushes[0]);
  assert.doesNotMatch(push, /fenna@example\.com|\+316|123456/);
  const event = JSON.stringify(h.events[0]);
  assert.doesNotMatch(event, /Fenna|fenna@example\.com|\+316|123456/);
  assert.deepEqual(Object.keys(h.events[0].payload).sort(), [
    "akiles_event_id",
    "delayed",
    "gadget_id",
    "name_source",
    "notified",
    "occurred_at",
  ]);
});

// ---------------------------------------------------------------------------
// Tijd
// ---------------------------------------------------------------------------

test("vertraagd event: tijd van occurred_at, niet van de ontvangst, plus 'vertraagd gemeld'", async () => {
  const h = harness({ byPin: { mp_fenna: FENNA } });
  await deliver(
    h,
    pinEvent({ occurred_at: "2026-11-23T06:10:00.000Z", created_at: "2026-11-23T09:40:00.000Z" }),
  );
  assert.match(h.pushes[0].message, /^Voordeur, ma 23 nov 07:10\n/);
  assert.match(h.pushes[0].message, /Vertraagd gemeld/);
  assert.equal(h.events[0].payload.delayed, true);
  assert.equal(h.events[0].payload.occurred_at, "2026-11-23T06:10:00.000Z");
  assert.equal(h.claimed.get("evt_1")?.occurredAt, "2026-11-23T06:10:00.000Z");
});

test("grens van vijf minuten: precies vijf is niet vertraagd, een seconde meer wel", () => {
  const at = (created: string) =>
    buildPinPush(
      { occurred_at: "2026-11-23T13:00:00.000Z", created_at: created },
      { name: "X", source: "profile_pin" },
    ).delayed;
  assert.equal(at("2026-11-23T13:05:00.000Z"), false);
  assert.equal(at("2026-11-23T13:05:01.000Z"), true);
  // Klokverschil de andere kant op is geen vertraging.
  assert.equal(at("2026-11-23T12:00:00.000Z"), false);
});

test("Europe/Amsterdam: wintertijd en zomertijd", () => {
  assert.equal(formatAmsterdam(new Date("2026-11-23T13:05:00Z")), "ma 23 nov 14:05");
  assert.equal(formatAmsterdam(new Date("2026-07-01T22:30:00Z")), "do 2 jul 00:30");
});

test("ontbrekende occurred_at valt terug op created_at; geen van beide geeft 'tijd onbekend'", () => {
  const src = { name: "X", source: "profile_pin" as const };
  assert.equal(
    buildPinPush({ created_at: "2026-11-23T13:05:00.000Z", object_gadget: { name: "Voordeur" } }, src).message,
    "Voordeur, ma 23 nov 14:05",
  );
  assert.equal(buildPinPush({ occurred_at: "geen datum" }, src).message, "Deur, tijd onbekend");
});

// ---------------------------------------------------------------------------
// No-op zonder configuratie
// ---------------------------------------------------------------------------

test("zonder secret, deur-topic of ntfy-token: 200, geen signatuurcheck, geen claim, geen push", async () => {
  const body = pinEvent();
  for (const env of [
    { webhookSecret: null },
    { doorTopic: null },
    { hasNtfyToken: false },
    { webhookSecret: "" },
    { doorTopic: "" },
  ]) {
    const h = harness({ env, byPin: { mp_fenna: FENNA } });
    // Ook met een onzin-signatuur 200: de route doet dan helemaal niets.
    for (const sig of [sign(body), "onzin", null]) {
      const res = await deliver(h, body, sig);
      assert.deepEqual(res, { status: 200, outcome: "not_configured" }, JSON.stringify(env));
    }
    assert.equal(h.claimed.size, 0);
    assert.equal(h.pushes.length, 0);
    assert.equal(h.events.length, 0);
    assert.equal(h.lookups.pin.length, 0);
  }
});
