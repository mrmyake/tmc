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
import { encodeTitleHeader, sendNotification } from "../../src/lib/ntfy";

type Mode = "hang" | "ok" | "fail";
let mode: Mode = "ok";
let received = 0;
let lastTitle: string | undefined;
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
    lastTitle = req.headers["title"] as string | undefined;
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

test("NTFY_URL wordt op Vercel-productie genegeerd (guard), elders gehonoreerd", async () => {
  // Buiten productie (de tests hierboven) gaat het verkeer naar de lokale
  // server. Met VERCEL_ENV=production moet dezelfde override genegeerd
  // worden: het verzoek gaat dan naar het vaste topic, wat vanaf een
  // testmachine niet mag gebeuren. Daarom zetten we de override op een
  // gesloten poort en controleren we dat die NIET geraakt wordt: de
  // lokale server blijft op nul nieuwe requests, en fetch krijgt via een
  // afgeknepen omgeving geen kans het echte topic te bereiken doordat we
  // de globale fetch tijdelijk vervangen.
  const previousEnv = process.env.VERCEL_ENV;
  const previousUrl = process.env.NTFY_URL;
  const realFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  try {
    process.env.NTFY_URL = "http://127.0.0.1:9/override";
    process.env.VERCEL_ENV = "production";
    const ok = await sendNotification("Titel", "Bericht");
    assert.equal(ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0], "https://ntfy.sh/tmc-leads", "override hoort op productie genegeerd te worden");

    process.env.VERCEL_ENV = "preview";
    await sendNotification("Titel", "Bericht");
    assert.equal(seen[1], "http://127.0.0.1:9/override", "override hoort op preview gehonoreerd te worden");
  } finally {
    globalThis.fetch = realFetch;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    process.env.NTFY_URL = previousUrl;
  }
});

/**
 * TEST-prefix (spec-membership-flow.md, ntfy-testprefix). Uitgelezen op de
 * Title-header zoals de lokale server hem ontvangt. Productie wordt
 * nagebootst met VERCEL_ENV=production en een vervangen fetch, omdat de
 * NTFY_URL-override daar genegeerd wordt en het echte topic niet geraakt
 * mag worden.
 */
async function titleOnProduction(
  title: string,
  opts?: { test?: boolean },
): Promise<string | null> {
  const previousEnv = process.env.VERCEL_ENV;
  const realFetch = globalThis.fetch;
  let seen: string | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen = new Headers(init?.headers).get("Title");
    return new Response("ok", { status: 200 });
  }) as typeof fetch;
  try {
    process.env.VERCEL_ENV = "production";
    await sendNotification(title, "Bericht", "warning", opts);
  } finally {
    globalThis.fetch = realFetch;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  }
  return seen;
}

test("prefix bij test true, ook op productie", async () => {
  assert.equal(await titleOnProduction("Nieuwe proefles-boeking!", { test: true }), "TEST: Nieuwe proefles-boeking!");
});

test("prefix buiten productie, ook zonder testvlag (preview en lokaal)", async () => {
  mode = "ok";
  const previousEnv = process.env.VERCEL_ENV;
  try {
    delete process.env.VERCEL_ENV;
    await sendNotification("Lokaal", "Bericht");
    assert.equal(lastTitle, "TEST: Lokaal");
    process.env.VERCEL_ENV = "preview";
    await sendNotification("Preview", "Bericht", "warning", { test: false });
    assert.equal(lastTitle, "TEST: Preview");
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  }
});

test("geen prefix op productie zonder test", async () => {
  assert.equal(await titleOnProduction("Incasso gefaald"), "Incasso gefaald");
  assert.equal(await titleOnProduction("Incasso gefaald", { test: false }), "Incasso gefaald");
  assert.equal(await titleOnProduction("Incasso gefaald", {}), "Incasso gefaald");
});

test("nooit een dubbel prefix", async () => {
  assert.equal(await titleOnProduction("TEST: Al gemarkeerd", { test: true }), "TEST: Al gemarkeerd");
  mode = "ok";
  await sendNotification("TEST: Al gemarkeerd", "Bericht");
  assert.equal(lastTitle, "TEST: Al gemarkeerd");
  // Op productie zonder testvlag blijft een titel die toevallig zo begint ongewijzigd.
  assert.equal(await titleOnProduction("TEST: Al gemarkeerd"), "TEST: Al gemarkeerd");
});

/**
 * Access token, tweede topic, titelcodering en de terugval bij een
 * geweigerd token (spec-akiles-access.md, melding bij pincodegebruik). De
 * fetch wordt vervangen zodat URL, headers en body exact te inspecteren
 * zijn en er nooit een echt topic geraakt wordt.
 */
const FAKE_TOKEN = "tk_testtoken_nooit_echt_0123456789";

