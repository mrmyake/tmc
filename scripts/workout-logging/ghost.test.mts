/**
 * Unit tests voor src/lib/member/workout-ghost.ts (vorige waarden):
 *   - buildGhostSets: per setnummer, laatste gedane set bij minder sets
 *     vorige keer, startgewicht en reps_min zonder historie, bodyweight
 *     zonder startgewicht is 0, anders leeg;
 *   - sourceFor: previous bij gelijk aan de ghost, anders edited;
 *   - deltaFromPrevious: alleen bij historie en alleen bij verschil;
 *   - daysBetweenAmsterdam: kalenderdagen, ook over middernacht heen.
 * Run: npm run test:workout-logging
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGhostSets,
  daysBetweenAmsterdam,
  deltaFromPrevious,
  sourceFor,
} from "../../src/lib/member/workout-ghost";

const previous = [
  { setNumber: 1, weightKg: 80, reps: 5 },
  { setNumber: 2, weightKg: 82.5, reps: 4 },
];

test("buildGhostSets: per setnummer uit de historie", () => {
  const ghost = buildGhostSets(
    { sets: 2, repsMin: 5, startWeightKg: null, equipment: "barbell" },
    previous,
  );
  assert.deepEqual(ghost[1], { weightKg: 80, reps: 5, fromPrevious: true });
  assert.deepEqual(ghost[2], { weightKg: 82.5, reps: 4, fromPrevious: true });
});

test("buildGhostSets: minder sets vorige keer, de laatste gedane set vult aan", () => {
  const ghost = buildGhostSets(
    { sets: 4, repsMin: 5, startWeightKg: 60, equipment: "barbell" },
    previous,
  );
  assert.deepEqual(ghost[3], { weightKg: 82.5, reps: 4, fromPrevious: true });
  assert.deepEqual(ghost[4], { weightKg: 82.5, reps: 4, fromPrevious: true });
});

test("buildGhostSets: gaten in de setnummers vallen terug op de laatste set", () => {
  const ghost = buildGhostSets(
    { sets: 3, repsMin: 8, startWeightKg: null, equipment: "machine" },
    [{ setNumber: 3, weightKg: 50, reps: 10 }],
  );
  assert.deepEqual(ghost[1], { weightKg: 50, reps: 10, fromPrevious: true });
  assert.deepEqual(ghost[3], { weightKg: 50, reps: 10, fromPrevious: true });
});

test("buildGhostSets: geen historie, startgewicht van de coach en reps_min", () => {
  const ghost = buildGhostSets(
    { sets: 2, repsMin: 8, startWeightKg: 40, equipment: "dumbbell" },
    [],
  );
  assert.deepEqual(ghost[1], { weightKg: 40, reps: 8, fromPrevious: false });
  assert.deepEqual(ghost[2], { weightKg: 40, reps: 8, fromPrevious: false });
});

test("buildGhostSets: geen historie en geen startgewicht, gewicht leeg", () => {
  const ghost = buildGhostSets(
    { sets: 1, repsMin: 8, startWeightKg: null, equipment: "barbell" },
    null,
  );
  assert.deepEqual(ghost[1], { weightKg: null, reps: 8, fromPrevious: false });
});

test("buildGhostSets: bodyweight zonder startgewicht is 0, niet leeg", () => {
  const ghost = buildGhostSets(
    { sets: 1, repsMin: 10, startWeightKg: null, equipment: "bodyweight" },
    undefined,
  );
  assert.deepEqual(ghost[1], { weightKg: 0, reps: 10, fromPrevious: false });
});

test("buildGhostSets: bodyweight met startgewicht gebruikt dat als extra gewicht", () => {
  const ghost = buildGhostSets(
    { sets: 1, repsMin: 10, startWeightKg: 10, equipment: "bodyweight" },
    [],
  );
  assert.deepEqual(ghost[1], { weightKg: 10, reps: 10, fromPrevious: false });
});

test("sourceFor: previous bij gelijk, edited bij afwijking of zonder ghost", () => {
  const ghost = { weightKg: 80, reps: 5, fromPrevious: true };
  assert.equal(sourceFor(ghost, 80, 5), "previous");
  assert.equal(sourceFor(ghost, 82.5, 5), "edited");
  assert.equal(sourceFor(ghost, 80, 4), "edited");
  assert.equal(sourceFor({ weightKg: null, reps: 8, fromPrevious: false }, 20, 8), "edited");
  assert.equal(sourceFor(undefined, 20, 8), "edited");
});

test("sourceFor: startgewicht ongewijzigd overgenomen telt ook als previous", () => {
  assert.equal(sourceFor({ weightKg: 40, reps: 8, fromPrevious: false }, 40, 8), "previous");
});

test("deltaFromPrevious: alleen met historie en alleen bij verschil", () => {
  const ghost = { weightKg: 80, reps: 5, fromPrevious: true };
  assert.deepEqual(deltaFromPrevious(ghost, 82.5, 4), { weightKg: 2.5, reps: -1 });
  assert.equal(deltaFromPrevious(ghost, 80, 5), null);
  assert.equal(deltaFromPrevious({ weightKg: 40, reps: 8, fromPrevious: false }, 42, 8), null);
  assert.equal(deltaFromPrevious(undefined, 42, 8), null);
});

test("daysBetweenAmsterdam: kalenderdagen in Amsterdam, niet 24-uursblokken", () => {
  // 23:30 Amsterdam (21:30Z in de zomer) naar 00:30 de volgende dag: 1 dag.
  assert.equal(
    daysBetweenAmsterdam(new Date("2026-07-01T21:30:00Z"), new Date("2026-07-01T22:30:00Z")),
    1,
  );
  assert.equal(
    daysBetweenAmsterdam(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-04T09:00:00Z")),
    3,
  );
  assert.equal(
    daysBetweenAmsterdam(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-01T18:00:00Z")),
    0,
  );
});
