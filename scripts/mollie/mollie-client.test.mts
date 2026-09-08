/**
 * Vangrails op de Mollie-client (src/lib/mollie.ts, spec-facturatie.md 6.6):
 * omgevingsguard op de live-modus en prefix-check op beide modi.
 * Run: npm run test:mollie
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getMollieClient,
  isMollieConfigured,
  resolveMollieApiKey,
} from "../../src/lib/mollie";

// Nepkeys in het formaat dat de Mollie-client accepteert; er wordt nooit
// een verzoek gedaan, alleen een client geconstrueerd.
const LIVE_KEY = "live_abcdefghijklmnopqrstuvwxyz1234";
const TEST_KEY = "test_abcdefghijklmnopqrstuvwxyz1234";

const ENVIRONMENTS = ["production", "preview", "development", undefined] as const;

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides };
}

// getMollieClient leest process.env; per test zetten en daarna herstellen.
const ORIGINAL = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  MOLLIE_API_KEY_LIVE: process.env.MOLLIE_API_KEY_LIVE,
  MOLLIE_API_KEY_TEST: process.env.MOLLIE_API_KEY_TEST,
};
function setProcessEnv(values: Record<string, string | undefined>) {
  for (const key of Object.keys(ORIGINAL)) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
afterEach(() => setProcessEnv(ORIGINAL));

test("live-modus buiten productie geeft null, ook met een geldige live_ key", () => {
  for (const vercelEnv of ["preview", "development", undefined]) {
    const r = resolveMollieApiKey("live", env({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_LIVE: LIVE_KEY }));
    assert.equal(r.ok, false, String(vercelEnv));
    assert.equal(r.ok === false && r.reason, "wrong_environment", String(vercelEnv));

    setProcessEnv({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_LIVE: LIVE_KEY });
    assert.equal(getMollieClient("live"), null, String(vercelEnv));
    assert.equal(isMollieConfigured("live"), false, String(vercelEnv));
  }
});

test("live-modus op productie met een live_ key slaagt", () => {
  const r = resolveMollieApiKey("live", env({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: LIVE_KEY }));
  assert.deepEqual(r, { ok: true, apiKey: LIVE_KEY });

  setProcessEnv({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: LIVE_KEY });
  const client = getMollieClient("live");
  assert.notEqual(client, null);
  assert.equal(isMollieConfigured("live"), true);
  assert.equal(getMollieClient("live"), client, "zelfde key, zelfde client uit de cache");
});

test("live-modus met een test_ key weigert, ook op productie", () => {
  const r = resolveMollieApiKey("live", env({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: TEST_KEY }));
  assert.deepEqual(r, { ok: false, reason: "wrong_prefix", prefix: "test_" });

  setProcessEnv({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: TEST_KEY });
  assert.equal(getMollieClient("live"), null);
  assert.equal(isMollieConfigured("live"), false);
});

test("test-modus met een live_ key weigert, in elke omgeving", () => {
  for (const vercelEnv of ENVIRONMENTS) {
    const r = resolveMollieApiKey("test", env({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_TEST: LIVE_KEY }));
    assert.deepEqual(r, { ok: false, reason: "wrong_prefix", prefix: "live_" }, String(vercelEnv));

    setProcessEnv({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_TEST: LIVE_KEY });
    assert.equal(getMollieClient("test"), null, String(vercelEnv));
    assert.equal(isMollieConfigured("test"), false, String(vercelEnv));
  }
});

test("test-modus met een test_ key slaagt, in elke omgeving", () => {
  for (const vercelEnv of ENVIRONMENTS) {
    const r = resolveMollieApiKey("test", env({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_TEST: TEST_KEY }));
    assert.deepEqual(r, { ok: true, apiKey: TEST_KEY }, String(vercelEnv));

    setProcessEnv({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_TEST: TEST_KEY });
    assert.notEqual(getMollieClient("test"), null, String(vercelEnv));
    assert.equal(isMollieConfigured("test"), true, String(vercelEnv));
  }
});

test("een key zonder bekende prefix wordt benoemd zonder tekens uit de key te lekken", () => {
  const r = resolveMollieApiKey("test", env({ MOLLIE_API_KEY_TEST: "geheim123" }));
  assert.deepEqual(r, { ok: false, reason: "wrong_prefix", prefix: "geen live_/test_" });
});

test("ontbrekende key blijft stil null, in beide modi", () => {
  for (const mode of ["live", "test"] as const) {
    for (const vercelEnv of ENVIRONMENTS) {
      assert.deepEqual(
        resolveMollieApiKey(mode, env({ VERCEL_ENV: vercelEnv })),
        { ok: false, reason: "missing" },
        `${mode}/${vercelEnv}`,
      );
      setProcessEnv({ VERCEL_ENV: vercelEnv });
      assert.equal(getMollieClient(mode), null, `${mode}/${vercelEnv}`);
      assert.equal(isMollieConfigured(mode), false, `${mode}/${vercelEnv}`);
    }
  }
});

test("de cache omzeilt geen vangrail: een eerder gebouwde client komt niet terug na een verkeerde key", () => {
  setProcessEnv({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: LIVE_KEY });
  assert.notEqual(getMollieClient("live"), null);
  setProcessEnv({ VERCEL_ENV: "preview", MOLLIE_API_KEY_LIVE: LIVE_KEY });
  assert.equal(getMollieClient("live"), null, "omgevingsguard wint van de cache");
  setProcessEnv({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: TEST_KEY });
  assert.equal(getMollieClient("live"), null, "prefix-vangrail wint van de cache");
});
