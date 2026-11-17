/**
 * Besluit B7 (spec-membership-flow.md): ntfy-meldingen over proefboekingen
 * zijn test bij de bestaande testmodus OF een testadres. Deel 1 test de
 * regel zelf (isTrialNotificationTest is puur en kent geen omgeving, dus
 * "op productie" is hier: testmodus false). Deel 2 leest de broncode van de
 * vier call-sites, omdat routes en server actions niet los te draaien zijn:
 * elke proefles-melding moet de vlag via deze ene functie bepalen, met het
 * e-mailadres van de boeking.
 * Run: npm run test:ntfy
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTrialNotificationTest } from "../../src/lib/test-email";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("+test-adres zonder testmodus (productie) geeft de vlag", () => {
  assert.equal(isTrialNotificationTest(false, "naam+test@example.com"), true);
  assert.equal(isTrialNotificationTest(false, "naam+conversietest@example.com"), true);
  assert.equal(isTrialNotificationTest(null, "naam+TEST@example.com"), true);
});

test("gewoon adres zonder testmodus geeft geen vlag", () => {
  assert.equal(isTrialNotificationTest(false, "naam@example.com"), false);
  assert.equal(isTrialNotificationTest(false, "test@example.com"), false);
  assert.equal(isTrialNotificationTest(undefined, null), false);
});

test("testmodus geeft de vlag altijd, ongeacht het adres", () => {
  assert.equal(isTrialNotificationTest(true, "naam@example.com"), true);
  assert.equal(isTrialNotificationTest(true, "naam+test@example.com"), true);
  assert.equal(isTrialNotificationTest(true, null), true);
});

interface Site {
  file: string;
  /** De exacte vlag-expressie en hoe vaak hij voorkomt. */
  flag: string;
  times: number;
  /** Totaal aantal sendNotification-aanroepen in het bestand. */
  notifications: number;
}

const SITES: Site[] = [
  {
    // Nieuwe proefles-boeking, Betaald na annulering, Betaald op geannuleerde sessie.
    file: "src/app/api/trial-bookings/webhook/route.ts",
    flag: "{ test: isTrialNotificationTest(trial.is_test, trial.email) }",
    times: 3,
    notifications: 3,
  },
  {
    // Betaling onbekend bij Mollie en de reconciliatie; de derde aanroep is
    // de circuit breaker, die hieronder apart wordt gecontroleerd.
    file: "src/app/api/cron/expire-trial-bookings/route.ts",
    flag: "{ test: isTrialNotificationTest(trial.is_test, trial.email) }",
    times: 2,
    notifications: 3,
  },
  {
    file: "src/lib/actions/trial-booking.ts",
    flag: "{ test: isTrialNotificationTest(args.isTest, args.email) }",
    times: 2,
    notifications: 2,
  },
  {
    file: "src/lib/actions/opening-trial.ts",
    flag: "{ test: isTrialNotificationTest(isTest, email) }",
    times: 1,
    notifications: 1,
  },
];

for (const site of SITES) {
  test(`${site.file}: elke proefles-melding bepaalt de vlag via isTrialNotificationTest`, () => {
    const src = read(site.file);
    assert.equal(count(src, "sendNotification("), site.notifications, "aantal meldingen gewijzigd: beoordeel de testvlag van de nieuwe aanroep");
    assert.equal(count(src, site.flag), site.times);
    assert.doesNotMatch(src, /\{ test: trial\.is_test/, "kale is_test als ntfy-vlag mist het testadres");
  });
}

test("circuit breaker in expire-trial-bookings telt testrijen volgens dezelfde regel (B3)", () => {
  const src = read("src/app/api/cron/expire-trial-bookings/route.ts");
  assert.equal(count(src, "if (isTrialNotificationTest(trial.is_test, trial.email)) notFoundTest += 1;"), 1);
  assert.equal(count(src, "{ test: notFound > 0 && notFoundTest === notFound }"), 1);
});

test("het e-mailadres van de boeking zit in de bestaande selects, geen aparte lookup", () => {
  for (const file of [
    "src/app/api/trial-bookings/webhook/route.ts",
    "src/app/api/cron/expire-trial-bookings/route.ts",
  ]) {
    const select = read(file).match(/"id,[^"]*is_test[^"]*"/);
    assert.ok(select, `${file}: select met is_test niet gevonden`);
    assert.match(select[0], /\bemail\b/, `${file}: email ontbreekt in de select`);
  }
});

test("B7 raakt alleen de ntfy-vlag: de Mollie-modus en is_test volgen het adres niet", () => {
  const cron = read("src/app/api/cron/expire-trial-bookings/route.ts");
  assert.equal(count(cron, 'const mode = trial.is_test ? "test" : "live";'), 1);
  const action = read("src/lib/actions/trial-booking.ts");
  assert.equal(count(action, "p_is_test: args.isTest,"), 1);
  const opening = read("src/lib/actions/opening-trial.ts");
  assert.equal(count(opening, "p_is_test: isTest,"), 1);
  for (const src of [cron, action, opening, read("src/app/api/trial-bookings/webhook/route.ts")]) {
    // De functie komt alleen voor in de import en als waarde van een ntfy-vlag
    // of de teller van de circuit breaker.
    const uses = count(src, "isTrialNotificationTest(");
    const asFlag = count(src, "test: isTrialNotificationTest(") + count(src, "if (isTrialNotificationTest(");
    assert.equal(uses, asFlag);
  }
});
