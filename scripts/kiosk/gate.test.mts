/**
 * De kiosk-gate (src/lib/kiosk/gate-core.ts) en het ontgrendelen
 * (src/lib/kiosk/unlock-core.ts) in alle combinaties, zonder next/headers en
 * zonder database: staff-login, geen apparaat, ingetrokken apparaat,
 * verlopen sessie, verkeerde pin_version, alles geldig; verlengen alleen bij
 * een door de gebruiker gestarte actie; blokkade na vijf foute pogingen.
 * Run: npm run test:kiosk
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EmitEventInput } from "../../src/lib/events/emit";
import {
  KIOSK_DEVICE_COOKIE,
  KIOSK_IDLE_MS,
  KIOSK_SESSION_COOKIE,
} from "../../src/lib/kiosk/constants";
import {
  asStaffGate,
  requireKioskActorCore,
  resolveDevice,
  type KioskGateDeps,
  type StaffLoginResult,
  type StaffPinInfo,
} from "../../src/lib/kiosk/gate-core";
import {
  newDevicePayload,
  newSessionPayload,
  signToken,
  verifyToken,
} from "../../src/lib/kiosk/session";
import { unlockKioskCore, type UnlockDeps } from "../../src/lib/kiosk/unlock-core";

const SECRET = "test-secret-die-lang-genoeg-is-0123456789abcdef";
const T0 = Date.UTC(2026, 8, 27, 10, 0, 0);
const NO_LOGIN: StaffLoginResult = { ok: false, reason: "unauthenticated", message: "Je bent uitgelogd." };
const STAFF: StaffPinInfo = { pinVersion: 2, pinActive: true, isStaff: true, actorType: "trainer" };

interface World {
  now: number;
  secret: string | null;
  login: StaffLoginResult;
  cookies: Map<string, string>;
  devices: Map<string, { revoked: boolean }>;
  staff: Map<string, StaffPinInfo>;
  touched: string[];
}

function world(over: Partial<World> = {}): World {
  return {
    now: T0,
    secret: SECRET,
    login: NO_LOGIN,
    cookies: new Map(),
    devices: new Map([["dev-1", { revoked: false }]]),
    staff: new Map([["p-1", STAFF]]),
    touched: [],
    ...over,
  };
}

function deps(w: World): KioskGateDeps {
  return {
    now: () => w.now,
    secret: w.secret,
    staffLogin: async () => w.login,
    readCookie: (name) => w.cookies.get(name) ?? null,
    writeSessionCookie: (value) => {
      if (value === null) w.cookies.delete(KIOSK_SESSION_COOKIE);
      else w.cookies.set(KIOSK_SESSION_COOKIE, value);
    },
    device: async (id) => w.devices.get(id) ?? null,
    staff: async (id) => w.staff.get(id) ?? null,
    touchDevice: async (id) => {
      w.touched.push(id);
    },
  };
}

function withDevice(w: World, deviceId = "dev-1") {
  w.cookies.set(KIOSK_DEVICE_COOKIE, signToken<"device">(newDevicePayload(deviceId, T0), SECRET));
  return w;
}

function withSession(w: World, over: Partial<{ pinVersion: number; deviceId: string; at: number; profileId: string }> = {}) {
  const p = newSessionPayload(
    { staffProfileId: over.profileId ?? "p-1", pinVersion: over.pinVersion ?? 2, deviceId: over.deviceId ?? "dev-1" },
    over.at ?? T0,
  );
  w.cookies.set(KIOSK_SESSION_COOKIE, signToken<"session">(p, SECRET));
  return w;
}

// ---------------------------------------------------------------------------
// Gate: alle combinaties
// ---------------------------------------------------------------------------

test("staff-login gaat altijd voor: geen apparaat nodig, geen cookie geschreven", async () => {
  const w = world({ login: { ok: true, userId: "admin-1", actorType: "admin" } });
  const res = await requireKioskActorCore(deps(w));
  assert.deepEqual(res, { ok: true, userId: "admin-1", actorType: "admin", via: "login", deviceId: null });
  assert.equal(w.cookies.size, 0);
  assert.deepEqual(w.touched, []);
});

test("geen login en geen apparaat-cookie: device_not_paired", async () => {
  const res = await requireKioskActorCore(deps(world()));
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "device_not_paired");
});

test("zonder secret: not_configured, ook met een op het oog geldig cookie", async () => {
  const w = withSession(withDevice(world()));
  w.secret = null;
  const res = await requireKioskActorCore(deps(w));
  assert.equal(res.ok === false && res.reason, "not_configured");
});

test("apparaat onbekend of ingetrokken: device_not_paired respectievelijk device_revoked", async () => {
  const unknown = withSession(withDevice(world(), "dev-9"), { deviceId: "dev-9" });
  assert.equal((await requireKioskActorCore(deps(unknown))).ok === false && (await requireKioskActorCore(deps(unknown))).ok, false);
  const r1 = await requireKioskActorCore(deps(unknown));
  assert.equal(r1.ok === false && r1.reason, "device_not_paired");

  const revoked = withSession(withDevice(world({ devices: new Map([["dev-1", { revoked: true }]]) })));
  const r2 = await requireKioskActorCore(deps(revoked));
  assert.equal(r2.ok === false && r2.reason, "device_revoked", "ingetrokken werkt direct, ook met geldige sessie");
});

test("apparaat zonder sessie, of met een geknoeide sessie: session_expired", async () => {
  const none = withDevice(world());
  const r1 = await requireKioskActorCore(deps(none));
  assert.equal(r1.ok === false && r1.reason, "session_expired");

  const bad = withDevice(world());
  bad.cookies.set(KIOSK_SESSION_COOKIE, "abc.def");
  const r2 = await requireKioskActorCore(deps(bad));
  assert.equal(r2.ok === false && r2.reason, "session_expired");
});

test("sessie van een ander apparaat wordt geweigerd en gewist", async () => {
  const w = withSession(withDevice(world()), { deviceId: "dev-2" });
  const res = await requireKioskActorCore(deps(w));
  assert.equal(res.ok === false && res.reason, "session_expired");
  assert.equal(w.cookies.has(KIOSK_SESSION_COOKIE), false);
});

test("verlopen sessie (idle) wordt geweigerd en gewist", async () => {
  const w = withSession(withDevice(world()), { at: T0 - KIOSK_IDLE_MS - 1 });
  const res = await requireKioskActorCore(deps(w));
  assert.equal(res.ok === false && res.reason, "session_expired");
  assert.equal(w.cookies.has(KIOSK_SESSION_COOKIE), false);
});

test("verkeerde pin_version, inactieve PIN of geen staf meer: pin_changed en cookie weg", async () => {
  for (const [label, staff] of [
    ["oudere versie", { ...STAFF, pinVersion: 3 }],
    ["pin verwijderd", { ...STAFF, pinActive: false }],
    ["geen staf meer", { ...STAFF, isStaff: false }],
    ["profiel weg", undefined],
  ] as Array<[string, StaffPinInfo | undefined]>) {
    const w = withSession(withDevice(world({ staff: staff ? new Map([["p-1", staff]]) : new Map() })));
    const res = await requireKioskActorCore(deps(w));
    assert.equal(res.ok === false && res.reason, "pin_changed", label);
    assert.equal(w.cookies.has(KIOSK_SESSION_COOKIE), false, label);
  }
});

test("alles geldig: actor uit de sessie, apparaat aangeraakt, cookie verlengd", async () => {
  const w = withSession(withDevice(world()), { at: T0 - 5 * 60_000 });
  w.now = T0;
  const res = await requireKioskActorCore(deps(w));
  assert.deepEqual(res, { ok: true, userId: "p-1", actorType: "trainer", via: "kiosk", deviceId: "dev-1" });
  assert.deepEqual(w.touched, ["dev-1"]);
  const after = verifyToken("session", w.cookies.get(KIOSK_SESSION_COOKIE), SECRET);
  assert.equal(after?.last, T0, "last is bijgewerkt");
  assert.equal(after?.iat, T0 - 5 * 60_000, "iat blijft");
});

test("extend: false laat het cookie ongemoeid", async () => {
  const w = withSession(withDevice(world()), { at: T0 - 5 * 60_000 });
  w.now = T0;
  const before = w.cookies.get(KIOSK_SESSION_COOKIE);
  const res = await requireKioskActorCore(deps(w), { extend: false });
  assert.equal(res.ok, true);
  assert.equal(w.cookies.get(KIOSK_SESSION_COOKIE), before);
});

test("alleen achtergrondverversingen verlengen niet: na tien minuten verloopt de sessie toch", async () => {
  const w = withSession(withDevice(world()));
  // Elke minuut een peek (extend: false), negen keer: allemaal ok.
  for (let i = 1; i <= 9; i++) {
    w.now = T0 + i * 60_000;
    const res = await requireKioskActorCore(deps(w), { extend: false });
    assert.equal(res.ok, true, `minuut ${i}`);
  }
  w.now = T0 + KIOSK_IDLE_MS + 1;
  const res = await requireKioskActorCore(deps(w), { extend: false });
  assert.equal(res.ok === false && res.reason, "session_expired");
});

test("een door de gebruiker gestarte actie halverwege verlengt wel", async () => {
  const w = withSession(withDevice(world()));
  w.now = T0 + 9 * 60_000;
  assert.equal((await requireKioskActorCore(deps(w), { extend: true })).ok, true);
  w.now = T0 + 9 * 60_000 + KIOSK_IDLE_MS;
  const res = await requireKioskActorCore(deps(w), { extend: false });
  assert.equal(res.ok, true, "verlengd vanaf de actie, dus nog geldig");
});

test("asStaffGate: vorm van requireTrainerOrAdmin, kiosk-redenen worden unauthenticated", () => {
  assert.deepEqual(asStaffGate({ ok: true, userId: "p-1", actorType: "trainer", via: "kiosk", deviceId: "d" }), {
    ok: true,
    userId: "p-1",
    actorType: "trainer",
  });
  const r = asStaffGate({ ok: false, reason: "session_expired", message: "x" });
  assert.equal(r.ok === false && r.reason, "unauthenticated");
  const f = asStaffGate({ ok: false, reason: "forbidden", message: "x" });
  assert.equal(f.ok === false && f.reason, "forbidden");
});

test("resolveDevice: alleen het apparaat, voor het slotscherm", async () => {
  assert.deepEqual(await resolveDevice(deps(withDevice(world()))), { ok: true, deviceId: "dev-1" });
  assert.deepEqual(await resolveDevice(deps(world())), { ok: false, reason: "device_not_paired" });
});

// ---------------------------------------------------------------------------
// Ontgrendelen en de blokkade na vijf pogingen
// ---------------------------------------------------------------------------

function unlockDeps(w: World, opts: { correctPin: string; failBefore?: number }) {
  const attempts = new Map<string, number>();
  const events: EmitEventInput[] = [];
  const calls = { verify: 0, cleared: 0 };
  const d: UnlockDeps = {
    ...deps(w),
    registerAttempt: async (profileId, deviceId) => {
      // Nabootsing van register_kiosk_pin_attempt: 5 fouten geeft 15 min blokkade.
      const key = `${profileId}:${deviceId}`;
      const count = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, count);
      if (count > 5) return { allowed: false, retry_after_seconds: 900 };
      return { allowed: true, fail_count: count };
    },
    verifyPin: async (_profileId, pin) => {
      calls.verify += 1;
      return pin === opts.correctPin ? { ok: true, pin_version: 2 } : { ok: false };
    },
    clearAttempts: async (profileId, deviceId) => {
      calls.cleared += 1;
      attempts.delete(`${profileId}:${deviceId}`);
    },
    emit: async (e) => {
      events.push(e);
      return true;
    },
  };
  return { d, events, calls, attempts };
}

test("ontgrendelen: goede PIN geeft een sessie-cookie, wist de teller en logt kiosk.unlocked", async () => {
  const w = withDevice(world());
  const { d, events, calls } = unlockDeps(w, { correctPin: "1234" });
  const res = await unlockKioskCore(d, { profileId: "p-1", pin: "1234" });
  assert.deepEqual(res, { ok: true, userId: "p-1", actorType: "trainer" });
  const session = verifyToken("session", w.cookies.get(KIOSK_SESSION_COOKIE), SECRET);
  assert.equal(session?.staff_profile_id, "p-1");
  assert.equal(session?.pin_version, 2);
  assert.equal(session?.device_id, "dev-1");
  assert.equal(calls.cleared, 1);
  assert.equal(events.at(-1)?.type, "kiosk.unlocked");
  assert.equal(events.at(-1)?.actorId, "p-1");
});

test("ontgrendelen: verkeerde vorm kost geen poging en geen verify", async () => {
  const w = withDevice(world());
  const { d, calls, attempts } = unlockDeps(w, { correctPin: "1234" });
  for (const pin of ["12", "12345", "abcd", ""]) {
    const res = await unlockKioskCore(d, { profileId: "p-1", pin });
    assert.equal(res.ok === false && res.reason, "invalid_pin", pin);
  }
  assert.equal(calls.verify, 0);
  assert.equal(attempts.size, 0);
});

test("ontgrendelen zonder apparaat: device_not_paired, geen poging geregistreerd", async () => {
  const { d, attempts } = unlockDeps(world(), { correctPin: "1234" });
  const res = await unlockKioskCore(d, { profileId: "p-1", pin: "1234" });
  assert.equal(res.ok === false && res.reason, "device_not_paired");
  assert.equal(attempts.size, 0);
});

test("blokkade: na vijf foute pogingen is de zesde geblokkeerd, ook met de goede PIN", async () => {
  const w = withDevice(world());
  const { d, events, calls } = unlockDeps(w, { correctPin: "1234" });
  for (let i = 1; i <= 5; i++) {
    const res = await unlockKioskCore(d, { profileId: "p-1", pin: "0000" });
    assert.equal(res.ok === false && res.reason, "invalid_pin", `poging ${i}`);
  }
  assert.equal(events.filter((e) => e.type === "kiosk.unlock_failed").length, 5);
  const verifiesBefore = calls.verify;
  const blocked = await unlockKioskCore(d, { profileId: "p-1", pin: "1234" });
  assert.equal(blocked.ok === false && blocked.reason, "locked");
  assert.equal(blocked.ok === false && blocked.retryAfterSeconds, 900);
  assert.match(blocked.ok === false ? blocked.message : "", /15 minuten/);
  assert.equal(calls.verify, verifiesBefore, "geblokkeerd: geen bcrypt-verify meer");
  assert.equal(w.cookies.has(KIOSK_SESSION_COOKIE), false);
});

test("blokkade is per staflid per apparaat: een ander staflid op hetzelfde apparaat kan wel", async () => {
  const w = withDevice(world({ staff: new Map([["p-1", STAFF], ["p-2", { ...STAFF, actorType: "admin" }]]) }));
  const { d } = unlockDeps(w, { correctPin: "1234" });
  for (let i = 1; i <= 6; i++) await unlockKioskCore(d, { profileId: "p-1", pin: "0000" });
  const other = await unlockKioskCore(d, { profileId: "p-2", pin: "1234" });
  assert.equal(other.ok, true);
});

test("ontgrendelen: teller-RPC faalt is fail closed (db_error), geen verify", async () => {
  const w = withDevice(world());
  const { d, calls } = unlockDeps(w, { correctPin: "1234" });
  d.registerAttempt = async () => null;
  const res = await unlockKioskCore(d, { profileId: "p-1", pin: "1234" });
  assert.equal(res.ok === false && res.reason, "db_error");
  assert.equal(calls.verify, 0);
});