interface Seen {
  url: string;
  headers: Record<string, string>;
  rawHeaders: unknown;
  body: string;
}

async function withFakeNtfy<T>(
  env: Record<string, string | undefined>,
  respond: (call: Seen, index: number) => number,
  fn: (seen: Seen[], logs: string[]) => Promise<T>,
): Promise<T> {
  const realFetch = globalThis.fetch;
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const seen: Seen[] = [];
  const logs: string[] = [];
  const consoleMethods = ["log", "info", "warn", "error"] as const;
  const realConsole = consoleMethods.map((m) => console[m]);
  for (const m of consoleMethods) {
    console[m] = (...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: Seen = { url: String(input), headers, rawHeaders: init?.headers, body: String(init?.body) };
    seen.push(call);
    return new Response("x", { status: respond(call, seen.length - 1) });
  }) as typeof fetch;
  try {
    return await fn(seen, logs);
  } finally {
    globalThis.fetch = realFetch;
    consoleMethods.forEach((m, i) => {
      console[m] = realConsole[i];
    });
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const PROD = { VERCEL_ENV: "production", NTFY_URL: undefined };

test("met NTFY_ACCESS_TOKEN: Authorization Bearer op de post, ook op het standaardtopic", async () => {
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN }, () => 200, async (seen) => {
    assert.equal(await sendNotification("Titel", "Bericht", "warning"), true);
    assert.equal(await sendNotification("Deur", "Bericht", "key", { topic: "tmc-deur-test", priority: "high" }), true);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, "https://ntfy.sh/tmc-leads");
    assert.equal(seen[0].headers.authorization, `Bearer ${FAKE_TOKEN}`);
    assert.equal(seen[1].url, "https://ntfy.sh/tmc-deur-test");
    assert.equal(seen[1].headers.authorization, `Bearer ${FAKE_TOKEN}`);
    assert.equal(seen[1].headers.priority, "high");
  });
});

test("zonder NTFY_ACCESS_TOKEN: geen Authorization, headers exact zoals voorheen", async () => {
  for (const token of [undefined, "", "   "]) {
    await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: token }, () => 200, async (seen) => {
      assert.equal(await sendNotification("Incasso gefaald", "Bericht", "warning"), true);
      assert.equal(seen.length, 1);
      // Het ruwe headerobject is byte voor byte dat van voor deze wijziging.
      assert.deepEqual(seen[0].rawHeaders, { Title: "Incasso gefaald", Tags: "warning" });
      assert.equal(seen[0].url, "https://ntfy.sh/tmc-leads");
      assert.equal(seen[0].body, "Bericht");

      await sendNotification("Zonder tags", "Bericht");
      assert.deepEqual(seen[1].rawHeaders, { Title: "Zonder tags", Tags: "incoming_envelope" });
    });
  }
});

test("het token komt nooit in logs: bij succes, weigering, terugval, 5xx en een netwerkfout", async () => {
  const scenarios: Array<(call: Seen, i: number) => number> = [
    () => 200,
    () => 401,
    (_c, i) => (i === 0 ? 403 : 200),
    () => 500,
    () => {
      throw new Error("netwerk weg");
    },
  ];
  for (const respond of scenarios) {
    await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN }, respond, async (_seen, logs) => {
      await sendNotification("Titel", "Bericht");
      await sendNotification("Deur", "Bericht", "key", { topic: "tmc-deur-test" });
      const all = logs.join("\n");
      assert.doesNotMatch(all, /tk_/, "tokenwaarde in de log");
      assert.doesNotMatch(all, /Bearer|Authorization/i, "header in de log");
    });
  }
});

test("terugval: 401 of 403 met token geeft een anonieme herhaling naar tmc-leads, met de waarschuwingsregel", async () => {
  for (const status of [401, 403]) {
    await withFakeNtfy(
      { ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN },
      (_c, i) => (i === 0 ? status : 200),
      async (seen, logs) => {
        assert.equal(await sendNotification("Incasso gefaald", "Regel een\nRegel twee", "warning"), true);
        assert.equal(seen.length, 2);
        assert.equal(seen[0].headers.authorization, `Bearer ${FAKE_TOKEN}`);
        assert.equal(seen[1].url, "https://ntfy.sh/tmc-leads");
        assert.equal(seen[1].headers.authorization, undefined);
        assert.deepEqual(seen[1].rawHeaders, { Title: "Incasso gefaald", Tags: "warning" });
        assert.equal(
          seen[1].body,
          "Regel een\nRegel twee\n\nLet op: ntfy-token geweigerd, anoniem verstuurd.",
        );
        assert.ok(logs.some((l) => l.includes("Token geweigerd") && l.includes(String(status))));
      },
    );
  }
});

