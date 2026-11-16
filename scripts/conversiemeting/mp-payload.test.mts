import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPurchasePayload,
  buildTrialBookedPayload,
  itemCategoryFor,
  mpConsent,
  mpEnvParams,
  sanitizeActionPage,
  sanitizeGaClientId,
  sanitizeGaSessionId,
  trialCodeParam,
  trialTypeForSource,
} from "../../src/lib/ga-mp/core.ts";
import { dropInSlugForPillar, trialValueSlugForPillar } from "../../src/lib/trial-pricing.ts";

// Pure tests voor de Measurement Protocol-payloads (spec-conversiemeting.md,
// "MP-regels"): consent, traffic_type, overslaan zonder client_id, de code
// ("uniek" tegenover letterlijk), action_page en de bron van de value.

const TRIAL_ID = "0f1e2d3c-4b5a-4968-8777-66554433aabb";
const ORDER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const CLIENT_ID = "1234567890.1700000000";

const trialBase = {
  trialBookingId: TRIAL_ID,
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
};

const purchaseBase = {
  orderId: ORDER_ID,
  amountCents: 7900,
  clientId: CLIENT_ID,
  sessionId: "1700000001",
  adConsent: "granted",
  catalogueSlug: "groepslessen_2x",
  catalogue: { display_name: "Groepslessen 2x/wk", revenue_category: "abonnement" },
  isProduction: true,
};

test("consent: granted wordt GRANTED, denied en unknown worden DENIED, personalisatie altijd DENIED", () => {
  assert.deepEqual(mpConsent("granted"), { ad_user_data: "GRANTED", ad_personalization: "DENIED" });
  assert.deepEqual(mpConsent("denied"), { ad_user_data: "DENIED", ad_personalization: "DENIED" });
  assert.deepEqual(mpConsent("unknown"), { ad_user_data: "DENIED", ad_personalization: "DENIED" });
  // Alles wat geen geldige waarde is telt als unknown, dus denied.
  for (const odd of [undefined, null, "", "GRANTED", "yes", 1, true, {}]) {
    assert.deepEqual(mpConsent(odd), { ad_user_data: "DENIED", ad_personalization: "DENIED" });
  }
});

test("consent staat op requestniveau, niet in het event", () => {
  const trial = buildTrialBookedPayload(trialBase);
  const purchase = buildPurchasePayload(purchaseBase);
  for (const payload of [trial, purchase]) {
    assert.ok(payload);
    assert.deepEqual(Object.keys(payload).sort(), ["client_id", "consent", "events"]);
    assert.equal("consent" in payload.events[0].params, false);
    assert.equal(payload.consent.ad_personalization, "DENIED");
  }
});

test("geen user_id, nergens", () => {
  for (const payload of [buildTrialBookedPayload(trialBase), buildPurchasePayload(purchaseBase)]) {
    assert.ok(payload);
    assert.equal(JSON.stringify(payload).includes("user_id"), false);
  }
});

test("traffic_type en debug_mode: alleen buiten productie", () => {
  assert.deepEqual(mpEnvParams(true), {});
  assert.deepEqual(mpEnvParams(false), { traffic_type: "internal", debug_mode: true });

  const prodTrial = buildTrialBookedPayload(trialBase);
  assert.equal("traffic_type" in prodTrial!.events[0].params, false);
  assert.equal("debug_mode" in prodTrial!.events[0].params, false);

  const previewTrial = buildTrialBookedPayload({ ...trialBase, isProduction: false });
  assert.equal(previewTrial!.events[0].params.traffic_type, "internal");
  assert.equal(previewTrial!.events[0].params.debug_mode, true);

  const prodPurchase = buildPurchasePayload(purchaseBase);
  assert.equal("traffic_type" in prodPurchase!.events[0].params, false);
  const previewPurchase = buildPurchasePayload({ ...purchaseBase, isProduction: false });
  assert.equal(previewPurchase!.events[0].params.traffic_type, "internal");
  assert.equal(previewPurchase!.events[0].params.debug_mode, true);
});

