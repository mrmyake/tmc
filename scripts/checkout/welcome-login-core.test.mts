/**
 * POST van /welkom/[token] (src/lib/checkout/welcome-login-core.ts): consume
 * eerst, dan magiclink, verify en sessie; elke mislukking daarna is
 * login_failed met het adres voor scherm 9. Run: npm run test:checkout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { welcomeLoginCore, type WelcomeLoginDeps } from "../../src/lib/checkout/welcome-login-core";

const TOKEN = "b".repeat(64);
const PROFILE = "22222222-2222-4222-8222-222222222222";

function harness(opts: {
  consume?: Awaited<ReturnType<WelcomeLoginDeps["consume"]>>;
  link?: { tokenHash: string; type: "magiclink" } | null;
  verify?: Awaited<ReturnType<WelcomeLoginDeps["verify"]>>;
  setSession?: boolean;
} = {}) {
  const calls = { consume: 0, generate: 0, verify: 0, setSession: 0 };
  const deps: WelcomeLoginDeps = {
    consume: async () => {
      calls.consume += 1;
      return opts.consume ?? { ok: true, profileId: PROFILE, email: "lid@test.invalid" };
    },
    generateMagicLink: async () => {
      calls.generate += 1;
      return opts.link === undefined ? { tokenHash: "hash", type: "magiclink" } : opts.link;
    },
    verify: async () => {
      calls.verify += 1;
      return opts.verify ?? { ok: true, accessToken: "a", refreshToken: "r", userId: PROFILE };
    },
    setSession: async () => {
      calls.setSession += 1;
      return opts.setSession ?? true;
    },
    landing: async () => "/app",
  };
  return { deps, calls };
}

test("ongeldig token: not_found zonder consume", async () => {
  const h = harness();
  assert.deepEqual(await welcomeLoginCore(h.deps, "kort"), { ok: false, reason: "not_found", email: null });
  assert.equal(h.calls.consume, 0);
});

test("geldig token: consume, magiclink, verify, sessie, landing", async () => {
  const h = harness();
  assert.deepEqual(await welcomeLoginCore(h.deps, TOKEN), { ok: true, redirectTo: "/app" });
  assert.deepEqual(h.calls, { consume: 1, generate: 1, verify: 1, setSession: 1 });
});

test("gebruikt of verlopen token: reden uit consume, geen magiclink", async () => {
  for (const reason of ["used", "expired", "not_found", "not_converted"] as const) {
    const h = harness({ consume: { ok: false, reason } });
    assert.deepEqual(await welcomeLoginCore(h.deps, TOKEN), { ok: false, reason, email: null });
    assert.equal(h.calls.generate, 0);
  }
});

test("magiclink of verify mislukt na consume: login_failed met e-mail voor scherm 9", async () => {
  const noLink = harness({ link: null });
  assert.deepEqual(await welcomeLoginCore(noLink.deps, TOKEN), { ok: false, reason: "login_failed", email: "lid@test.invalid" });
  const badVerify = harness({ verify: { ok: false } });
  assert.deepEqual(await welcomeLoginCore(badVerify.deps, TOKEN), { ok: false, reason: "login_failed", email: "lid@test.invalid" });
  assert.equal(badVerify.calls.setSession, 0);
});

test("verify levert een andere user dan de intent: geen sessie", async () => {
  const h = harness({ verify: { ok: true, accessToken: "a", refreshToken: "r", userId: "iemand-anders" } });
  assert.deepEqual(await welcomeLoginCore(h.deps, TOKEN), { ok: false, reason: "login_failed", email: "lid@test.invalid" });
  assert.equal(h.calls.setSession, 0);
});

test("sessie zetten mislukt: login_failed", async () => {
  const h = harness({ setSession: false });
  assert.deepEqual(await welcomeLoginCore(h.deps, TOKEN), { ok: false, reason: "login_failed", email: "lid@test.invalid" });
});
