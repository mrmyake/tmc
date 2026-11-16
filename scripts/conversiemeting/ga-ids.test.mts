import { test } from "node:test";
import assert from "node:assert/strict";
import { readGaIds } from "../../src/lib/ga-ids.ts";
import { readGaSubmitMeta } from "../../src/lib/ga-submit-meta.ts";

// readGaIds (spec-conversiemeting.md): alleen id's bij analytische
// toestemming. Bij denied, geen keuze, een kapotte waarde of geblokkeerde
// storage: {} zonder gtag-aanroep en zonder cookie-lezing. Anders kan er een
// server-side event vertrekken voor iemand die analytisch heeft geweigerd
// (tijdelijke client_id in de cookieloze modus, of een achtergebleven
// _ga-cookie).

const V2 = (analytics: string, ads: string) => JSON.stringify({ v: 2, analytics, ads });
const STALE_COOKIE = "_ga=GA1.1.1111111111.1699999999; andere=1";

interface Probe {
  gtagCalls: unknown[][];
  cookieReads: number;
}

async function withBrowser<T>(
  opts: { stored: string | null; blockedStorage?: boolean; gtag?: boolean; cookie?: string },
  fn: (probe: Probe) => Promise<T>,
): Promise<T> {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  const probe: Probe = { gtagCalls: [], cookieReads: 0 };
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => {
        if (opts.blockedStorage) throw new Error("SecurityError");
        return key === "tmc_cookie_consent" ? opts.stored : null;
      },
    },
  };
  if (opts.gtag !== false) {
    // Zoals gtag in de cookieloze modus: geeft altijd een id terug.
    win.gtag = (...args: unknown[]) => {
      probe.gtagCalls.push(args);
      const [, , field, callback] = args as [string, string, string, (v: unknown) => void];
      callback(field === "client_id" ? "2222222222.1700000000" : "1700000001");
    };
  }
  g.window = win;
  g.document = {
    get cookie() {
      probe.cookieReads += 1;
      return opts.cookie ?? STALE_COOKIE;
    },
  };
  try {
    return await fn(probe);
  } finally {
    g.window = saved.window;
    g.document = saved.document;
  }
}

test("granted (v2): id's uit gtag", async () => {
  await withBrowser({ stored: V2("granted", "denied") }, async (probe) => {
    assert.deepEqual(await readGaIds(), {
      clientId: "2222222222.1700000000",
      sessionId: "1700000001",
    });
    assert.equal(probe.gtagCalls.length, 2);
  });
});

test("granted (oud formaat) telt ook", async () => {
  await withBrowser({ stored: "granted" }, async (probe) => {
    const ids = await readGaIds();
    assert.equal(ids.clientId, "2222222222.1700000000");
    assert.equal(probe.gtagCalls.length, 2);
  });
});

test("granted zonder geladen gtag: de cookie-fallback mag", async () => {
  await withBrowser({ stored: V2("granted", "granted"), gtag: false }, async (probe) => {
    assert.deepEqual(await readGaIds(), { clientId: "1111111111.1699999999", sessionId: undefined });
    assert.equal(probe.cookieReads, 1);
  });
});

const REFUSED: Array<[label: string, opts: { stored: string | null; blockedStorage?: boolean }]> = [
  ["denied (v2), ook met advertentiemeting aan", { stored: V2("denied", "granted") }],
  ["denied (v2)", { stored: V2("denied", "denied") }],
  ["denied (oud formaat)", { stored: "denied" }],
  ["geen keuze", { stored: null }],
  ["kapotte waarde", { stored: "{" }],
  ["onbekende versie", { stored: JSON.stringify({ v: 3, analytics: "granted", ads: "granted" }) }],
  ["geblokkeerde storage", { stored: V2("granted", "granted"), blockedStorage: true }],
];

for (const [label, opts] of REFUSED) {
  test(`${label}: {} zonder gtag-aanroep en zonder cookie-lezing`, async () => {
    // gtag zou een id geven en er staat een achtergebleven _ga-cookie.
    await withBrowser(opts, async (probe) => {
      assert.deepEqual(await readGaIds(), {});
      assert.equal(probe.gtagCalls.length, 0, "gtag is aangeroepen");
      assert.equal(probe.cookieReads, 0, "de cookie is gelezen");
    });
    // Ook zonder geladen gtag geen terugval op de cookie.
    await withBrowser({ ...opts, gtag: false }, async (probe) => {
      assert.deepEqual(await readGaIds(), {});
      assert.equal(probe.cookieReads, 0, "de cookie is gelezen");
    });
  });
}

test("zonder window (server): {}", async () => {
  assert.deepEqual(await readGaIds(), {});
});

test("readGaSubmitMeta stuurt beide keuzes mee, en geen id's zonder analytische toestemming", async () => {
  await withBrowser({ stored: V2("granted", "denied") }, async () => {
    assert.deepEqual(await readGaSubmitMeta(), {
      gaClientId: "2222222222.1700000000",
      gaSessionId: "1700000001",
      analyticsConsent: "granted",
      adConsent: "denied",
    });
  });
  await withBrowser({ stored: V2("denied", "granted") }, async (probe) => {
    assert.deepEqual(await readGaSubmitMeta(), {
      gaClientId: undefined,
      gaSessionId: undefined,
      analyticsConsent: "denied",
      adConsent: "granted",
    });
    assert.equal(probe.gtagCalls.length, 0);
    assert.equal(probe.cookieReads, 0);
  });
  await withBrowser({ stored: null, blockedStorage: true }, async () => {
    assert.deepEqual(await readGaSubmitMeta(), {
      gaClientId: undefined,
      gaSessionId: undefined,
      analyticsConsent: "unknown",
      adConsent: "unknown",
    });
  });
});
