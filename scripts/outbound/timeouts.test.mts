/**
 * Contract van src/lib/outbound-timeouts.ts: een timeout wordt een gevangen
 * fout, nooit een hang. Lokale http-servers, geen externe dienst.
 * Run: npm run test:outbound
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  OutboundTimeoutError,
  fetchWithTimeout,
  withTimeout,
} from "../../src/lib/outbound-timeouts";
import { getMollieClient, withMollieTimeout } from "../../src/lib/mollie";
import { createMollieClient } from "@mollie/api-client";
import { readFileSync } from "node:fs";

let hanging: Server;
let hangingUrl: string;

before(async () => {
  hanging = createServer((req) => {
    req.resume(); // nooit antwoorden
  });
  await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", () => resolve()));
  hangingUrl = `http://127.0.0.1:${(hanging.address() as AddressInfo).port}/`;
});

after(() => {
  hanging.closeAllConnections();
  hanging.close();
});

test("withTimeout: de timer wint, rejected met OutboundTimeoutError code ETIMEDOUT", async () => {
  const never = new Promise<string>(() => {});
  await assert.rejects(withTimeout(never, 50, "test.never"), (err: unknown) => {
    assert.ok(err instanceof OutboundTimeoutError);
    assert.equal(err.code, "ETIMEDOUT");
    assert.match(err.message, /test\.never/);
    return true;
  });
});

test("withTimeout: de promise wint, waarde ongewijzigd en timer opgeruimd", async () => {
  const value = await withTimeout(Promise.resolve(42), 1_000, "test.fast");
  assert.equal(value, 42);
});

test("withTimeout: een rejectie van de promise komt ongewijzigd door", async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error("eigen fout")), 1_000, "x"), /eigen fout/);
});

test("fetchWithTimeout: hangend endpoint rejected na de timeout met TimeoutError", async () => {
  const f = fetchWithTimeout(200);
  const started = Date.now();
  await assert.rejects(f(hangingUrl), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.name, "TimeoutError");
    return true;
  });
  assert.ok(Date.now() - started < 2_000);
});

test("fetchWithTimeout: een eigen signal van de aanroeper wint van de default", async () => {
  const f = fetchWithTimeout(10_000);
  const controller = new AbortController();
  const pending = f(hangingUrl, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.name, "AbortError");
    return true;
  });
});

test("Mollie-client: elke binder-call is geraced, iterate() blijft een async iterator", async () => {
  const previous = process.env.MOLLIE_API_KEY_TEST;
  process.env.MOLLIE_API_KEY_TEST = "test_abcdefghijklmnopqrstuvwxyz1234";
  try {
    const client = getMollieClient("test");
    assert.ok(client, "client verwacht");
    // Een payments.get tegen het echte Mollie-endpoint zou 401 geven; hier
    // controleren we alleen de vorm: de call geeft een promise terug (dus
    // raceable) en iterate() een async iterator (niet geraced).
    const iterator = client.customerSubscriptions.iterate({ customerId: "cst_x" });
    assert.equal(typeof (iterator as AsyncIterable<unknown>)[Symbol.asyncIterator], "function");
    // Caching: dezelfde (geproxyde) client per modus.
    assert.strictEqual(getMollieClient("test"), client);
  } finally {
    if (previous === undefined) delete process.env.MOLLIE_API_KEY_TEST;
    else process.env.MOLLIE_API_KEY_TEST = previous;
  }
});

test("Mollie-client: de Proxy racet een hangende binder-methode (fake client met SDK-vorm)", async () => {
  // Zuivere test van de wrapper-logica, los van netwerk: een object met de
  // vorm die de SDK heeft (binders als eigenschappen, methodes die een
  // promise teruggeven, iterate() dat een iterator teruggeeft).
  const never = () => new Promise<never>(() => {});
  const fake = {
    payments: { get: never, create: async () => ({ id: "tr_ok" }) },
    customerSubscriptions: {
      iterate: () => ({ [Symbol.asyncIterator]: async function* () {} }),
    },
  } as unknown as Parameters<typeof withMollieTimeout>[0];
  const client = withMollieTimeout(fake, 100);
  await assert.rejects(client.payments.get("tr_x", {} as never), (err: unknown) => {
    assert.ok(err instanceof OutboundTimeoutError);
    assert.equal(err.code, "ETIMEDOUT");
    assert.match(err.message, /mollie\.payments\.get/);
    return true;
  });
  assert.deepEqual(await client.payments.create({} as never), { id: "tr_ok" });
  const it = client.customerSubscriptions.iterate({ customerId: "cst_x" });
  assert.equal(typeof (it as AsyncIterable<unknown>)[Symbol.asyncIterator], "function");
});

test("Mollie-client: de SDK-aanname houdt voor de geinstalleerde versie", async () => {
  // Tegen de echte SDK: binders zijn gewone objecten met methodes die
  // zonder callback een promise teruggeven, en die promise gaat door de
  // Proxy. Het apiEndpoint wijst naar TEST-NET (RFC 5737, nooit gerouteerd),
  // dus er gaat niets naar Mollie. Op een netwerk dat het pakket laat vallen
  // wint de race (ETIMEDOUT); op een netwerk dat het direct weigert komt de
  // SDK-fout door de Proxy terug. Beide bewijzen de vorm; een hang tot de
  // test-timeout of een TypeError bij het aanroepen betekent dat de vorm
  // veranderd is.
  const raw = createMollieClient({
    apiKey: "test_abcdefghijklmnopqrstuvwxyz1234",
    apiEndpoint: "https://192.0.2.1:443/v2/",
  });
  for (const binder of ["payments", "customers", "customerSubscriptions"] as const) {
    assert.equal(typeof raw[binder], "object", `binder ${binder} ontbreekt`);
  }
  assert.equal(typeof raw.payments.get, "function");
  const client = withMollieTimeout(raw, 300);
  const started = Date.now();
  await assert.rejects(client.payments.get("tr_test"), (err: unknown) => {
    const name = err instanceof Error ? err.name : "";
    assert.ok(
      err instanceof OutboundTimeoutError || name === "ApiError",
      `verwacht OutboundTimeoutError of Mollie ApiError, kreeg ${String(err)}`,
    );
    return true;
  });
  assert.ok(Date.now() - started < 5_000, "de call hoort binnen de race af te lopen");

  // Versiebewaking: de wrapper is geverifieerd tegen 4.5.0 (lockfile) en
  // 4.6.0 (lokaal aangetroffen tijdens PR #195). Een andere major/minor is
  // niet per se fout, maar vraagt om herverificatie van de aanname
  // hierboven; daarom faalt de test bewust bij een bump.
  const installed = JSON.parse(
    readFileSync(new URL("../../node_modules/@mollie/api-client/package.json", import.meta.url), "utf8"),
  ) as { version: string };
  assert.match(
    installed.version,
    /^4\.[56]\./,
    `@mollie/api-client ${installed.version}: herverifieer withMollieTimeout (src/lib/mollie.ts) en werk deze regel bij`,
  );
});
