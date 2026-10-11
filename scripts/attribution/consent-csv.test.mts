import { test } from "node:test";
import assert from "node:assert/strict";
import { leadAttributionsCsv, LEAD_ATTRIBUTION_CSV_HEADER } from "../../src/lib/attribution/csv.ts";

// De bannerkeuze (test h) en de CSV-export (spec-marketing-attribution.md).
// consent.ts leest localStorage via src/lib/consent.ts; hier met een
// minimale window/localStorage-nep per toestand.

function withStorage<T>(value: string | null, fn: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const savedWindow = g.window;
  const savedStorage = g.localStorage;
  const storage = {
    getItem: (key: string) => (key === "tmc_cookie_consent" ? value : null),
  };
  g.window = { localStorage: storage };
  g.localStorage = storage;
  try {
    return fn();
  } finally {
    g.window = savedWindow;
    g.localStorage = savedStorage;
  }
}

test("test h: granted, denied en unknown uit de drie bannertoestanden", async () => {
  const { analyticsConsentFromBanner, leadAttributionForSubmit } = await import(
    "../../src/lib/attribution/consent.ts"
  );
  assert.equal(withStorage("granted", analyticsConsentFromBanner), "granted");
  assert.equal(withStorage("denied", analyticsConsentFromBanner), "denied");
  assert.equal(withStorage(null, analyticsConsentFromBanner), "unknown");
  // Een onbekende waarde in de sleutel telt als geen keuze.
  assert.equal(withStorage("misschien", analyticsConsentFromBanner), "unknown");

  // Zonder parameters gaat er niets mee (geen rij); met parameters de keuze erbij.
  assert.equal(withStorage("granted", () => leadAttributionForSubmit({})), undefined);
  assert.deepEqual(
    withStorage("denied", () => leadAttributionForSubmit({ gclid: "x", landing_path: "/proefles?gclid=x" })),
    { gclid: "x", landing_path: "/proefles?gclid=x", analytics_consent: "denied" },
  );
});

test("analyticsConsentFromBanner: geen window (server) is unknown, geblokkeerde storage ook", async () => {
  const { analyticsConsentFromBanner } = await import("../../src/lib/attribution/consent.ts");
  assert.equal(analyticsConsentFromBanner(), "unknown");
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = g.window;
  g.window = {};
  g.localStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
  };
  try {
    assert.equal(analyticsConsentFromBanner(), "unknown");
  } finally {
    g.window = saved;
    delete g.localStorage;
  }
});

test("CSV: kop, quoting en analytics_consent als laatste kolom", () => {
  const csv = leadAttributionsCsv([
    {
      createdAt: "2026-10-11T12:00:00.000Z",
      sourceType: "trial_booking",
      sourceId: "0f1e2d3c-4b5a-4968-8777-66554433aabb",
      status: "paid",
      bookingSource: "opening",
      email: "a@b.nl",
      gclid: "test123",
      gbraid: null,
      wbraid: null,
      fbclid: null,
      utmSource: "google",
      utmMedium: null,
      utmCampaign: 'herfst "actie"',
      utmTerm: null,
      utmContent: null,
      landingPath: "/proefles?gclid=test123",
      analyticsConsent: "granted",
    },
    {
      createdAt: "2026-10-11T12:05:00.000Z",
      sourceType: "trial_request",
      sourceId: "1f1e2d3c-4b5a-4968-8777-66554433aabb",
      status: "new",
      bookingSource: "",
      email: "c@d.nl",
      gclid: null,
      gbraid: null,
      wbraid: null,
      fbclid: "fb1",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      landingPath: null,
      analyticsConsent: "unknown",
    },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], LEAD_ATTRIBUTION_CSV_HEADER.map((h) => `"${h}"`).join(","));
  assert.equal(LEAD_ATTRIBUTION_CSV_HEADER.at(-1), "analytics_consent");
  assert.equal(
    lines[1],
    '"2026-10-11T12:00:00.000Z","trial_booking","0f1e2d3c-4b5a-4968-8777-66554433aabb","paid","opening","a@b.nl","test123","","","","google","","herfst ""actie""","","","/proefles?gclid=test123","granted"',
  );
  assert.equal(
    lines[2],
    '"2026-10-11T12:05:00.000Z","trial_request","1f1e2d3c-4b5a-4968-8777-66554433aabb","new","","c@d.nl","","","","fb1","","","","","","","unknown"',
  );
});
