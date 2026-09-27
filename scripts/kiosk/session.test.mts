/**
 * Tekenen en verifiëren van de kiosk-cookies (src/lib/kiosk/session.ts):
 * rondreis, geknoeide payload en handtekening, verkeerd kind, verkeerd of
 * ontbrekend secret, verlopen op inactiviteit en op de absolute grens.
 * Run: npm run test:kiosk
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newDevicePayload,
  newSessionPayload,
  sessionFreshness,
  signToken,
  touchSession,
  verifyToken,
} from "../../src/lib/kiosk/session";
import { KIOSK_ABSOLUTE_MS, KIOSK_IDLE_MS } from "../../src/lib/kiosk/constants";

const SECRET = "test-secret-die-lang-genoeg-is-0123456789abcdef";
const T0 = Date.UTC(2026, 8, 27, 10, 0, 0);

test("apparaat-token: rondreis, en elke afwijking geeft null", () => {
  const payload = newDevicePayload("dev-1", T0);
  const token = signToken<"device">(payload, SECRET);
  assert.deepEqual(verifyToken("device", token, SECRET), payload);

  assert.equal(verifyToken("device", token, "ander-secret-dat-ook-lang-genoeg-is-000"), null, "verkeerd secret");
  assert.equal(verifyToken("device", token, null), null, "geen secret");
  assert.equal(verifyToken("device", null, SECRET), null, "geen token");
  assert.equal(verifyToken("device", "", SECRET), null, "leeg token");
  assert.equal(verifyToken("device", "geen-punt", SECRET), null, "geen scheiding");
  assert.equal(verifyToken("session", token, SECRET), null, "apparaat-token als sessie gelezen");

  const [body, sig] = token.split(".");
  const other = Buffer.from(JSON.stringify({ ...payload, device_id: "dev-2" })).toString("base64url");
  assert.equal(verifyToken("device", `${other}.${sig}`, SECRET), null, "geknoeide payload");
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifyToken("device", `${body}.${flipped}`, SECRET), null, "geknoeide handtekening");
});

test("sessie-token: rondreis en veldcontrole", () => {
  const payload = newSessionPayload({ staffProfileId: "p-1", pinVersion: 3, deviceId: "dev-1" }, T0);
  const token = signToken<"session">(payload, SECRET);
  const back = verifyToken("session", token, SECRET);
  assert.deepEqual(back, payload);
  assert.equal(back?.iat, T0);
  assert.equal(back?.last, T0);
  assert.equal(verifyToken("device", token, SECRET), null, "sessie-token als apparaat gelezen");

  // Zelfde secret, maar een payload zonder de verplichte velden: ongeldig,
  // ook al klopt de handtekening.
  const bare = { v: 1, kind: "session", sid: "x" } as unknown as ReturnType<typeof newSessionPayload>;
  assert.equal(verifyToken("session", signToken<"session">(bare, SECRET), SECRET), null);
});

test("tekenen zonder secret is een fout, geen stil token", () => {
  assert.throws(() => signToken<"device">(newDevicePayload("dev-1", T0), ""));
});

test("verval: tien minuten zonder activiteit, twaalf uur absoluut, en touch verlengt alleen last", () => {
  const p = newSessionPayload({ staffProfileId: "p-1", pinVersion: 1, deviceId: "dev-1" }, T0);
  assert.equal(sessionFreshness(p, T0), "ok");
  assert.equal(sessionFreshness(p, T0 + KIOSK_IDLE_MS), "ok", "precies op de grens is nog geldig");
  assert.equal(sessionFreshness(p, T0 + KIOSK_IDLE_MS + 1), "idle_expired");
  assert.notEqual(sessionFreshness(p, T0 - 1), "ok", "klok terug is ongeldig");

  // Steeds op tijd aangeraakt: idle blijft ok tot de absolute grens.
  let q = p;
  for (let t = T0; t < T0 + KIOSK_ABSOLUTE_MS; t += KIOSK_IDLE_MS - 1) {
    q = touchSession(q, t);
  }
  assert.equal(q.iat, T0, "touch verandert iat niet");
  assert.equal(q.sid, p.sid, "touch verandert sid niet");
  assert.equal(sessionFreshness(q, q.last), "ok");
  assert.equal(sessionFreshness(q, T0 + KIOSK_ABSOLUTE_MS + 1), "absolute_expired");
});
