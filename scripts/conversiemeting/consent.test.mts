import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_KEY,
  adConsentFromParsed,
  analyticsConsentFromParsed,
  consentModeState,
  needsConsentPrompt,
  normalizeAdConsent,
  parseStoredConsent,
  serializeConsent,
} from "../../src/lib/consent-core.ts";
import { ensureConsentDefaults, type GateWindow } from "../../src/lib/analytics-gate-core.ts";

// De consentmapping (spec-conversiemeting.md): het v2-formaat, het oude
// formaat (alleen analytisch, nooit advertentie, banner eenmalig opnieuw),
// kapotte waarden, en wat de banner naar Consent Mode stuurt.

const V2 = (analytics: string, ads: string) => JSON.stringify({ v: 2, analytics, ads });

test("v2-formaat: beide categorieen worden gelezen, geen nieuwe prompt", () => {
  const parsed = parseStoredConsent(V2("granted", "denied"));
  assert.deepEqual(parsed, { choice: { analytics: "granted", ads: "denied" }, legacy: false });
  assert.equal(needsConsentPrompt(parsed), false);
  assert.equal(adConsentFromParsed(parsed), "denied");
  assert.equal(analyticsConsentFromParsed(parsed), "granted");

  const both = parseStoredConsent(V2("granted", "granted"));
  assert.equal(adConsentFromParsed(both), "granted");
  const adsOnly = parseStoredConsent(V2("denied", "granted"));
  assert.deepEqual(consentModeState(adsOnly), {
    analytics_storage: "denied",
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
  });
});

test("serialize en parse zijn elkaars omgekeerde", () => {
  for (const analytics of ["granted", "denied"] as const) {
    for (const ads of ["granted", "denied"] as const) {
      const raw = serializeConsent({ analytics, ads });
      assert.deepEqual(JSON.parse(raw), { v: 2, analytics, ads });
      assert.deepEqual(parseStoredConsent(raw), { choice: { analytics, ads }, legacy: false });
    }
  }
});

