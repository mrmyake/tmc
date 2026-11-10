import { test } from "node:test";
import assert from "node:assert/strict";
import { onlinePaymentAvailable } from "../../src/lib/invoice-payments/availability.ts";

// Een LIVE-factuur op een preview kan niet online betaald worden: geen knop
// maar een duidelijke tekst (de pagina leest deze functie).

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

test("LIVE-factuur op een preview zonder live-key: niet beschikbaar", () => {
  assert.equal(
    onlinePaymentAvailable(false, env({ VERCEL_ENV: "preview", MOLLIE_API_KEY_TEST: "test_abc" })),
    false,
  );
});

test("LIVE-factuur op een preview, ook mocht de live-key er staan: nee", () => {
  assert.equal(
    onlinePaymentAvailable(
      false,
      env({ VERCEL_ENV: "preview", MOLLIE_API_KEY_LIVE: "live_abc", MOLLIE_API_KEY_TEST: "test_abc" }),
    ),
    false,
  );
});

test("LIVE-factuur op productie met live-key: beschikbaar", () => {
  assert.equal(
    onlinePaymentAvailable(false, env({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: "live_abc" })),
    true,
  );
});

test("LIVE-factuur op productie zonder key of met verkeerde prefix: niet beschikbaar", () => {
  assert.equal(onlinePaymentAvailable(false, env({ VERCEL_ENV: "production" })), false);
  assert.equal(
    onlinePaymentAvailable(false, env({ VERCEL_ENV: "production", MOLLIE_API_KEY_LIVE: "test_abc" })),
    false,
  );
});

test("TEST-factuur: beschikbaar in elke omgeving met een testkey", () => {
  for (const vercelEnv of ["preview", "production", "development"]) {
    assert.equal(
      onlinePaymentAvailable(true, env({ VERCEL_ENV: vercelEnv, MOLLIE_API_KEY_TEST: "test_abc" })),
      true,
      vercelEnv,
    );
  }
});

test("TEST-factuur zonder testkey of met een livekey als testkey: niet beschikbaar", () => {
  assert.equal(onlinePaymentAvailable(true, env({ VERCEL_ENV: "preview" })), false);
  assert.equal(
    onlinePaymentAvailable(true, env({ VERCEL_ENV: "preview", MOLLIE_API_KEY_TEST: "live_abc" })),
    false,
  );
});
