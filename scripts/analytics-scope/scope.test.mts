import { test } from "node:test";
import assert from "node:assert/strict";
import { isMeasuredPath } from "../../src/lib/analytics-scope.ts";
import {
  syncGate,
  ensureConsentDefaults,
  buildGaConfig,
  hasStaffCookie,
  isStaffRole,
  disableKey,
  installHistoryGuard,
  type GateWindow,
} from "../../src/lib/analytics-gate-core.ts";

const MEASURED = [
  "/", "/over", "/aanbod", "/prijzen", "/rooster", "/contact", "/proefles",
  "/proefles/boeken", "/proefles/boeken/bedankt", "/proefles/code",
  "/proefles/gratis", "/welke-yoga-past-bij-jou", "/yoga", "/yoga/hatha",
  "/yoga/docenten/anna", "/12-weken-programma", "/12-weken-programma/intake",
  "/huisregels", "/voorwaarden", "/privacybeleid", "/abonnement", "/kopen",
];
const NOT_MEASURED = [
  "/app", "/app/rooster", "/app/admin/rooster", "/app/trainer", "/kiosk",
  "/kiosk/paneel", "/checkin", "/studio", "/studio/structure", "/login",
  "/auth/callback", "/factuur/betalen/abc", "/betaal/abc",
  "/proefles/annuleren/abc", "/proefles/annuleren", "/onbegeleide-toegang",
  "/early-member", "/intake", "/onbekend", "/proefles-extra", "/over-ons",
  "", null, undefined,
];

test("gemeten paden", () => {
  for (const p of MEASURED) assert.equal(isMeasuredPath(p), true, p);
});

test("niet gemeten paden en onbekend pad", () => {
  for (const p of NOT_MEASURED) assert.equal(isMeasuredPath(p), false, String(p));
});

test("trailing slash en querystring", () => {
  assert.equal(isMeasuredPath("/prijzen/"), true);
  assert.equal(isMeasuredPath("/prijzen?utm_source=x"), true);
  assert.equal(isMeasuredPath("/?utm_source=x"), true);
  assert.equal(isMeasuredPath("/proefles/boeken/?a=1#x"), true);
  assert.equal(isMeasuredPath("/proefles/annuleren/abc/"), false);
  assert.equal(isMeasuredPath("/app/rooster?x=1"), false);
  assert.equal(isMeasuredPath("/login/"), false);
});

const web = { isNativePlatform: () => false };
const native = { isNativePlatform: () => true };

test("gate: web, marketing laadt, ga-disable false", () => {
  const win: GateWindow = {};
  assert.equal(syncGate(win, "/prijzen", web), true);
  assert.equal(win[disableKey()], false);
});

test("gate: web, product laadt niet, ga-disable true, in beide richtingen", () => {
  const win: GateWindow = {};
  assert.equal(syncGate(win, "/app/rooster", web), false);
  assert.equal(win[disableKey()], true);
  assert.equal(syncGate(win, "/", web), true);
  assert.equal(win[disableKey()], false);
  assert.equal(syncGate(win, "/login", web), false);
  assert.equal(win[disableKey()], true);
});

test("gate: gemockte Capacitor native true, nooit laden, ook op marketing", () => {
  const win: GateWindow = {};
  assert.equal(syncGate(win, "/", native, ), false);
  assert.equal(win[disableKey()], true);
  assert.equal(win.dataLayer, undefined);
  assert.equal(win.gtag, undefined);
  assert.equal(syncGate(win, "/prijzen", native), false);
  assert.equal(win[disableKey()], true);
});

test("gate: Capacitor die throwt telt als web", () => {
  const win: GateWindow = {};
  const broken = { isNativePlatform: () => { throw new Error("x"); } };
  assert.equal(syncGate(win, "/", broken), true);
});

test("consent defaults: eenmalig, zelfde inhoud, granted uit localStorage", () => {
  const win: GateWindow = { localStorage: { getItem: () => null } };
  ensureConsentDefaults(win);
  ensureConsentDefaults(win);
  assert.equal(win.dataLayer!.length, 1);
  const call = Array.from(win.dataLayer![0] as ArrayLike<unknown>);
  assert.deepEqual(call, [
    "consent", "default",
    {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied",
      wait_for_update: 500,
    },
  ]);
  const granted: GateWindow = { localStorage: { getItem: () => "granted" } };
  ensureConsentDefaults(granted);
  const gc = Array.from(granted.dataLayer![0] as ArrayLike<unknown>);
  assert.equal((gc[2] as Record<string, unknown>).analytics_storage, "granted");
});

test("config: traffic_type internal bij staff-cookie of niet-productie", () => {
  assert.deepEqual(buildGaConfig("", true), { send_page_view: false });
  assert.deepEqual(buildGaConfig("a=1; tmc_staff=1", true), {
    send_page_view: false, traffic_type: "internal",
  });
  assert.deepEqual(buildGaConfig("", false), {
    send_page_view: false, traffic_type: "internal",
  });
  assert.equal(hasStaffCookie("tmc_staff=0"), false);
  assert.equal(hasStaffCookie("x_tmc_staff=1"), false);
});

test("staff-rol: alleen admin en trainer", () => {
  assert.equal(isStaffRole("admin"), true);
  assert.equal(isStaffRole("trainer"), true);
  assert.equal(isStaffRole("member"), false);
  assert.equal(isStaffRole(undefined), false);
});

test("history guard: ga-disable volgt de bestemming voor de history-call", () => {
  const seen: unknown[] = [];
  const win: any = {
    location: { href: "https://x.nl/prijzen" },
    history: {
      pushState: () => { seen.push(win["ga-disable-G-2VFCDM4KRZ"]); },
      replaceState: () => {},
    },
  };
  installHistoryGuard(win, { isNativePlatform: () => false });
  installHistoryGuard(win, { isNativePlatform: () => false });
  win.history.pushState({}, "", "/login");
  win.history.pushState({}, "", "/prijzen");
  win.history.pushState({}, "", "/app/rooster?x=1");
  assert.deepEqual(seen, [true, false, true]);
});