test("overslaan zonder client_id (trial_booked en purchase)", () => {
  for (const clientId of [null, undefined, "", "   ", "met spatie", "a".repeat(101)]) {
    assert.equal(buildTrialBookedPayload({ ...trialBase, clientId }), null);
    assert.equal(buildPurchasePayload({ ...purchaseBase, clientId }), null);
  }
});

test("is_test: in productie nooit, buiten productie wel en dan als intern verkeer", () => {
  assert.equal(buildTrialBookedPayload({ ...trialBase, isTest: true, isProduction: true }), null);
  const preview = buildTrialBookedPayload({ ...trialBase, isTest: true, isProduction: false });
  assert.ok(preview);
  assert.equal(preview.events[0].params.traffic_type, "internal");
  assert.equal(preview.events[0].params.debug_mode, true);
});

test("trial_booked paid: volledige payload, value is het Mollie-bedrag, geen code", () => {
  const payload = buildTrialBookedPayload({
    ...trialBase,
    // Een code op een betaalde boeking mag nooit meegaan.
    code: { code: "MOVENOW", max_uses: null },
  });
  assert.deepEqual(payload, {
    client_id: CLIENT_ID,
    consent: { ad_user_data: "GRANTED", ad_personalization: "DENIED" },
    events: [
      {
        name: "trial_booked",
        params: {
          session_id: "1700000001",
          trial_type: "paid",
          pillar: "yoga_mobility",
          transaction_id: TRIAL_ID,
          currency: "EUR",
          value: 17,
        },
      },
    ],
  });
});

test("trial_type volgt de bron: paid, code, opening wordt free", () => {
  assert.equal(trialTypeForSource("paid"), "paid");
  assert.equal(trialTypeForSource("code"), "code");
  assert.equal(trialTypeForSource("opening"), "free");
  assert.equal(trialTypeForSource("iets"), null);
  assert.equal(buildTrialBookedPayload({ ...trialBase, source: "iets" }), null);
  assert.equal(
    buildTrialBookedPayload({ ...trialBase, source: "opening" })!.events[0].params.trial_type,
    "free",
  );
});

test("code: uniek bij max_uses 1, letterlijk bij een gedeelde code", () => {
  assert.equal(trialCodeParam({ code: "AB12CD34", max_uses: 1 }), "uniek");
  assert.equal(trialCodeParam({ code: "MOVENOW", max_uses: null }), "MOVENOW");
  assert.equal(trialCodeParam({ code: "JOUWYOGA", max_uses: null }), "JOUWYOGA");
  assert.equal(trialCodeParam({ code: "TEAM", max_uses: 25 }), "TEAM");
  assert.equal(trialCodeParam(null), null);
  assert.equal(trialCodeParam({ code: null, max_uses: 1 }), null);

  const unique = buildTrialBookedPayload({
    ...trialBase,
    source: "code",
    code: { code: "AB12CD34", max_uses: 1 },
  });
  assert.equal(unique!.events[0].params.code, "uniek");
  assert.equal(JSON.stringify(unique).includes("AB12CD34"), false);

  const shared = buildTrialBookedPayload({
    ...trialBase,
    source: "code",
    code: { code: "MOVENOW", max_uses: null },
  });
  assert.equal(shared!.events[0].params.code, "MOVENOW");

  // Gratis (opening) en betaald hebben nooit een code.
  for (const source of ["opening", "paid"]) {
    const payload = buildTrialBookedPayload({
      ...trialBase,
      source,
      code: { code: "MOVENOW", max_uses: null },
    });
    assert.equal("code" in payload!.events[0].params, false);
  }
});

test("action_page: weggelaten zonder slug, nooit een lege string of none", () => {
  for (const actionPage of [null, undefined, "", "   ", "Zomer", "zomer actie", "a".repeat(65)]) {
    const payload = buildTrialBookedPayload({ ...trialBase, actionPage });
    assert.equal("action_page" in payload!.events[0].params, false);
    assert.equal(JSON.stringify(payload).includes("none"), false);
  }
  const withPage = buildTrialBookedPayload({ ...trialBase, actionPage: "zomer-actie-2027" });
  assert.equal(withPage!.events[0].params.action_page, "zomer-actie-2027");
  assert.equal(sanitizeActionPage("a".repeat(64)), "a".repeat(64));
  assert.equal(sanitizeActionPage("zomer_actie"), null);
});

