/**
 * Unit tests voor src/lib/equipment.ts (vorige waarden):
 *   - effectiveWeightStep: overschrijving van de coach wint, anders de
 *     standaard van het type, onbekend 2,5;
 *   - platesPerSide: lege stang bij 20 kg of minder, schijven per kant;
 *   - stepWeight / stepReps: grenzen en floating-point-ruis;
 *   - formatKg / formatDelta: Nederlandse notatie met komma.
 * Run: npm run test:workout-logging
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveWeightStep,
  formatDelta,
  formatKg,
  isEquipment,
  platesPerSide,
  stepOnGrid,
  stepReps,
  stepWeight,
} from "../../src/lib/equipment";

test("stepWeight: buiten het raster rondt de eerste tik af naar het raster in die richting", () => {
  assert.equal(stepWeight(42.5, 5, 1), 45);
  assert.equal(stepWeight(42.5, 5, -1), 40);
  assert.equal(stepWeight(41, 2.5, 1), 42.5);
  assert.equal(stepWeight(41, 2.5, -1), 40);
  assert.equal(stepWeight(17, 2, 1), 18);
  assert.equal(stepWeight(17, 2, -1), 16);
  // Daarna gewone stappen.
  assert.equal(stepWeight(45, 5, 1), 50);
  assert.equal(stepWeight(40, 5, -1), 35);
});

test("stepOnGrid: raster vanaf 0, geen ruis bij decimale stappen", () => {
  assert.equal(stepOnGrid(0.3, 0.1, 1), 0.4);
  assert.equal(stepOnGrid(22.5, 2.5, 1), 25);
  assert.equal(stepOnGrid(22.5, 2.5, -1), 20);
  assert.equal(stepOnGrid(null, 5, -1), -5);
});

test("effectiveWeightStep: standaard per type, onbekend 2,5", () => {
  assert.equal(effectiveWeightStep("barbell", null), 2.5);
  assert.equal(effectiveWeightStep("dumbbell", null), 2);
  assert.equal(effectiveWeightStep("machine", null), 5);
  assert.equal(effectiveWeightStep(null, null), 2.5);
});

test("effectiveWeightStep: overschrijving van de coach wint, ongeldige niet", () => {
  assert.equal(effectiveWeightStep("machine", 2.5), 2.5);
  assert.equal(effectiveWeightStep("machine", 0), 5);
  assert.equal(effectiveWeightStep("machine", -1), 5);
  assert.equal(effectiveWeightStep("machine", undefined), 5);
});

test("isEquipment: alleen de vijf bekende waarden", () => {
  assert.equal(isEquipment("barbell"), true);
  assert.equal(isEquipment("bodyweight"), true);
  assert.equal(isEquipment("cable"), false);
  assert.equal(isEquipment(null), false);
});

test("platesPerSide: lege stang tot en met 20 kg, daarna per kant", () => {
  assert.equal(platesPerSide(20), null);
  assert.equal(platesPerSide(0), null);
  assert.equal(platesPerSide(15), null);
  assert.equal(platesPerSide(22.5), 1.25);
  assert.equal(platesPerSide(60), 20);
  assert.equal(platesPerSide(102.5), 41.25);
});

test("stepWeight: stappen zonder ruis, nooit onder 0", () => {
  assert.equal(stepWeight(22.5, 2.5, 1), 25);
  // 0,1 staat niet op het raster van 0,2: de eerste tik rondt af naar 0,2.
  assert.equal(stepWeight(0.1, 0.2, 1), 0.2);
  assert.equal(stepWeight(0.2, 0.2, 1), 0.4);
  assert.equal(stepWeight(1, 2.5, -1), 0);
  assert.equal(stepWeight(null, 2, 1), 2);
  assert.equal(stepWeight(999, 5, 1), 999.99);
});

test("stepReps: nooit onder 0", () => {
  assert.equal(stepReps(5, 1), 6);
  assert.equal(stepReps(0, -1), 0);
  assert.equal(stepReps(null, 1), 1);
});

test("formatKg: komma als decimaalteken, geen eenheid", () => {
  assert.equal(formatKg(22.5), "22,5");
  assert.equal(formatKg(80), "80");
  assert.equal(formatKg(1.25), "1,25");
  assert.equal(formatKg(0), "0");
});

test("formatDelta: teken, komma, eenheid; null bij geen verschil", () => {
  assert.equal(formatDelta(2.5, "kg"), "+2,5 kg");
  assert.equal(formatDelta(-5, "kg"), "-5 kg");
  assert.equal(formatDelta(-1, "reps"), "-1 reps");
  assert.equal(formatDelta(0, "kg"), null);
});
