/**
 * isTestEmail (src/lib/test-email.ts): de enige regel voor "dit adres is
 * een testadres". Een plus-tag waarin "test" voorkomt, hoofdletter-
 * ongevoelig; niets anders.
 * Run: npm run test:ntfy
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestEmail } from "../../src/lib/test-email";

test("wel: plus-tag met test", () => {
  assert.equal(isTestEmail("naam+test@example.com"), true);
  assert.equal(isTestEmail("naam+conversietest@example.com"), true);
  assert.equal(isTestEmail("naam+TEST@example.com"), true);
  assert.equal(isTestEmail("Naam+Test2@Example.com"), true);
  assert.equal(isTestEmail("naam+a+test@example.com"), true);
});

test("niet: zonder plus-tag", () => {
  assert.equal(isTestEmail("naam@example.com"), false);
  assert.equal(isTestEmail("test@example.com"), false);
  assert.equal(isTestEmail("tester@example.com"), false);
  assert.equal(isTestEmail("naam.test@example.com"), false);
});

test("niet: test voor de plus of in het domein", () => {
  assert.equal(isTestEmail("test+nieuwsbrief@example.com"), false);
  assert.equal(isTestEmail("naam@test.nl"), false);
  assert.equal(isTestEmail("naam+nieuwsbrief@test.nl"), false);
  assert.equal(isTestEmail("naam@sub+test.example.com"), false);
});

test("niet: lege of ongeldige invoer, throwt nooit", () => {
  assert.equal(isTestEmail(""), false);
  assert.equal(isTestEmail(null), false);
  assert.equal(isTestEmail(undefined), false);
  assert.equal(isTestEmail("geen-apenstaartje+test"), false);
  assert.equal(isTestEmail("@example.com"), false);
  assert.equal(isTestEmail(42 as unknown as string), false);
});
