/**
 * Unit tests voor de invoerregels van de workout-logger
 * (spec-trainingsprotocol.md PR 4 vervolg, fix/workout-logging):
 *   - parseWeightInput: komma, punt, heel getal, 0 (lichaamsgewicht),
 *     afsluitend scheidingsteken, te veel decimalen, te groot, negatief,
 *     letters, spaties;
 *   - parseRepsInput: geheel getal vanaf 1, 0, decimalen, letters, spaties;
 *   - formatWeightForInput: terug naar Nederlandse invoertekst;
 *   - isStaleDeploymentError: herkenning van de Next.js-melding.
 * Run: npm run test:workout-logging
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatWeightForInput,
  parseRepsInput,
  parseWeightInput,
  REPS_INVALID_COPY,
  REPS_MIN_COPY,
  WEIGHT_INVALID_COPY,
  WEIGHT_TOO_LARGE_COPY,
  WEIGHT_TOO_PRECISE_COPY,
} from "../../src/lib/member/workout-input";
import { isStaleDeploymentError } from "../../src/lib/member/stale-deployment";

// --- parseWeightInput ---------------------------------------------------

test("parseWeightInput: komma en punt geven dezelfde waarde", () => {
  assert.deepEqual(parseWeightInput("22,5"), { kind: "valid", value: 22.5 });
  assert.deepEqual(parseWeightInput("22.5"), { kind: "valid", value: 22.5 });
});

test("parseWeightInput: heel getal, twee decimalen, 0 is lichaamsgewicht", () => {
  assert.deepEqual(parseWeightInput("80"), { kind: "valid", value: 80 });
  assert.deepEqual(parseWeightInput("82,25"), { kind: "valid", value: 82.25 });
  assert.deepEqual(parseWeightInput("0"), { kind: "valid", value: 0 });
  assert.deepEqual(parseWeightInput("0,0"), { kind: "valid", value: 0 });
  assert.deepEqual(parseWeightInput(",5"), { kind: "valid", value: 0.5 });
});

test("parseWeightInput: spaties eromheen worden genegeerd, leeg is empty", () => {
  assert.deepEqual(parseWeightInput(" 80 "), { kind: "valid", value: 80 });
  assert.deepEqual(parseWeightInput(""), { kind: "empty" });
  assert.deepEqual(parseWeightInput("   "), { kind: "empty" });
});

test("parseWeightInput: afsluitend of los scheidingsteken is een tussenstand", () => {
  assert.deepEqual(parseWeightInput("82,"), { kind: "incomplete" });
  assert.deepEqual(parseWeightInput("82."), { kind: "incomplete" });
  assert.deepEqual(parseWeightInput(","), { kind: "incomplete" });
  assert.deepEqual(parseWeightInput("."), { kind: "incomplete" });
});

test("parseWeightInput: te veel decimalen en te groot geven een eigen melding", () => {
  assert.deepEqual(parseWeightInput("82,555"), { kind: "invalid", message: WEIGHT_TOO_PRECISE_COPY });
  assert.deepEqual(parseWeightInput("1000"), { kind: "invalid", message: WEIGHT_TOO_LARGE_COPY });
  assert.deepEqual(parseWeightInput("999,99"), { kind: "valid", value: 999.99 });
});

test("parseWeightInput: negatief, letters, spaties binnenin en dubbele tekens zijn ongeldig", () => {
  for (const raw of ["-5", "abc", "8 2", "82,,5", "82,5,5", "82.5.5", "8,2a", "+5"]) {
    assert.deepEqual(parseWeightInput(raw), { kind: "invalid", message: WEIGHT_INVALID_COPY }, raw);
  }
});

// --- parseRepsInput -----------------------------------------------------

test("parseRepsInput: geheel getal vanaf 1", () => {
  assert.deepEqual(parseRepsInput("8"), { kind: "valid", value: 8 });
  assert.deepEqual(parseRepsInput("12"), { kind: "valid", value: 12 });
  assert.deepEqual(parseRepsInput(" 10 "), { kind: "valid", value: 10 });
});

test("parseRepsInput: 0 is minimaal 1 rep", () => {
  assert.deepEqual(parseRepsInput("0"), { kind: "invalid", message: REPS_MIN_COPY });
  assert.deepEqual(parseRepsInput("00"), { kind: "invalid", message: REPS_MIN_COPY });
});

test("parseRepsInput: leeg is empty, decimalen en letters zijn ongeldig", () => {
  assert.deepEqual(parseRepsInput(""), { kind: "empty" });
  for (const raw of ["8,5", "8.5", "-3", "acht", "8x", "8 2"]) {
    assert.deepEqual(parseRepsInput(raw), { kind: "invalid", message: REPS_INVALID_COPY }, raw);
  }
});

// --- formatWeightForInput -------------------------------------------------

test("formatWeightForInput: opgeslagen waarde terug met komma", () => {
  assert.equal(formatWeightForInput(82.5), "82,5");
  assert.equal(formatWeightForInput(80), "80");
  assert.equal(formatWeightForInput(0), "0");
});

// --- isStaleDeploymentError ------------------------------------------------

test("isStaleDeploymentError: herkent de Next.js-melding in message, digest en cause", () => {
  assert.equal(isStaleDeploymentError(new Error("Failed to find Server Action \"abc\". This request might be from an older or newer deployment.")), true);
  assert.equal(isStaleDeploymentError({ message: "x", digest: "Failed to find Server Action" }), true);
  assert.equal(isStaleDeploymentError({ message: "wrapper", cause: new Error("older or newer deployment") }), true);
  assert.equal(isStaleDeploymentError("failed to find server action"), true);
});

test("isStaleDeploymentError: andere fouten niet", () => {
  assert.equal(isStaleDeploymentError(new Error("Failed to fetch")), false);
  assert.equal(isStaleDeploymentError(null), false);
  assert.equal(isStaleDeploymentError(undefined), false);
  assert.equal(isStaleDeploymentError(42), false);
});
