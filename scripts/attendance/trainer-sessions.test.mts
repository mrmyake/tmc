/**
 * Contract van src/lib/trainer/sessions-window.ts (check-in-spoor PR 4):
 * /app/trainer/sessies toont naast de komende vier weken ook de lessen van
 * vandaag die bezig of afgelopen zijn maar nog niet zijn afgesloten, en
 * markeert die. Run: npm run test:attendance
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SESSION_PHASE_LABEL,
  sessionPhase,
  TRAINER_SESSIONS_HORIZON_DAYS,
  trainerSessionsWindow,
} from "../../src/lib/trainer/sessions-window";

// Vrijdagavond 23 oktober 2026, 22:30 in Amsterdam (CEST).
const NOW = new Date("2026-10-23T20:30:00.000Z");

test("venster: vandaag loopt van middernacht tot middernacht Europe/Amsterdam", () => {
  const w = trainerSessionsWindow(NOW);
  assert.equal(w.nowIso, "2026-10-23T20:30:00.000Z");
  assert.equal(w.dayStartIso, "2026-10-22T22:00:00.000Z");
  assert.equal(w.dayEndIso, "2026-10-23T22:00:00.000Z");
  assert.equal(
    w.horizonIso,
    new Date(NOW.getTime() + TRAINER_SESSIONS_HORIZON_DAYS * 86_400_000).toISOString(),
  );
  assert.equal(TRAINER_SESSIONS_HORIZON_DAYS, 28);
});

test("venster: komend, of vandaag en nog niet afgesloten", () => {
  const w = trainerSessionsWindow(NOW);
  assert.equal(
    w.orFilter,
    "start_at.gte.2026-10-23T20:30:00.000Z,and(closed_at.is.null,start_at.gte.2026-10-22T22:00:00.000Z,start_at.lt.2026-10-23T22:00:00.000Z)",
  );
});

test("venster: na de wintertijdwissel klopt middernacht nog", () => {
  // Zondag 1 november 2026, 09:00 in Amsterdam (CET, UTC+1).
  const w = trainerSessionsWindow(new Date("2026-11-01T08:00:00.000Z"));
  assert.equal(w.dayStartIso, "2026-10-31T23:00:00.000Z");
  assert.equal(w.dayEndIso, "2026-11-01T23:00:00.000Z");
});

test("fase: komend, bezig, afgelopen", () => {
  const start = "2026-10-23T17:00:00.000Z";
  const end = "2026-10-23T18:00:00.000Z";
  assert.equal(sessionPhase(start, end, new Date("2026-10-23T16:59:59.000Z")), "upcoming");
  assert.equal(sessionPhase(start, end, new Date("2026-10-23T17:00:00.000Z")), "ongoing");
  assert.equal(sessionPhase(start, end, new Date("2026-10-23T17:59:59.000Z")), "ongoing");
  assert.equal(sessionPhase(start, end, new Date("2026-10-23T18:00:00.000Z")), "ended");
});

test("labels bestaan voor bezig en afgelopen, zonder em dash", () => {
  assert.equal(SESSION_PHASE_LABEL.ongoing, "Nu bezig");
  assert.equal(SESSION_PHASE_LABEL.ended, "Afgelopen, nog niet afgesloten");
  for (const v of Object.values(SESSION_PHASE_LABEL)) assert.ok(!v.includes("\u2014"));
});

test("de pagina gebruikt het venster met de 42703-terugval", () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
  const code = readFileSync(path.join(SRC, "app/app/trainer/sessies/page.tsx"), "utf8");
  assert.ok(code.includes("trainerSessionsWindow(now)"));
  assert.ok(code.includes(".or(window.orFilter)"));
  assert.ok(code.includes("isMissingColumnError(sessionsRes.error)"));
  assert.ok(code.includes("SESSION_PHASE_LABEL[phase]"));
});
