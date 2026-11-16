import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GA_MEASUREMENT_ID,
  MP_DEBUG_ENDPOINT,
  buildPurchasePayload,
  buildTrialBookedPayload,
  type MpPayload,
} from "../../src/lib/ga-mp/core.ts";

// Valideert de echte payloads tegen de validatieserver van Google
// (/debug/mp/collect). Die verwerkt niets: hij geeft alleen
// validationMessages terug. Zonder GA4_API_SECRET wordt deze test
// overgeslagen, zodat de gewone testrun geen netwerk en geen secret nodig
// heeft.
//
// Gebruik: GA4_API_SECRET=... npm run test:conversiemeting-mp
//
// De URL bevat het api_secret en wordt nergens gelogd; bij een fout toont de
// test alleen de status en de validationMessages.

const SECRET = process.env.GA4_API_SECRET;
const CLIENT_ID = "1234567890.1700000000";

async function validate(payload: MpPayload): Promise<Array<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await fetch(
      `${MP_DEBUG_ENDPOINT}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${encodeURIComponent(SECRET ?? "")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch (e) {
    // Nooit de fout zelf doorgeven: die kan de URL met het secret dragen.
    throw new Error(`validatieserver niet bereikbaar (${e instanceof Error ? e.name : "fout"})`);
  }
  assert.equal(res.status, 200, `validatieserver gaf status ${res.status}`);
  const body = (await res.json()) as { validationMessages?: Array<Record<string, unknown>> };
  return body.validationMessages ?? [];
}

const PAYLOADS: Array<[label: string, payload: MpPayload | null]> = [
  [
    "trial_booked paid, productie, ad_consent granted",
    buildTrialBookedPayload({
      trialBookingId: "0f1e2d3c-4b5a-4968-8777-66554433aabb",
      isTest: false,
      isProduction: true,
      clientId: CLIENT_ID,
      sessionId: "1700000001",
      adConsent: "granted",
      source: "paid",
      pillar: "yoga_mobility",
      code: null,
      actionPage: null,
      valueCents: 1700,
    }),
  ],
  [
    "trial_booked code, preview (traffic_type en debug_mode), ad_consent unknown, met action_page",
    buildTrialBookedPayload({
      trialBookingId: "0f1e2d3c-4b5a-4968-8777-66554433aabc",
      isTest: true,
      isProduction: false,
      clientId: CLIENT_ID,
      sessionId: "1700000001",
      adConsent: "unknown",
      source: "code",
      pillar: "vrij_trainen",
      code: { code: "MOVENOW", max_uses: null },
      actionPage: "zomer-actie-2027",
      valueCents: 1700,
    }),
  ],
  [
    "trial_booked free, zonder session_id en zonder value",
    buildTrialBookedPayload({
      trialBookingId: "0f1e2d3c-4b5a-4968-8777-66554433aabd",
      isTest: false,
      isProduction: true,
      clientId: CLIENT_ID,
      sessionId: null,
      adConsent: "denied",
      source: "opening",
      pillar: "kettlebell",
      code: null,
      actionPage: null,
      valueCents: null,
    }),
  ],
  [
    "purchase abonnement, productie, ad_consent granted",
    buildPurchasePayload({
      orderId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      amountCents: 11800,
      clientId: CLIENT_ID,
      sessionId: "1700000001",
      adConsent: "granted",
      catalogueSlug: "groepslessen_2x",
      catalogue: { display_name: "Groepslessen 2x/wk", revenue_category: "abonnement" },
      isProduction: true,
    }),
  ],
  [
    "purchase rittenkaart, preview, ad_consent denied",
    buildPurchasePayload({
      orderId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e",
      amountCents: 15000,
      clientId: CLIENT_ID,
      sessionId: "1700000001",
      adConsent: "denied",
      catalogueSlug: "ten_ride_card",
      catalogue: { display_name: "10-rittenkaart", revenue_category: "les_tegoed" },
      isProduction: false,
    }),
  ],
];

for (const [label, payload] of PAYLOADS) {
  test(`validatieserver: ${label}`, { skip: SECRET ? false : "GA4_API_SECRET ontbreekt" }, async () => {
    assert.ok(payload, "de bouwer gaf een payload");
    const messages = await validate(payload);
    assert.deepEqual(messages, [], `validationMessages: ${JSON.stringify(messages)}`);
  });
}
