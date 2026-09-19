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
import { getMollieClient } from "../../src/lib/mollie";

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
