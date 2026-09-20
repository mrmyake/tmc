/**
 * Draait de ECHTE kern van het uitlogpad
 * (src/lib/member/device-cleanup-core.ts) met fakes. Bewijst: eigenaarschap
 * wordt server-side gecontroleerd voor elke Akiles-call, een vreemd of
 * onbekend id trekt niets in en wordt persistent gelogd, en een
 * niet-identificeerbaar toestel leidt tot intrekking van alle open tokens
 * van het profiel (geen stille no-op). Run: npm run test:access
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanupDeviceOnSignOutCore,
  type DeviceCleanupDeps,
} from "../../src/lib/member/device-cleanup-core";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MY_TOKEN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MY_TOKEN_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHERS_TOKEN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MY_PUSH = "fcm_token_of_me_0123456789abcdef";
const OTHERS_PUSH = "fcm_token_of_other_0123456789abcdef";

class FakeCleanup implements DeviceCleanupDeps {
  deviceTokens = new Map<string, { profile_id: string; revoked_at: string | null }>([
    [MY_TOKEN_ID, { profile_id: ME, revoked_at: null }],
    [MY_TOKEN_ID_2, { profile_id: ME, revoked_at: null }],
    [OTHERS_TOKEN_ID, { profile_id: OTHER, revoked_at: null }],
  ]);
  pushTokens = new Map<string, string>([
    [MY_PUSH, ME],
    [OTHERS_PUSH, OTHER],
  ]);
  calls: string[] = [];
  rejections: Array<Record<string, unknown>> = [];
  logs: string[] = [];
  /** Simuleert Akiles onbereikbaar in revokeDeviceToken. */
  akilesDown = false;

  async findDeviceToken(id: string) {
    this.calls.push(`findDeviceToken:${id}`);
    const row = this.deviceTokens.get(id);
    return row ? { ...row } : null;
  }
  async findPushToken(token: string) {
    this.calls.push("findPushToken");
    const owner = this.pushTokens.get(token);
    return owner ? { profile_id: owner } : null;
  }
  async revokeDeviceToken(profileId: string, id: string, reason: string) {
    this.calls.push(`revokeDeviceToken:${id}:${reason}`);
    const row = this.deviceTokens.get(id);
    if (!row || row.profile_id !== profileId) return { ok: false as const };
    if (row.revoked_at) return { ok: true as const, outcome: "already_revoked" as const };
    if (this.akilesDown) return { ok: true as const, outcome: "deferred" as const };
    row.revoked_at = "2026-09-20T10:00:00.000Z";
    return { ok: true as const, outcome: "revoked" as const };
  }
  async revokeAllDeviceTokens(profileId: string, reason: string) {
    this.calls.push(`revokeAllDeviceTokens:${reason}`);
    let revoked = 0;
    for (const [id, row] of this.deviceTokens) {
      if (row.profile_id !== profileId || row.revoked_at) continue;
      const r = await this.revokeDeviceToken(profileId, id, reason);
      if (r.ok && r.outcome === "revoked") revoked++;
    }
    return { revoked, deferred: 0 };
  }
  async removePushToken(profileId: string, token: string) {
    this.calls.push("removePushToken");
    if (this.pushTokens.get(token) === profileId) this.pushTokens.delete(token);
  }
  async removeAllPushTokens(profileId: string) {
    this.calls.push("removeAllPushTokens");
    let n = 0;
    for (const [token, owner] of this.pushTokens) {
      if (owner === profileId) {
        this.pushTokens.delete(token);
        n++;
      }
    }
    return n;
  }
  async emitRejected(_profileId: string, payload: Record<string, unknown>) {
    this.rejections.push(payload);
  }
  log = { error: (m: string) => this.logs.push(m) };

  openFor(profileId: string) {
    return [...this.deviceTokens.entries()].filter(([, r]) => r.profile_id === profileId && !r.revoked_at).map(([id]) => id);
  }
}

test("eigen token en eigen pushtoken: alleen die twee, andere toestellen en andere profielen ongemoeid", async () => {
  const deps = new FakeCleanup();
  const result = await cleanupDeviceOnSignOutCore(deps, ME, {
    accessDeviceTokenId: MY_TOKEN_ID,
    pushToken: MY_PUSH,
  });
  assert.deepEqual(result, { accessDeviceToken: "revoked", pushToken: "removed", rejected: [] });
  assert.deepEqual(deps.openFor(ME), [MY_TOKEN_ID_2], "ander eigen toestel blijft");
  assert.deepEqual(deps.openFor(OTHER), [OTHERS_TOKEN_ID]);
  assert.equal(deps.pushTokens.has(OTHERS_PUSH), true);
  assert.equal(deps.rejections.length, 0);
  // Eigenaarschap voor de intrekking: lookup komt voor de revoke.
  assert.ok(deps.calls.indexOf(`findDeviceToken:${MY_TOKEN_ID}`) < deps.calls.indexOf(`revokeDeviceToken:${MY_TOKEN_ID}:logout`));
});