test("terugval nooit naar een topic uit opts.topic: geweigerd token op het deur-topic geeft false en een post", async () => {
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN }, () => 401, async (seen) => {
    const ok = await sendNotification("Code gebruikt: Fenna", "Voordeur", "key", { topic: "tmc-deur-test" });
    assert.equal(ok, false);
    assert.equal(seen.length, 1, "geen herhaling, en zeker niet naar tmc-leads");
    assert.equal(seen[0].url, "https://ntfy.sh/tmc-deur-test");
  });
});

test("terugval alleen bij 401 en 403 en alleen met token; mislukte terugval geeft false", async () => {
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN }, () => 500, async (seen) => {
    assert.equal(await sendNotification("Titel", "Bericht"), false);
    assert.equal(seen.length, 1);
  });
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: undefined }, () => 403, async (seen) => {
    assert.equal(await sendNotification("Titel", "Bericht"), false);
    assert.equal(seen.length, 1);
  });
  // tmc-leads op deny-all: ook de anonieme post wordt geweigerd.
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN }, () => 403, async (seen) => {
    assert.equal(await sendNotification("Titel", "Bericht"), false);
    assert.equal(seen.length, 2);
  });
});

test("ongeldig topic: niets verstuurd, nooit terug naar het standaardtopic", async () => {
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: FAKE_TOKEN }, () => 200, async (seen) => {
    for (const topic of ["", "a/b", "met spatie", "../tmc-leads", "x".repeat(65)]) {
      assert.equal(await sendNotification("Titel", "Bericht", "key", { topic }), false, topic);
    }
    assert.equal(seen.length, 0);
  });
});

test("topic met de NTFY_URL-testhaak: het topic vervangt het laatste padsegment; op productie genegeerd", async () => {
  await withFakeNtfy(
    { VERCEL_ENV: "preview", NTFY_URL: "http://127.0.0.1:9/test-topic", NTFY_ACCESS_TOKEN: undefined },
    () => 200,
    async (seen) => {
      await sendNotification("Titel", "Bericht");
      await sendNotification("Titel", "Bericht", "key", { topic: "tmc-deur-test" });
      assert.equal(seen[0].url, "http://127.0.0.1:9/test-topic");
      assert.equal(seen[1].url, "http://127.0.0.1:9/tmc-deur-test");
      assert.equal(seen[1].headers.title, "TEST: Titel", "TEST-prefix blijft buiten productie");
    },
  );
  await withFakeNtfy(
    { VERCEL_ENV: "production", NTFY_URL: "http://127.0.0.1:9/test-topic", NTFY_ACCESS_TOKEN: undefined },
    () => 200,
    async (seen) => {
      await sendNotification("Titel", "Bericht", "key", { topic: "tmc-deur-test" });
      assert.equal(seen[0].url, "https://ntfy.sh/tmc-deur-test");
    },
  );
});

function decodeRfc2047(value: string): string {
  const match = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/.exec(value);
  assert.ok(match, `geen RFC 2047 encoded-word: ${value}`);
  return Buffer.from(match[1], "base64").toString("utf8");
}

test("titel met niet-ASCII (ë, ł) gaat als RFC 2047 en komt heel aan; fetch gooit niet", async () => {
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: undefined }, () => 200, async (seen) => {
    for (const title of ["Code gebruikt: Zoë Janssen", "Code gebruikt: Michał Wiśniewski", "Proefles 💪"]) {
      assert.equal(await sendNotification(title, "Bericht"), true, title);
      const sent = seen[seen.length - 1].headers.title;
      assert.match(sent, /^[\x20-\x7E]+$/, "header is puur ASCII");
      assert.equal(decodeRfc2047(sent), title);
    }
  });
  // Tegen de echte fetch en de lokale server: zonder codering gooit undici
  // op "ł" een TypeError (en dus false); met codering komt de titel aan.
  mode = "ok";
  const previousEnv = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(await sendNotification("Michał", "Bericht", "key", { test: false }), true);
    assert.equal(decodeRfc2047(lastTitle ?? ""), "TEST: Michał");
  } finally {
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  }
});

test("puur ASCII-titel blijft byte voor byte gelijk", async () => {
  const titles = [
    "Incasso gefaald",
    "TEST: Nieuwe proefles-boeking!",
    "Akiles: token verversen mislukt",
    "Hormoonprofiel: kennismaking aangevraagd!",
    "~ !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}",
    "",
  ];
  for (const title of titles) {
    assert.equal(encodeTitleHeader(title), title);
    assert.ok(Buffer.from(encodeTitleHeader(title), "latin1").equals(Buffer.from(title, "utf8")));
  }
  await withFakeNtfy({ ...PROD, NTFY_ACCESS_TOKEN: undefined }, () => 200, async (seen) => {
    await sendNotification("Incasso gefaald", "Bericht");
    assert.equal((seen[0].rawHeaders as Record<string, string>).Title, "Incasso gefaald");
  });
});
