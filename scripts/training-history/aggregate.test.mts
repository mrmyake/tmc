/**
 * Unit tests voor de pure aggregatiefuncties van de trainingshistorie
 * (spec-trainingsprotocol.md PR 5 vervolg):
 *   - isBodyweightSets / topSetValue: bodyweight-detectie en topwaarde;
 *   - buildExerciseOptions: dedupe en sortering van gelogde oefeningen;
 *   - buildExerciseHistory: groeperen per sessie, de globale
 *     bodyweight-grafiekkeuze over alle sessies van een oefening heen,
 *     en de "versie"-markering voor een gearchiveerd schema;
 *   - buildPreviousLogsByExercise: "vorige keer" per exercise_id
 *     (weergave 1), matcht over schemaversies heen;
 *   - buildWorkoutSessions: per-workout lijst (weergave 3), inclusief
 *     een afgeronde sessie zonder gelogde sets.
 * Run: npm run test:training-history
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildExerciseHistory,
  buildExerciseOptions,
  buildPreviousLogsByExercise,
  buildWorkoutSessions,
  isBodyweightSets,
  topSetValue,
} from "../../src/lib/training-history/aggregate";
import type { HistoryRow, HistorySet, SessionMeta } from "../../src/lib/training-history/types";

function set(setNumber: number, weightKg: number, reps: number): HistorySet {
  return { setNumber, weightKg, reps, notes: null };
}

function row(overrides: Partial<HistoryRow> & { set: HistorySet }): HistoryRow {
  return {
    sessionId: "session-default",
    startedAt: "2026-10-01T10:00:00.000Z",
    completedAt: "2026-10-01T10:30:00.000Z",
    programId: "program-default",
    programVersion: 1,
    programStatus: "active",
    dayId: "day-default",
    dayNumber: 1,
    dayLabel: null,
    programExerciseId: "pe-default",
    slot: "A1",
    exerciseId: "ex-default",
    exerciseName: "Front Squat",
    ...overrides,
  };
}

// --- isBodyweightSets / topSetValue ------------------------------------

test("isBodyweightSets: alle sets gewicht 0 is bodyweight", () => {
  assert.equal(isBodyweightSets([set(1, 0, 10), set(2, 0, 9)]), true);
});

test("isBodyweightSets: één set met gewicht maakt het geen bodyweight meer", () => {
  assert.equal(isBodyweightSets([set(1, 0, 10), set(2, 5, 8)]), false);
});

test("isBodyweightSets: lege reeks is geen bodyweight", () => {
  assert.equal(isBodyweightSets([]), false);
});

test("topSetValue: bodyweight pakt de meeste reps", () => {
  assert.equal(topSetValue([set(1, 0, 10), set(2, 0, 12), set(3, 0, 9)], true), 12);
});

test("topSetValue: gewicht pakt het hoogste gewicht", () => {
  assert.equal(topSetValue([set(1, 80, 8), set(2, 82.5, 6), set(3, 77.5, 8)], false), 82.5);
});

test("topSetValue: lege reeks geeft 0", () => {
  assert.equal(topSetValue([], false), 0);
});

// --- buildExerciseOptions -----------------------------------------------

test("buildExerciseOptions: dedupe per exercise_id, meest recente lastLoggedAt eerst", () => {
  const rows: HistoryRow[] = [
    row({ exerciseId: "ex-squat", exerciseName: "Front Squat", startedAt: "2026-10-05T10:00:00.000Z", set: set(1, 80, 8) }),
    row({ exerciseId: "ex-squat", exerciseName: "Front Squat", startedAt: "2026-10-19T10:00:00.000Z", set: set(2, 82, 7) }),
    row({ exerciseId: "ex-chinup", exerciseName: "Chin-up", startedAt: "2026-10-12T10:00:00.000Z", set: set(1, 0, 10) }),
  ];
  const options = buildExerciseOptions(rows);
  assert.deepEqual(
    options.map((o) => o.exerciseId),
    ["ex-squat", "ex-chinup"],
  );
  assert.equal(options[0]?.lastLoggedAt, "2026-10-19T10:00:00.000Z");
});

// --- buildExerciseHistory -------------------------------------------------

test("buildExerciseHistory: groepeert per sessie, versie en archiefstatus kloppen", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-squat", startedAt: "2026-10-19T10:00:00.000Z", programVersion: 1, programStatus: "archived", set: set(1, 80, 8) }),
    row({ sessionId: "s1", exerciseId: "ex-squat", startedAt: "2026-10-19T10:00:00.000Z", programVersion: 1, programStatus: "archived", set: set(2, 77.5, 6) }),
    row({ sessionId: "s2", exerciseId: "ex-squat", startedAt: "2026-10-26T10:00:00.000Z", programVersion: 2, programStatus: "active", set: set(1, 82.5, 8) }),
  ];

  const result = buildExerciseHistory(rows, "ex-squat");

  assert.equal(result.isBodyweight, false);
  assert.equal(result.sessions.length, 2);
  // chronologisch, oudste eerst
  assert.equal(result.sessions[0]?.sessionId, "s1");
  assert.equal(result.sessions[0]?.isArchivedVersion, true);
  assert.equal(result.sessions[0]?.topValue, 80);
  assert.deepEqual(
    result.sessions[0]?.sets.map((s) => s.setNumber),
    [1, 2],
  );
  assert.equal(result.sessions[1]?.sessionId, "s2");
  assert.equal(result.sessions[1]?.isArchivedVersion, false);
  assert.equal(result.sessions[1]?.topValue, 82.5);
});

test("buildExerciseHistory: globaal bodyweight als alle sets van de oefening gewicht 0 hebben", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-chinup", startedAt: "2026-10-12T10:00:00.000Z", set: set(1, 0, 8) }),
    row({ sessionId: "s2", exerciseId: "ex-chinup", startedAt: "2026-10-19T10:00:00.000Z", set: set(1, 0, 10) }),
  ];
  const result = buildExerciseHistory(rows, "ex-chinup");
  assert.equal(result.isBodyweight, true);
  assert.equal(result.sessions[1]?.topValue, 10);
});

test("buildExerciseHistory: één gewogen set in de geschiedenis zet de hele grafiek op kg, ook eerdere sessies op 0", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-chinup", startedAt: "2026-10-12T10:00:00.000Z", set: set(1, 0, 10) }),
    row({ sessionId: "s2", exerciseId: "ex-chinup", startedAt: "2026-10-19T10:00:00.000Z", set: set(1, 5, 8) }),
  ];
  const result = buildExerciseHistory(rows, "ex-chinup");
  assert.equal(result.isBodyweight, false);
  assert.equal(result.sessions[0]?.topValue, 0);
  assert.equal(result.sessions[1]?.topValue, 5);
});

test("buildExerciseHistory: rijen van een andere oefening doen niet mee", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-squat", set: set(1, 80, 8) }),
    row({ sessionId: "s2", exerciseId: "ex-chinup", set: set(1, 0, 10) }),
  ];
  const result = buildExerciseHistory(rows, "ex-squat");
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0]?.sessionId, "s1");
});

// --- buildPreviousLogsByExercise -----------------------------------------

test("buildPreviousLogsByExercise: pakt de meest recente sessie per exercise_id", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-squat", startedAt: "2026-10-12T10:00:00.000Z", programVersion: 1, programStatus: "archived", set: set(1, 75, 8) }),
    row({ sessionId: "s2", exerciseId: "ex-squat", startedAt: "2026-10-19T10:00:00.000Z", programVersion: 1, programStatus: "archived", set: set(1, 80, 8) }),
    row({ sessionId: "s2", exerciseId: "ex-squat", startedAt: "2026-10-19T10:00:00.000Z", programVersion: 1, programStatus: "archived", set: set(2, 77.5, 6) }),
  ];

  const result = buildPreviousLogsByExercise(rows);
  const log = result.get("ex-squat");

  assert.ok(log);
  assert.equal(log?.sessionId, "s2");
  assert.equal(log?.isArchivedVersion, true);
  assert.deepEqual(
    log?.sets.map((s) => s.setNumber),
    [1, 2],
  );
});

test("buildPreviousLogsByExercise: huidige actieve versie heeft isArchivedVersion false", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-squat", startedAt: "2026-10-26T10:00:00.000Z", programVersion: 2, programStatus: "active", set: set(1, 82.5, 8) }),
  ];
  const log = buildPreviousLogsByExercise(rows).get("ex-squat");
  assert.equal(log?.isArchivedVersion, false);
});

test("buildPreviousLogsByExercise: twee verschillende oefeningen blijven apart", () => {
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", exerciseId: "ex-squat", startedAt: "2026-10-19T10:00:00.000Z", set: set(1, 80, 8) }),
    row({ sessionId: "s1", exerciseId: "ex-chinup", startedAt: "2026-10-19T10:00:00.000Z", set: set(1, 0, 10) }),
  ];
  const result = buildPreviousLogsByExercise(rows);
  assert.equal(result.size, 2);
  assert.ok(result.get("ex-squat"));
  assert.ok(result.get("ex-chinup"));
});

// --- buildWorkoutSessions -------------------------------------------------

function sessionMeta(overrides: Partial<SessionMeta>): SessionMeta {
  return {
    sessionId: "session-default",
    startedAt: "2026-10-01T10:00:00.000Z",
    completedAt: "2026-10-01T10:30:00.000Z",
    programVersion: 1,
    programStatus: "active",
    dayNumber: 1,
    dayLabel: null,
    ...overrides,
  };
}

test("buildWorkoutSessions: sessie zonder rijen krijgt exercises: [], niet weggefilterd", () => {
  const sessions: SessionMeta[] = [sessionMeta({ sessionId: "empty-session" })];
  const result = buildWorkoutSessions(sessions, []);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.exercises, []);
});

test("buildWorkoutSessions: oefeningen in slotvolgorde, nieuwste sessie eerst", () => {
  const sessions: SessionMeta[] = [
    sessionMeta({ sessionId: "s1", startedAt: "2026-10-12T10:00:00.000Z" }),
    sessionMeta({ sessionId: "s2", startedAt: "2026-10-19T10:00:00.000Z" }),
  ];
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", programExerciseId: "pe-b1", slot: "B1", exerciseId: "ex-row", set: set(1, 40, 10) }),
    row({ sessionId: "s1", programExerciseId: "pe-a1", slot: "A1", exerciseId: "ex-squat", set: set(1, 75, 8) }),
    row({ sessionId: "s2", programExerciseId: "pe-a1-v2", slot: "A1", exerciseId: "ex-squat", set: set(1, 80, 8) }),
  ];

  const result = buildWorkoutSessions(sessions, rows);

  assert.equal(result[0]?.sessionId, "s2");
  assert.equal(result[1]?.sessionId, "s1");
  assert.deepEqual(
    result[1]?.exercises.map((e) => e.slot),
    ["A1", "B1"],
  );
});

test("buildWorkoutSessions: bodyweight-vlag per oefening is lokaal aan de sessie", () => {
  const sessions: SessionMeta[] = [sessionMeta({ sessionId: "s1" })];
  const rows: HistoryRow[] = [
    row({ sessionId: "s1", programExerciseId: "pe-chinup", exerciseId: "ex-chinup", set: set(1, 0, 10) }),
    row({ sessionId: "s1", programExerciseId: "pe-chinup", exerciseId: "ex-chinup", set: set(2, 5, 8) }),
  ];
  const result = buildWorkoutSessions(sessions, rows);
  // niet alle sets van deze oefening in deze sessie zijn gewicht 0, dus lokaal geen bodyweight
  assert.equal(result[0]?.exercises[0]?.isBodyweight, false);
});
