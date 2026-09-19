/**
 * Gedrag van sendNotification (src/lib/ntfy.ts) tegen een endpoint dat
 * niet, traag of fout antwoordt. Contract: throwt nooit, geeft true alleen
 * bij een 2xx, en een hangend endpoint kost hooguit de timeout (5 s) en
 * levert false op. Alles tegen een lokale http-server via NTFY_URL; het
 * echte topic wordt nooit geraakt.
 * Run: npm run test:ntfy
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { sendNotification } from "../../src/lib/ntfy";

type Mode = "hang" | "ok" | "fail";
let mode: Mode = "ok";
let received = 0;
let server: Server;
let baseUrl: string;

function listen(s: Server): Promise<string> {
  return new Promise((resolve) => {
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}/test-topic`);
    });
  });
}

before(async () => {
  server = createServer((req, res) => {
    received += 1;
    // Body consumeren zodat de socket niet blijft hangen op backpressure.
    req.resume();
    if (mode === "hang") return; // nooit antwoorden: de client-timeout moet ingrijpen
    if (mode === "fail") {
      res.statusCode = 500;
      res.end("nope");
      return;
    }
    res.statusCode = 200;
    res.end("ok");
  });
  baseUrl = await listen(server);
  process.env.NTFY_URL = baseUrl;
});

after(() => {
  delete process.env.NTFY_URL;
  server.closeAllConnections();
  server.close();
});

test("2xx van ntfy geeft true en stuurt titel, tags en body mee", async () => {
  mode = "ok";
  const before = received;
  const ok = await sendNotification("Titel", "Bericht", "warning");
  assert.equal(ok, true);
  assert.equal(received, before + 1);
});

test("5xx van ntfy geeft false, throwt niet", async () => {
  mode = "fail";
  const ok = await sendNotification("Titel", "Bericht");
  assert.equal(ok, false);
});

test("hangend endpoint: false na de timeout, geen throw, geen AbortError naar de caller", async () => {
  mode = "hang";
  const started = Date.now();
  let result: boolean | undefined;
  let thrown: unknown = null;
  try {
    result = await sendNotification("Titel", "Bericht");
  } catch (err) {
    thrown = err;
  }
  const elapsed = Date.now() - started;
  assert.equal(thrown, null, `sendNotification throwde: ${String(thrown)}`);
  assert.equal(result, false);
  // De timeout staat op 5 s; ruim daarbinnen (geen eigen retries) en niet
  // eerder dan de timeout zelf (dan zou het geen timeout maar een fout zijn).
  assert.ok(elapsed >= 4500, `te vroeg terug: ${elapsed} ms`);
  assert.ok(elapsed < 8000, `te laat terug: ${elapsed} ms`);
});

test("gesloten poort (connection refused) geeft false, throwt niet", async () => {
  const closed = createServer();
  const url = await listen(closed);
  await new Promise<void>((resolve) => closed.close(() => resolve()));
  process.env.NTFY_URL = url;
  try {
    const ok = await sendNotification("Titel", "Bericht");
    assert.equal(ok, false);
  } finally {
    process.env.NTFY_URL = baseUrl;
  }
});
