import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrialCode,
  isValidTrialCodeFormat,
  TRIAL_CODE_ABUSE_RECIPIENTS,
} from "../../src/lib/trial-codes/normalize.ts";

// Proefcodes v2: de invoer-normalisatie moet gelijk zijn aan die in
// tmc.redeem_trial_code en tmc.create_trial_code (upper + strip [\s-]).

test("normalizeTrialCode: hoofdletters, spaties en koppeltekens", () => {
  const cases: [string, string][] = [
    ["abcd2345", "ABCD2345"],
    [" abcd 2345 ", "ABCD2345"],
    ["ab-cd-23-45", "ABCD2345"],
    ["\tflyer 2026\n", "FLYER2026"],
    ["", ""],
    ["   ", ""],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeTrialCode(input), expected, `input ${JSON.stringify(input)}`);
  }
});

test("isValidTrialCodeFormat: 4 tot 32 hoofdletters en cijfers", () => {
  assert.equal(isValidTrialCodeFormat("ABCD"), true);
  assert.equal(isValidTrialCodeFormat("FLYER2026"), true);
  assert.equal(isValidTrialCodeFormat("A".repeat(32)), true);
  assert.equal(isValidTrialCodeFormat("ABC"), false);
  assert.equal(isValidTrialCodeFormat("A".repeat(33)), false);
  assert.equal(isValidTrialCodeFormat("abcd"), false);
  assert.equal(isValidTrialCodeFormat("AB CD"), false);
  assert.equal(isValidTrialCodeFormat("AB_CD"), false);
});

test("misbruikmelding gaat naar Marlon en Ilja", () => {
  assert.deepEqual([...TRIAL_CODE_ABUSE_RECIPIENTS], [
    "marlon@themovementclub.nl",
    "me@ilja.com",
  ]);
});