test("vreemd token-id: niets met dat id ingetrokken, poging gelogd met eigenaar, en alle eigen tokens weg", async () => {
  const deps = new FakeCleanup();
  const result = await cleanupDeviceOnSignOutCore(deps, ME, {
    accessDeviceTokenId: OTHERS_TOKEN_ID,
    pushToken: MY_PUSH,
  });
  assert.equal(result.accessDeviceToken, "revoked_all");
  assert.equal(result.pushToken, "removed");
  assert.deepEqual(result.rejected, [{ field: "access_device_token_id", reason: "foreign" }]);
  assert.deepEqual(deps.openFor(OTHER), [OTHERS_TOKEN_ID], "andermans token staat er nog");
  assert.deepEqual(deps.openFor(ME), [], "alle eigen tokens ingetrokken");
  assert.equal(deps.calls.some((c) => c.startsWith(`revokeDeviceToken:${OTHERS_TOKEN_ID}`)), false, "geen Akiles-call op het vreemde id");
  assert.deepEqual(deps.rejections, [
    {
      profile_id: ME,
      field: "access_device_token_id",
      reason: "foreign",
      supplied_id: OTHERS_TOKEN_ID,
      owner_profile_id: OTHER,
    },
  ]);
});

test("vreemd pushtoken: niet verwijderd, gelogd zonder de tokenwaarde, alle eigen pushtokens weg", async () => {
  const deps = new FakeCleanup();
  const result = await cleanupDeviceOnSignOutCore(deps, ME, {
    accessDeviceTokenId: MY_TOKEN_ID,
    pushToken: OTHERS_PUSH,
  });
  assert.equal(result.pushToken, "removed_all");
  assert.equal(result.accessDeviceToken, "revoked");
  assert.deepEqual(result.rejected, [{ field: "push_token", reason: "foreign" }]);
  assert.equal(deps.pushTokens.has(OTHERS_PUSH), true);
  assert.equal(deps.pushTokens.has(MY_PUSH), false);
  assert.equal(JSON.stringify(deps.rejections).includes(OTHERS_PUSH), false, "tokenwaarde niet in het event");
  assert.deepEqual(deps.rejections, [
    { profile_id: ME, field: "push_token", reason: "foreign", owner_profile_id: OTHER },
  ]);
});

test("onbekend of ongeldig id: gelogd en alles van het profiel ingetrokken", async () => {
  const unknown = new FakeCleanup();
  const r1 = await cleanupDeviceOnSignOutCore(unknown, ME, {
    accessDeviceTokenId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    pushToken: "unknown_push_token_0123456789",
  });
  assert.equal(r1.accessDeviceToken, "revoked_all");
  assert.equal(r1.pushToken, "removed_all");
  assert.deepEqual(r1.rejected.map((r) => r.reason), ["unknown", "unknown"]);
  assert.deepEqual(unknown.openFor(ME), []);

  const invalid = new FakeCleanup();
  const r2 = await cleanupDeviceOnSignOutCore(invalid, ME, {
    accessDeviceTokenId: "'; drop table",
    pushToken: "too short",
  });
  assert.deepEqual(r2.rejected.map((r) => r.reason), ["invalid", "invalid"]);
  assert.equal(invalid.calls.some((c) => c.startsWith("findDeviceToken")), false, "ongeldige vorm: geen lookup");
  assert.deepEqual(invalid.openFor(ME), []);
  assert.equal(invalid.rejections.length, 2);
});

test("lege of ontbrekende velden (web-uitlog of verloren localStorage): geen stille no-op, alles van het profiel weg", async () => {
  const deps = new FakeCleanup();
  const result = await cleanupDeviceOnSignOutCore(deps, ME, {});
  assert.deepEqual(result, { accessDeviceToken: "revoked_all", pushToken: "removed_all", rejected: [] });
  assert.deepEqual(deps.openFor(ME), []);
  assert.equal(deps.pushTokens.has(MY_PUSH), false);
  assert.deepEqual(deps.openFor(OTHER), [OTHERS_TOKEN_ID]);
  assert.equal(deps.pushTokens.has(OTHERS_PUSH), true);
  assert.equal(deps.rejections.length, 0, "leeg is geen afwijzing");
  assert.ok(deps.calls.includes("revokeAllDeviceTokens:logout_unidentified_device"));

  // Profiel zonder tokens: nothing_open, en nog steeds geen fout.
  const empty = new FakeCleanup();
  const none = await cleanupDeviceOnSignOutCore(empty, "33333333-3333-4333-8333-333333333333", {
    accessDeviceTokenId: "",
    pushToken: "   ",
  });
  assert.deepEqual(none, { accessDeviceToken: "nothing_open", pushToken: "nothing_open", rejected: [] });
});

test("Akiles onbereikbaar of lookup stuk: uitloggen blokkeert niet, uitkomst is deferred of alles-intrekken", async () => {
  const down = new FakeCleanup();
  down.akilesDown = true;
  const r1 = await cleanupDeviceOnSignOutCore(down, ME, { accessDeviceTokenId: MY_TOKEN_ID, pushToken: MY_PUSH });
  assert.equal(r1.accessDeviceToken, "deferred");

  const broken = new FakeCleanup();
  broken.findDeviceToken = async () => {
    throw new Error("db weg");
  };
  const r2 = await cleanupDeviceOnSignOutCore(broken, ME, { accessDeviceTokenId: MY_TOKEN_ID, pushToken: MY_PUSH });
  assert.equal(r2.accessDeviceToken, "revoked_all", "lookup-fout telt als niet geidentificeerd, nooit als eigenaar");
  assert.equal(broken.calls.some((c) => c === `revokeDeviceToken:${MY_TOKEN_ID}:logout`), false);
  assert.ok(broken.logs.some((l) => l.includes("opzoeken mislukt")));
});
