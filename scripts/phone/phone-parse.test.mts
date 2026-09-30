/**
 * parsePhone (src/lib/phone-parse.ts): elk geldig nummer naar E.164, default
 * land NL, al het andere ongeldig. Elke geldige uitkomst moet door
 * profiles_phone_e164 (^\+[1-9][0-9]{7,14}$) komen.
 * Run: npm run test:phone
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePhone } from "../../src/lib/phone-parse";
import { toE164 } from "../../src/lib/phone";

const DB_CHECK = /^\+[1-9][0-9]{7,14}$/;

const VALID: Array<[string, string]> = [
  // Nederlands mobiel, alle schrijfwijzen
  ["0612345678", "+31612345678"],
  ["06 12345678", "+31612345678"],
  ["06-12345678", "+31612345678"],
  ["06 12 34 56 78", "+31612345678"],
  ["06.12345678", "+31612345678"],
  ["+31612345678", "+31612345678"],
  ["+31 6 12345678", "+31612345678"],
  ["+316 12 34 56 78", "+31612345678"],
  ["0031612345678", "+31612345678"],
  ["0031 6 12345678", "+31612345678"],
  ["+31 (0)6 12345678", "+31612345678"],
  ["0031 (0)6 12345678", "+31612345678"],
  ["  06 12345678  ", "+31612345678"],
  // Nederlands vast is nu ook geldig (geen mobiel-eis)
  ["0201234567", "+31201234567"],
  ["020 123 4567", "+31201234567"],
  ["+31 20 123 4567", "+31201234567"],
  // Buitenlands
  ["+44 7911 123456", "+447911123456"],
  ["0044 7911 123456", "+447911123456"],
  ["+49 151 23456789", "+4915123456789"],
  ["+32 470 12 34 56", "+32470123456"],
  ["+32470123456", "+32470123456"],
  ["+1 202 456 1111", "+12024561111"],
];

for (const [input, expected] of VALID) {
  test(`geldig: ${JSON.stringify(input)}`, () => {
    assert.deepEqual(parsePhone(input), { ok: true, e164: expected });
    assert.match(expected, DB_CHECK);
  });
}

const INVALID: Array<[string, string, "empty" | "invalid"]> = [
  ["", "leeg", "empty"],
  ["   ", "alleen spaties", "empty"],
  ["+44 7700 900123", "UK, Ofcom-reeks voor fictieve nummers", "invalid"],
  ["06123456", "te kort", "invalid"],
  ["061234567890", "te lang", "invalid"],
  ["+3161234567890", "te lang internationaal", "invalid"],
  ["61234567", "te kort zonder voorloop", "invalid"],
  ["abc", "letters", "invalid"],
  ["+", "alleen plus", "invalid"],
  ["0", "alleen nul", "invalid"],
  ["0612345678 ext 5", "toevoeging valt anders stil weg", "invalid"],
  ["+999 12345678", "onbekende landcode", "invalid"],
  ["+49 151", "buitenlands te kort", "invalid"],
];

for (const [input, label, reason] of INVALID) {
  test(`ongeldig: ${label} (${JSON.stringify(input)})`, () => {
    assert.deepEqual(parsePhone(input), { ok: false, reason });
  });
}

test("toE164 blijft ongewijzigd voor tel:-links", () => {
  assert.equal(toE164("06 12345678"), "+31612345678");
  assert.equal(toE164("+31 6 12345678"), "+31612345678");
});