test("value-bron: code en free krijgen de meegegeven catalogusprijs, onbekend laat value en currency weg", () => {
  const free = buildTrialBookedPayload({ ...trialBase, source: "opening", valueCents: 1700 });
  assert.equal(free!.events[0].params.value, 17);
  assert.equal(free!.events[0].params.currency, "EUR");

  const kids = buildTrialBookedPayload({ ...trialBase, source: "code", pillar: "kids", valueCents: 1300 });
  assert.equal(kids!.events[0].params.value, 13);

  for (const valueCents of [null, undefined, Number.NaN, -1]) {
    const payload = buildTrialBookedPayload({ ...trialBase, source: "opening", valueCents });
    assert.equal("value" in payload!.events[0].params, false);
    assert.equal("currency" in payload!.events[0].params, false);
  }
});

test("value-slug per pillar: vrij trainen krijgt drop_in, de betaalde flow blijft vrij trainen weigeren", () => {
  assert.equal(trialValueSlugForPillar("yoga_mobility"), "drop_in");
  assert.equal(trialValueSlugForPillar("kettlebell"), "drop_in");
  assert.equal(trialValueSlugForPillar("vrij_trainen"), "drop_in");
  assert.equal(trialValueSlugForPillar("kids"), "drop_in_kids");
  assert.equal(trialValueSlugForPillar("senior"), "drop_in_senior");
  assert.equal(trialValueSlugForPillar("onbekend"), null);
  // De boekbaarheidsregel van startTrialBooking is ongewijzigd.
  assert.equal(dropInSlugForPillar("vrij_trainen"), null);
  assert.equal(dropInSlugForPillar("yoga_mobility"), "drop_in");
});

test("session_id: alleen cijfers, anders weggelaten", () => {
  assert.equal(sanitizeGaSessionId("1700000001"), "1700000001");
  assert.equal(sanitizeGaSessionId(1700000001), "1700000001");
  assert.equal(sanitizeGaSessionId("abc"), null);
  assert.equal(sanitizeGaSessionId(null), null);
  assert.equal(sanitizeGaClientId(" 12.34 "), "12.34");
  const payload = buildTrialBookedPayload({ ...trialBase, sessionId: "abc" });
  assert.equal("session_id" in payload!.events[0].params, false);
});

test("purchase: value is het Mollie-bedrag, items[0] met item_name en item_category", () => {
  assert.deepEqual(buildPurchasePayload(purchaseBase), {
    client_id: CLIENT_ID,
    consent: { ad_user_data: "GRANTED", ad_personalization: "DENIED" },
    events: [
      {
        name: "purchase",
        params: {
          session_id: "1700000001",
          transaction_id: ORDER_ID,
          currency: "EUR",
          value: 79,
          items: [
            {
              item_id: "groepslessen_2x",
              item_name: "Groepslessen 2x/wk",
              item_category: "abonnement",
              quantity: 1,
            },
          ],
        },
      },
    ],
  });
});

test("purchase: zonder catalogusrij alleen item_id, het event gaat wel door", () => {
  const payload = buildPurchasePayload({ ...purchaseBase, catalogue: null });
  assert.deepEqual(payload!.events[0].params.items, [{ item_id: "groepslessen_2x", quantity: 1 }]);
});

test("purchase: ad_consent unknown of denied geeft ad_user_data DENIED", () => {
  for (const adConsent of ["unknown", "denied", undefined, null]) {
    assert.equal(
      buildPurchasePayload({ ...purchaseBase, adConsent })!.consent.ad_user_data,
      "DENIED",
    );
  }
});

test("item_category: mapping van tmc.catalogue", () => {
  assert.equal(itemCategoryFor(null), "overig");
});
