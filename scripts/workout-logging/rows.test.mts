/**
 * Unit tests voor src/lib/member/workout-rows.ts (vorige waarden):
 *   - effectiveValues / canComplete: ghost als terugval, leeg gewicht
 *     blokkeert afvinken, bodyweight 0 niet;
 *   - materialize: lege velden krijgen de ghost als tekst;
 *   - intentOf: niet aangeraakt is nooit een save, draft versus afgevinkt,
 *     source alleen bij afvinken, delete bij leeggemaakt, geen save als
 *     stored al gelijk is, uitvinken is wel een save;
 *   - describeRow / visualOf: afgevinkt zonder waarden is ongeldig.
 * Run: npm run test:workout-logging
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canComplete,
  describeRow,
  effectiveValues,
  emptyRow,
  intentOf,
  materialize,
  rowFromStored,
  visualOf,
} from "../../src/lib/member/workout-rows";

const ghost = { weightKg: 80, reps: 5, fromPrevious: true };
const noWeightGhost = { weightKg: null, reps: 8, fromPrevious: false };

test("effectiveValues: lege velden vallen terug op de ghost", () => {
  const v = effectiveValues(emptyRow(), ghost);
  assert.deepEqual(v, { weightKg: 80, reps: 5, weightFromGhost: true, repsFromGhost: true });
});

test("effectiveValues: eigen invoer wint, ongeldig is null", () => {
  const row = { ...emptyRow(), weightRaw: "82,5", repsRaw: "x" };
  const v = effectiveValues(row, ghost);
  assert.equal(v.weightKg, 82.5);
  assert.equal(v.reps, null);
  assert.equal(v.weightFromGhost, false);
});

test("canComplete: zonder gewicht niet, met bodyweight 0 wel", () => {
  assert.equal(canComplete(emptyRow(), ghost), true);
  assert.equal(canComplete(emptyRow(), noWeightGhost), false);
  assert.equal(canComplete(emptyRow(), { weightKg: 0, reps: 10, fromPrevious: false }), true);
  assert.equal(canComplete({ ...emptyRow(), weightRaw: "20" }, noWeightGhost), true);
  assert.equal(canComplete(emptyRow(), undefined), false);
});

test("materialize: lege velden krijgen de ghost, gevulde blijven", () => {
  assert.deepEqual(materialize(emptyRow(), ghost), { weightRaw: "80", repsRaw: "5" });
  assert.deepEqual(materialize({ ...emptyRow(), weightRaw: "82,5" }, ghost), {
    weightRaw: "82,5",
    repsRaw: "5",
  });
  assert.deepEqual(materialize(emptyRow(), noWeightGhost), { weightRaw: "", repsRaw: "8" });
  assert.deepEqual(
    materialize(emptyRow(), { weightKg: 22.5, reps: 5, fromPrevious: true }),
    { weightRaw: "22,5", repsRaw: "5" },
  );
});

test("intentOf: een niet aangeraakte rij is nooit een save", () => {
  assert.deepEqual(intentOf(emptyRow(), ghost), { kind: "none" });
});

test("intentOf: aangepaste waarden gaan als draft, zonder source", () => {
  const row = { ...emptyRow(), weightRaw: "82,5", repsRaw: "5" };
  assert.deepEqual(intentOf(row, ghost), {
    kind: "save",
    weightKg: 82.5,
    reps: 5,
    completed: false,
    source: null,
  });
});

test("intentOf: afvinken met de ghost-waarden geeft source previous", () => {
  const row = { ...emptyRow(), ...materialize(emptyRow(), ghost), completed: true };
  assert.deepEqual(intentOf(row, ghost), {
    kind: "save",
    weightKg: 80,
    reps: 5,
    completed: true,
    source: "previous",
  });
});

test("intentOf: afvinken met afwijkende waarden geeft source edited", () => {
  const row = { ...emptyRow(), weightRaw: "82,5", repsRaw: "4", completed: true };
  const intent = intentOf(row, ghost);
  assert.equal(intent.kind, "save");
  if (intent.kind === "save") assert.equal(intent.source, "edited");
});

test("intentOf: geen save als stored al gelijk is, wel bij uitvinken", () => {
  const stored = { weightKg: 80, reps: 5, completed: true, source: "previous" as const };
  const row = rowFromStored(stored);
  assert.deepEqual(intentOf(row, ghost), { kind: "none" });
  const unticked = { ...row, completed: false };
  assert.deepEqual(intentOf(unticked, ghost), {
    kind: "save",
    weightKg: 80,
    reps: 5,
    completed: false,
    source: null,
  });
});

test("intentOf: beide velden leeg op een opgeslagen draft verwijdert de set", () => {
  const row = {
    ...rowFromStored({ weightKg: 80, reps: 5, completed: false, source: null }),
    weightRaw: "",
    repsRaw: "",
  };
  assert.deepEqual(intentOf(row, ghost), { kind: "delete" });
});

test("intentOf: beide velden leeg op een afgevinkte rij doet niets", () => {
  const row = {
    ...rowFromStored({ weightKg: 80, reps: 5, completed: true, source: "previous" }),
    weightRaw: "",
    repsRaw: "",
  };
  assert.deepEqual(intentOf(row, ghost), { kind: "none" });
  assert.equal(describeRow(row).status, "invalid");
});

test("intentOf: tussenstand of ongeldige invoer is geen save", () => {
  assert.deepEqual(intentOf({ ...emptyRow(), weightRaw: "82,", repsRaw: "5" }, ghost), {
    kind: "none",
  });
  assert.deepEqual(intentOf({ ...emptyRow(), weightRaw: "abc", repsRaw: "5" }, ghost), {
    kind: "none",
  });
});

test("visualOf: ghost, gevuld, afgevinkt", () => {
  assert.equal(visualOf(emptyRow()), "ghost");
  assert.equal(visualOf({ ...emptyRow(), repsRaw: "6" }), "filled");
  assert.equal(
    visualOf(rowFromStored({ weightKg: 80, reps: 5, completed: false, source: null })),
    "filled",
  );
  assert.equal(visualOf({ ...emptyRow(), completed: true }), "completed");
});

test("describeRow: een veld leeg op een afgevinkte rij is ongeldig", () => {
  const row = { ...emptyRow(), weightRaw: "80", repsRaw: "", completed: true };
  assert.equal(describeRow(row).status, "invalid");
});
