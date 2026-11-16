import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPurchaseToGa4 } from "../../src/lib/orders/ga-purchase.ts";
import { sendTrialBookedToGa4 } from "../../src/lib/trial-bookings/ga-trial-booked.ts";
import { gaIdsForStorage, storeTrialBookingGaMeta } from "../../src/lib/ga-mp/store.ts";
import { readAdConsent, writeAdConsent } from "../../src/lib/ga-mp/send.ts";

// De server-side events tegen een nep-database (spec-conversiemeting.md).
// Kern: een ONTBREKENDE KOLOM (de migratie is nog niet gepusht) mag alleen
// tot een gelogde fout en ad_consent "unknown" leiden, nooit tot een gemiste
// purchase. De nep-client gedraagt zich daarvoor als PostgREST: een select of
// update die een ontbrekende kolom noemt, faalt in zijn geheel met 42703.
// Daarmee bewijst de test ook dat ad_consent nooit in dezelfde select of
// update staat als de bestaande kolommen.

const SECRET = "geheim-api-secret-123";
const ORDER_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const TRIAL_ID = "0f1e2d3c-4b5a-4968-8777-66554433aabb";
const SESSION_ID = "d8000000-0000-4000-8000-000000000001";
const CODE_ID = "c0de0000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeAdmin(tables: Tables, missing: Record<string, string[]> = {}) {
  const selects: Array<{ table: string; columns: string[] }> = [];
  const updates: Array<{ table: string; values: Row; id: unknown }> = [];

  const missingIn = (table: string, columns: string[]) =>
    columns.find((c) => (missing[table] ?? []).includes(c));
  const columnError = (table: string, column: string) => ({
    code: "42703",
    message: `column ${table}.${column} does not exist`,
  });

  const admin = {
    from(table: string) {
      return {
        select(columnList: string) {
          const columns = columnList.split(",").map((c) => c.trim());
          selects.push({ table, columns });
          return {
            eq(key: string, value: unknown) {
              return {
                maybeSingle() {
                  const gone = missingIn(table, columns);
                  if (gone) return Promise.resolve({ data: null, error: columnError(table, gone) });
                  const row = (tables[table] ?? []).find((r) => r[key] === value);
                  if (!row) return Promise.resolve({ data: null, error: null });
                  const picked: Row = {};
                  for (const c of columns) picked[c] = row[c] ?? null;
                  return Promise.resolve({ data: picked, error: null });
                },
              };
            },
          };
        },
        update(values: Row) {
          return {
            eq(key: string, value: unknown) {
              updates.push({ table, values, id: value });
              const gone = missingIn(table, Object.keys(values));
              if (gone) return Promise.resolve({ error: columnError(table, gone) });
              const row = (tables[table] ?? []).find((r) => r[key] === value);
              if (row) Object.assign(row, values);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, selects, updates };
}

function fakeFetch(status = 200) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

/** Vangt alle console-uitvoer, zodat de test kan controleren wat er gelogd is. */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const original = { error: console.error, warn: console.warn, log: console.log };
  const lines: string[] = [];
  const sink = (...args: unknown[]) => {
    lines.push(
      args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  };
  console.error = sink;
  console.warn = sink;
  console.log = sink;
  try {
    const result = await fn();
    return { result, logs: lines.join("\n") };
  } finally {
    console.error = original.error;
    console.warn = original.warn;
    console.log = original.log;
  }
}

const catalogue = [
  { slug: "groepslessen_2x", display_name: "Groepslessen 2x/wk", revenue_category: "abonnement", price_cents: 7900 },
  { slug: "ten_ride_card", display_name: "10-rittenkaart", revenue_category: "les_tegoed", price_cents: 15000 },
  { slug: "drop_in", display_name: "Losse les", revenue_category: "les_tegoed", price_cents: 1700 },
];

function orderTables(order: Row = {}): Tables {
  return {
    orders: [
      {
        id: ORDER_ID,
        catalogue_slug: "ten_ride_card",
        ga_client_id: "1234567890.1700000000",
        ga_session_id: "1700000001",
        first_charge_cents: 15000,
        ad_consent: "granted",
        ...order,
      },
    ],
    catalogue: structuredClone(catalogue),
  };
}

// ---------- purchase ----------

test("ontbrekende kolom orders.ad_consent: purchase gaat door, ad_user_data DENIED, fout alleen gelogd", async () => {
  const { admin, selects } = fakeAdmin(orderTables(), { orders: ["ad_consent"] });
  const { fetchImpl, requests } = fakeFetch();
  const { result, logs } = await captureLogs(() =>
    sendPurchaseToGa4(
      { orderId: ORDER_ID, amountCents: 15000 },
      { admin, fetchImpl, apiSecret: SECRET, isProduction: true },
    ),
  );
  assert.equal(result, "sent");
  assert.equal(requests.length, 1, "het purchase-event is verstuurd");
  assert.deepEqual(requests[0].body.consent, { ad_user_data: "DENIED", ad_personalization: "DENIED" });
  const event = (requests[0].body.events as Array<{ name: string; params: Row }>)[0];
  assert.equal(event.name, "purchase");
  assert.equal(event.params.value, 150);
  assert.equal(event.params.transaction_id, ORDER_ID);
  assert.deepEqual(event.params.items, [
    { item_id: "ten_ride_card", item_name: "10-rittenkaart", item_category: "rittenkaart", quantity: 1 },
  ]);
  assert.match(logs, /ad_consent lezen mislukt/);
  // ad_consent heeft een eigen select, los van de bestaande kolommen.
  const orderSelects = selects.filter((s) => s.table === "orders");
  assert.deepEqual(orderSelects.map((s) => s.columns), [
    ["catalogue_slug", "ga_client_id", "ga_session_id", "first_charge_cents"],
    ["ad_consent"],
  ]);
});

test("ad_consent aanwezig: granted geeft GRANTED, denied en unknown geven DENIED", async () => {
  for (const [stored, expected] of [
    ["granted", "GRANTED"],
    ["denied", "DENIED"],
    ["unknown", "DENIED"],
    [null, "DENIED"],
  ] as const) {
    const { admin } = fakeAdmin(orderTables({ ad_consent: stored }));
    const { fetchImpl, requests } = fakeFetch();
    const result = await sendPurchaseToGa4(
      { orderId: ORDER_ID, amountCents: 15000 },
      { admin, fetchImpl, apiSecret: SECRET, isProduction: true },
    );
    assert.equal(result, "sent");
    assert.deepEqual(requests[0].body.consent, { ad_user_data: expected, ad_personalization: "DENIED" });
  }
});

test("purchase: catalogus niet leesbaar, event gaat door met alleen item_id", async () => {
  const tables = orderTables();
  tables.catalogue = [];
  const { admin } = fakeAdmin(tables);
  const { fetchImpl, requests } = fakeFetch();
  const { result } = await captureLogs(() =>
    sendPurchaseToGa4(
      { orderId: ORDER_ID, amountCents: 15000 },
      { admin, fetchImpl, apiSecret: SECRET, isProduction: true },
    ),
  );
  assert.equal(result, "sent");
  const event = (requests[0].body.events as Array<{ params: Row }>)[0];
  assert.deepEqual(event.params.items, [{ item_id: "ten_ride_card", quantity: 1 }]);
});

test("purchase: zonder ga_client_id of zonder secret stil overgeslagen", async () => {
  {
    const { admin } = fakeAdmin(orderTables({ ga_client_id: null }));
    const { fetchImpl, requests } = fakeFetch();
    const result = await sendPurchaseToGa4(
      { orderId: ORDER_ID, amountCents: 15000 },
      { admin, fetchImpl, apiSecret: SECRET, isProduction: true },
    );
    assert.equal(result, "skipped");
    assert.equal(requests.length, 0);
  }
  {
    const { admin, selects } = fakeAdmin(orderTables());
    const { fetchImpl, requests } = fakeFetch();
    const { result } = await captureLogs(() =>
      sendPurchaseToGa4(
        { orderId: ORDER_ID, amountCents: 15000 },
        { admin, fetchImpl, apiSecret: undefined, isProduction: true },
      ),
    );
    assert.equal(result, "skipped");
    assert.equal(requests.length, 0);
    assert.equal(selects.length, 0, "zonder secret wordt de database niet geraakt");
  }
});

test("purchase buiten productie: traffic_type internal en debug_mode true", async () => {
  const { admin } = fakeAdmin(orderTables());
  const { fetchImpl, requests } = fakeFetch();
  await sendPurchaseToGa4(
    { orderId: ORDER_ID, amountCents: 15000 },
    { admin, fetchImpl, apiSecret: SECRET, isProduction: false },
  );
  const event = (requests[0].body.events as Array<{ params: Row }>)[0];
  assert.equal(event.params.traffic_type, "internal");
  assert.equal(event.params.debug_mode, true);
});

test("helpers throwen nooit en loggen nooit de MP-URL of het api_secret", async () => {
  const throwingFetch = (async (url: string | URL | Request) => {
    // Een fetch-fout draagt in de praktijk vaak de URL in zijn message.
    throw new TypeError(`fetch failed: ${String(url)}`);
  }) as typeof fetch;
  const throwingAdmin = {
    from() {
      throw new Error("database weg");
    },
  } as unknown as SupabaseClient;

  const scenarios: Array<() => Promise<unknown>> = [
    () => sendPurchaseToGa4({ orderId: ORDER_ID, amountCents: 1 }, { admin: fakeAdmin(orderTables()).admin, fetchImpl: throwingFetch, apiSecret: SECRET, isProduction: true }),
    () => sendPurchaseToGa4({ orderId: ORDER_ID, amountCents: 1 }, { admin: fakeAdmin(orderTables()).admin, fetchImpl: fakeFetch(500).fetchImpl, apiSecret: SECRET, isProduction: true }),
    () => sendPurchaseToGa4({ orderId: ORDER_ID, amountCents: 1 }, { admin: throwingAdmin, fetchImpl: fakeFetch().fetchImpl, apiSecret: SECRET, isProduction: true }),
    () => sendTrialBookedToGa4({ trialBookingId: TRIAL_ID, amountCents: 1700 }, { admin: fakeAdmin(trialTables()).admin, fetchImpl: throwingFetch, apiSecret: SECRET, isProduction: true }),
    () => sendTrialBookedToGa4({ trialBookingId: TRIAL_ID }, { admin: throwingAdmin, fetchImpl: fakeFetch().fetchImpl, apiSecret: SECRET, isProduction: true }),
    () => storeTrialBookingGaMeta(throwingAdmin, TRIAL_ID, { gaClientId: "1.2", analyticsConsent: "granted", adConsent: "granted" }),
    () => writeAdConsent(throwingAdmin, "orders", ORDER_ID, "granted", "test"),
    () => readAdConsent(throwingAdmin, "orders", ORDER_ID, "test"),
  ];
  for (const scenario of scenarios) {
    const { result, logs } = await captureLogs(async () => {
      try {
        return { threw: false, value: await scenario() };
      } catch {
        return { threw: true, value: null };
      }
    });
    assert.equal(result.threw, false, "een helper mag nooit throwen");
    assert.equal(logs.includes(SECRET), false, "het api_secret staat in de logs");
    assert.equal(logs.includes("api_secret"), false, "de MP-URL staat in de logs");
    assert.equal(logs.includes("google-analytics.com"), false, "de MP-URL staat in de logs");
  }
});

// ---------- opslag ----------

test("writeAdConsent: eigen update met alleen ad_consent; ontbrekende kolom is false, geen throw", async () => {
  {
    const { admin, updates } = fakeAdmin(orderTables({ ad_consent: "unknown" }));
    assert.equal(await writeAdConsent(admin, "orders", ORDER_ID, "granted", "test"), true);
    assert.deepEqual(updates, [{ table: "orders", values: { ad_consent: "granted" }, id: ORDER_ID }]);
  }
  {
    const { admin, updates } = fakeAdmin(orderTables(), { orders: ["ad_consent"] });
    const { result, logs } = await captureLogs(() => writeAdConsent(admin, "orders", ORDER_ID, "granted", "test"));
    assert.equal(result, false);
    assert.deepEqual(Object.keys(updates[0].values), ["ad_consent"]);
    assert.match(logs, /ad_consent schrijven mislukt/);
  }
  {
    // Een ongeldige waarde van de client wordt unknown, nooit doorgeschreven.
    const { admin, updates } = fakeAdmin(orderTables());
    await writeAdConsent(admin, "orders", ORDER_ID, "ja graag", "test");
    assert.deepEqual(updates[0].values, { ad_consent: "unknown" });
  }
});

test("readAdConsent: ontbrekende kolom is unknown", async () => {
  const { admin } = fakeAdmin(orderTables(), { orders: ["ad_consent"] });
  const { result } = await captureLogs(() => readAdConsent(admin, "orders", ORDER_ID, "test"));
  assert.equal(result, "unknown");
});

function trialTables(trial: Row = {}, code: Row = {}): Tables {
  return {
    trial_bookings: [
      {
        id: TRIAL_ID,
        is_test: false,
        source: "paid",
        session_id: SESSION_ID,
        trial_code_id: null,
        ga_client_id: "1234567890.1700000000",
        ga_session_id: "1700000001",
        ad_consent: "granted",
        action_page: null,
        ...trial,
      },
    ],
    class_sessions: [{ id: SESSION_ID, pillar: "yoga_mobility" }],
    trial_codes: [{ id: CODE_ID, code: "MOVENOW", max_uses: null, ...code }],
    catalogue: structuredClone(catalogue),
  };
}

test("storeTrialBookingGaMeta: twee losse updates, ad_consent nooit samen met de ga-id's", async () => {
  const tables = trialTables({ ga_client_id: null, ga_session_id: null, ad_consent: "unknown" });
  const { admin, updates } = fakeAdmin(tables);
  await storeTrialBookingGaMeta(admin, TRIAL_ID, {
    gaClientId: "99.88",
    gaSessionId: "1700000009",
    analyticsConsent: "granted",
    adConsent: "granted",
  });
  assert.deepEqual(updates, [
    { table: "trial_bookings", values: { ga_client_id: "99.88", ga_session_id: "1700000009" }, id: TRIAL_ID },
    { table: "trial_bookings", values: { ad_consent: "granted" }, id: TRIAL_ID },
  ]);
});

test("storeTrialBookingGaMeta: ontbrekende kolommen (migratie niet gepusht) loggen alleen", async () => {
  const { admin, updates } = fakeAdmin(trialTables(), {
    trial_bookings: ["ga_client_id", "ga_session_id", "ad_consent", "action_page"],
  });
  const { logs } = await captureLogs(() =>
    storeTrialBookingGaMeta(admin, TRIAL_ID, { gaClientId: "99.88", gaSessionId: "1", analyticsConsent: "granted", adConsent: "denied" }),
  );
  assert.equal(updates.length, 2, "beide updates zijn geprobeerd");
  assert.match(logs, /ga-id's schrijven mislukt/);
  assert.match(logs, /ad_consent schrijven mislukt/);
});

test("storeTrialBookingGaMeta: ongeldige client-invoer wordt niet geschreven", async () => {
  const { admin, updates } = fakeAdmin(trialTables());
  await storeTrialBookingGaMeta(admin, TRIAL_ID, {
    gaClientId: "<script>",
    gaSessionId: "abc",
    analyticsConsent: "granted",
    adConsent: "misschien",
  });
  assert.deepEqual(updates, [
    { table: "trial_bookings", values: { ad_consent: "unknown" }, id: TRIAL_ID },
  ]);
  const none = fakeAdmin(trialTables());
  await storeTrialBookingGaMeta(none.admin, TRIAL_ID, undefined);
  assert.equal(none.updates.length, 0);
});

test("server-vangrail: zonder analytische toestemming worden meegestuurde ga-id's weggegooid", async () => {
  const ids = { gaClientId: "99.88", gaSessionId: "1700000009" };
  // Pure regel, gedeeld door proefboekingen en orders (createOrderAndCheckout).
  assert.deepEqual(gaIdsForStorage({ ...ids, analyticsConsent: "granted" }), {
    ga_client_id: "99.88",
    ga_session_id: "1700000009",
  });
  for (const analyticsConsent of ["denied", "unknown", undefined, "", "GRANTED", "yes"]) {
    assert.equal(gaIdsForStorage({ ...ids, analyticsConsent }), null, String(analyticsConsent));
  }
  assert.equal(gaIdsForStorage(undefined), null);
  assert.equal(gaIdsForStorage({ analyticsConsent: "granted" }), null, "granted zonder id's schrijft niets");

  // De proefboeking: geen update van de id's, ad_consent wordt wel bewaard.
  for (const analyticsConsent of ["denied", "unknown", undefined]) {
    const tables = trialTables({ ga_client_id: null, ga_session_id: null, ad_consent: "unknown" });
    const { admin, updates } = fakeAdmin(tables);
    await storeTrialBookingGaMeta(admin, TRIAL_ID, { ...ids, analyticsConsent, adConsent: "granted" });
    assert.deepEqual(updates, [
      { table: "trial_bookings", values: { ad_consent: "granted" }, id: TRIAL_ID },
    ]);
    assert.equal(tables.trial_bookings[0].ga_client_id, null);

    // Zonder opgeslagen client_id vertrekt er geen trial_booked.
    const { fetchImpl, requests } = fakeFetch();
    const result = await sendTrialBookedToGa4(
      { trialBookingId: TRIAL_ID, amountCents: 1700 },
      { admin, fetchImpl, apiSecret: SECRET, isProduction: true },
    );
    assert.equal(result, "skipped");
    assert.equal(requests.length, 0);
  }
});

// ---------- trial_booked ----------

async function sendTrial(tables: Tables, args: { amountCents?: number | null } = {}, opts: { isProduction?: boolean; missing?: Record<string, string[]> } = {}) {
  const { admin, selects } = fakeAdmin(tables, opts.missing);
  const { fetchImpl, requests } = fakeFetch();
  const { result, logs } = await captureLogs(() =>
    sendTrialBookedToGa4(
      { trialBookingId: TRIAL_ID, ...args },
      { admin, fetchImpl, apiSecret: SECRET, isProduction: opts.isProduction ?? true },
    ),
  );
  const body = requests[0]?.body as { consent: Row; events: Array<{ name: string; params: Row }> } | undefined;
  return { result, requests, selects, logs, params: body?.events[0].params, body };
}

test("trial_booked paid: value is het Mollie-bedrag, geen code, geen action_page", async () => {
  const { result, params, body } = await sendTrial(trialTables(), { amountCents: 1700 });
  assert.equal(result, "sent");
  assert.equal(body!.events[0].name, "trial_booked");
  assert.deepEqual(params, {
    session_id: "1700000001",
    trial_type: "paid",
    pillar: "yoga_mobility",
    transaction_id: TRIAL_ID,
    currency: "EUR",
    value: 17,
  });
  assert.deepEqual(body!.consent, { ad_user_data: "GRANTED", ad_personalization: "DENIED" });
});

test("trial_booked code: gedeelde code letterlijk, unieke code als uniek, value uit tmc.catalogue", async () => {
  const shared = await sendTrial(trialTables({ source: "code", trial_code_id: CODE_ID }));
  assert.equal(shared.params!.trial_type, "code");
  assert.equal(shared.params!.code, "MOVENOW");
  assert.equal(shared.params!.value, 17);

  const unique = await sendTrial(
    trialTables({ source: "code", trial_code_id: CODE_ID }, { code: "AB12CD34", max_uses: 1 }),
  );
  assert.equal(unique.params!.code, "uniek");
  assert.equal(JSON.stringify(unique.body).includes("AB12CD34"), false);
});

test("trial_booked free: vrij trainen krijgt de prijs van drop_in uit de catalogus, op slug", async () => {
  const tables = trialTables({ source: "opening" });
  tables.class_sessions[0].pillar = "vrij_trainen";
  tables.catalogue.find((r) => r.slug === "drop_in")!.price_cents = 1850;
  const { params, selects } = await sendTrial(tables);
  assert.equal(params!.trial_type, "free");
  assert.equal(params!.pillar, "vrij_trainen");
  // De prijs volgt de catalogus, er staat geen bedrag in de code.
  assert.equal(params!.value, 18.5);
  assert.equal("code" in params!, false);
  assert.deepEqual(
    selects.filter((s) => s.table === "catalogue").map((s) => s.columns),
    [["price_cents"]],
  );
});

test("trial_booked: action_page gaat alleen mee als de kolom gevuld is", async () => {
  const without = await sendTrial(trialTables(), { amountCents: 1700 });
  assert.equal("action_page" in without.params!, false);
  const withPage = await sendTrial(trialTables({ action_page: "zomer-actie-2027" }), { amountCents: 1700 });
  assert.equal(withPage.params!.action_page, "zomer-actie-2027");
});

test("trial_booked: in productie nooit voor is_test, buiten productie wel als intern verkeer", async () => {
  const prod = await sendTrial(trialTables({ is_test: true }), { amountCents: 1700 }, { isProduction: true });
  assert.equal(prod.result, "skipped");
  assert.equal(prod.requests.length, 0);

  const preview = await sendTrial(trialTables({ is_test: true }), { amountCents: 1700 }, { isProduction: false });
  assert.equal(preview.result, "sent");
  assert.equal(preview.params!.traffic_type, "internal");
  assert.equal(preview.params!.debug_mode, true);
});

test("trial_booked: zonder ga_client_id of met ontbrekende kolommen stil overgeslagen", async () => {
  const noClient = await sendTrial(trialTables({ ga_client_id: null }), { amountCents: 1700 });
  assert.equal(noClient.result, "skipped");
  assert.equal(noClient.requests.length, 0);

  const notPushed = await sendTrial(trialTables(), { amountCents: 1700 }, {
    missing: { trial_bookings: ["ga_client_id", "ga_session_id", "ad_consent", "action_page"] },
  });
  assert.equal(notPushed.result, "skipped");
  assert.equal(notPushed.requests.length, 0);
});

test("trial_booked: ad_consent heeft een eigen select; ontbreekt alleen die kolom, dan DENIED en het event gaat door", async () => {
  const { result, body, selects } = await sendTrial(trialTables(), { amountCents: 1700 }, {
    missing: { trial_bookings: ["ad_consent"] },
  });
  assert.equal(result, "sent");
  assert.deepEqual(body!.consent, { ad_user_data: "DENIED", ad_personalization: "DENIED" });
  assert.deepEqual(
    selects.filter((s) => s.table === "trial_bookings").map((s) => s.columns),
    [
      ["id", "is_test", "source", "session_id", "trial_code_id"],
      ["ga_client_id", "ga_session_id", "action_page"],
      ["ad_consent"],
    ],
  );
});

test("geen user_id in welk verzoek dan ook", async () => {
  const trial = await sendTrial(trialTables({ source: "code", trial_code_id: CODE_ID }));
  assert.equal(JSON.stringify(trial.body).includes("user_id"), false);
  const { admin } = fakeAdmin(orderTables());
  const { fetchImpl, requests } = fakeFetch();
  await sendPurchaseToGa4({ orderId: ORDER_ID, amountCents: 15000 }, { admin, fetchImpl, apiSecret: SECRET, isProduction: true });
  assert.equal(JSON.stringify(requests[0].body).includes("user_id"), false);
});