test("oude formaat granted: analytisch blijft, advertentie nooit, banner eenmalig opnieuw", () => {
  const parsed = parseStoredConsent("granted");
  assert.deepEqual(parsed, { choice: { analytics: "granted", ads: "denied" }, legacy: true });
  assert.equal(needsConsentPrompt(parsed), true);
  // Voor opslag is de advertentiekeuze onbekend: er is nooit om gevraagd.
  assert.equal(adConsentFromParsed(parsed), "unknown");
  assert.equal(analyticsConsentFromParsed(parsed), "granted");
  assert.deepEqual(consentModeState(parsed), {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
});

test("oude formaat denied: alles denied, banner eenmalig opnieuw", () => {
  const parsed = parseStoredConsent("denied");
  assert.equal(parsed?.legacy, true);
  assert.equal(needsConsentPrompt(parsed), true);
  assert.equal(adConsentFromParsed(parsed), "unknown");
  assert.equal(analyticsConsentFromParsed(parsed), "denied");
  assert.equal(consentModeState(parsed).analytics_storage, "denied");
  assert.equal(consentModeState(parsed).ad_user_data, "denied");
});

test("na een nieuwe keuze in v2 verschijnt de banner niet opnieuw", () => {
  const legacy = parseStoredConsent("granted");
  assert.equal(needsConsentPrompt(legacy), true);
  const saved = parseStoredConsent(serializeConsent({ analytics: "granted", ads: "denied" }));
  assert.equal(needsConsentPrompt(saved), false);
});

test("geen keuze of een onleesbare waarde: prompt, alles denied, opslag unknown", () => {
  const broken = [
    null,
    undefined,
    "",
    "misschien",
    "{",
    "null",
    "[]",
    "42",
    JSON.stringify({ v: 1, analytics: "granted", ads: "granted" }),
    JSON.stringify({ v: 3, analytics: "granted", ads: "granted" }),
    JSON.stringify({ v: 2, analytics: "granted" }),
    JSON.stringify({ v: 2, analytics: "yes", ads: "granted" }),
    JSON.stringify({ v: 2, analytics: "granted", ads: true }),
  ];
  for (const raw of broken) {
    const parsed = parseStoredConsent(raw);
    assert.equal(parsed, null, String(raw));
    assert.equal(needsConsentPrompt(parsed), true);
    assert.equal(adConsentFromParsed(parsed), "unknown");
    assert.equal(analyticsConsentFromParsed(parsed), "unknown");
    assert.deepEqual(consentModeState(parsed), {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
});

test("ad_personalization is in elke toestand denied", () => {
  for (const raw of ["granted", "denied", V2("granted", "granted"), V2("denied", "denied"), null]) {
    assert.equal(consentModeState(parseStoredConsent(raw)).ad_personalization, "denied");
  }
});

test("normalizeAdConsent: alleen de drie waarden", () => {
  assert.equal(normalizeAdConsent("granted"), "granted");
  assert.equal(normalizeAdConsent("denied"), "denied");
  for (const odd of ["unknown", "GRANTED", "", null, undefined, 1, {}]) {
    assert.equal(normalizeAdConsent(odd), "unknown");
  }
});

// ---- Consent Mode defaults van de gate ----

function gateWindow(stored: string | null): GateWindow {
  return { localStorage: { getItem: (key: string) => (key === CONSENT_KEY ? stored : null) } };
}

function defaultsFor(stored: string | null): Record<string, unknown> {
  const win = gateWindow(stored);
  ensureConsentDefaults(win);
  const first = Array.from(win.dataLayer![0] as ArrayLike<unknown>);
  assert.equal(first[0], "consent");
  assert.equal(first[1], "default");
  return first[2] as Record<string, unknown>;
}

test("gate-defaults: v2 met advertentiemeting aan zet ad_storage en ad_user_data op granted", () => {
  assert.deepEqual(defaultsFor(V2("granted", "granted")), {
    analytics_storage: "granted",
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
});

test("gate-defaults: oud formaat granted houdt analytisch aan en advertentie uit", () => {
  assert.deepEqual(defaultsFor("granted"), {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
});

test("gate-defaults: geen keuze is alles denied", () => {
  assert.deepEqual(defaultsFor(null), {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
});

// ---- consent.ts tegen een nep-window ----

type FakeWindow = {
  localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  gtag: (...args: unknown[]) => void;
  location: { href: string };
  dispatchEvent(e: Event): boolean;
};

async function withWindow<T>(
  stored: string | null,
  fn: (ctx: {
    calls: unknown[][];
    store: Map<string, string>;
    events: string[];
    consent: typeof import("../../src/lib/consent.ts");
  }) => T | Promise<T>,
): Promise<T> {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  const store = new Map<string, string>();
  if (stored !== null) store.set(CONSENT_KEY, stored);
  const calls: unknown[][] = [];
  const events: string[] = [];
  const win: FakeWindow = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    },
    gtag: (...args) => void calls.push(args),
    location: { href: "https://www.themovementclub.nl/proefles" },
    dispatchEvent: (e) => {
      events.push(e.type);
      return true;
    },
  };
  g.window = win;
  g.document = { title: "Proefles" };
  try {
    const consent = await import("../../src/lib/consent.ts");
    return await fn({ calls, store, events, consent });
  } finally {
    g.window = saved.window;
    g.document = saved.document;
  }
}

test("Accepteren: beide granted, opgeslagen als v2, pageview alsnog", async () => {
  await withWindow(null, ({ calls, store, consent }) => {
    assert.equal(consent.adConsentFromBanner(), "unknown");
    consent.setConsent({ analytics: "granted", ads: "granted" });
    assert.deepEqual(JSON.parse(store.get(CONSENT_KEY)!), { v: 2, analytics: "granted", ads: "granted" });
    assert.deepEqual(calls[0], [
      "consent",
      "update",
      {
        analytics_storage: "granted",
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "denied",
      },
    ]);
    assert.equal(calls[1][0], "event");
    assert.equal(calls[1][1], "page_view");
    assert.equal(consent.adConsentFromBanner(), "granted");
    assert.equal(consent.hasConsent(), true);
  });
});

test("Weigeren: beide denied, geen pageview", async () => {
  await withWindow(null, ({ calls, store, consent }) => {
    consent.setConsent({ analytics: "denied", ads: "denied" });
    assert.deepEqual(JSON.parse(store.get(CONSENT_KEY)!), { v: 2, analytics: "denied", ads: "denied" });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][2], {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    assert.equal(consent.adConsentFromBanner(), "denied");
    assert.equal(consent.getConsent(), "denied");
  });
});

test("keuze per categorie: alleen analytisch, of alleen advertentiemeting", async () => {
  await withWindow(null, ({ calls, consent }) => {
    consent.setConsent({ analytics: "granted", ads: "denied" });
    assert.deepEqual(calls[0][2], {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    assert.equal(consent.adConsentFromBanner(), "denied");
  });
  await withWindow(null, ({ calls, consent }) => {
    consent.setConsent({ analytics: "denied", ads: "granted" });
    assert.deepEqual(calls[0][2], {
      analytics_storage: "denied",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "denied",
    });
    assert.equal(calls.length, 1, "geen pageview zonder analytische toestemming");
    assert.equal(consent.adConsentFromBanner(), "granted");
  });
});

test("oude keuze granted: analytisch geldt nog, advertentie unknown, opnieuw opslaan geeft geen dubbele pageview", async () => {
  await withWindow("granted", ({ calls, consent }) => {
    assert.equal(consent.getConsent(), "granted");
    assert.equal(consent.adConsentFromBanner(), "unknown");
    assert.equal(consent.getStoredConsent()?.legacy, true);
    consent.setConsent({ analytics: "granted", ads: "granted" });
    assert.equal(calls.length, 1, "alleen de consent-update, geen tweede pageview");
    assert.equal(consent.getStoredConsent()?.legacy, false);
    assert.equal(consent.adConsentFromBanner(), "granted");
  });
});

test("openCookieSettings stuurt het heropen-event", async () => {
  await withWindow(V2("granted", "denied"), ({ events, consent }) => {
    consent.openCookieSettings();
    assert.deepEqual(events, [consent.COOKIE_SETTINGS_EVENT]);
  });
});

test("zonder window (server) en met geblokkeerde storage: geen keuze, unknown", async () => {
  const consent = await import("../../src/lib/consent.ts");
  assert.equal(consent.getStoredConsent(), null);
  assert.equal(consent.adConsentFromBanner(), "unknown");
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = g.window;
  g.window = {
    localStorage: {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
    },
  };
  try {
    assert.equal(consent.getConsent(), null);
    assert.equal(consent.adConsentFromBanner(), "unknown");
    assert.doesNotThrow(() => consent.setConsent({ analytics: "granted", ads: "granted" }));
  } finally {
    g.window = saved;
  }
});
