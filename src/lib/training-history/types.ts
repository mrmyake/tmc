/**
 * Gedeelde types voor de trainingshistorie (spec-trainingsprotocol.md
 * PR 5 vervolg), gebruikt door zowel de pure aggregatiefuncties
 * (aggregate.ts) als de data-laag (query.ts). Geen "server-only" import
 * hier: dit bestand moet ook onder de node:test-runner importeerbaar
 * blijven (scripts/training-history/aggregate.test.mts).
 */

export type ProgramStatus = "draft" | "active" | "archived";

export interface HistorySet {
  setNumber: number;
  weightKg: number;
  reps: number;
  notes: string | null;
}

/** Eén rij uit tmc.set_log_history: een gelogde set met zijn context. */
export interface HistoryRow {
  sessionId: string;
  startedAt: string;
  completedAt: string;
  programId: string;
  programVersion: number;
  programStatus: ProgramStatus;
  dayId: string;
  dayNumber: number;
  dayLabel: string | null;
  programExerciseId: string;
  slot: string;
  exerciseId: string;
  exerciseName: string;
  set: HistorySet;
}

/** Eén afgeronde workout_sessions-rij, los van of er sets gelogd zijn. */
export interface SessionMeta {
  sessionId: string;
  startedAt: string;
  completedAt: string;
  programVersion: number;
  programStatus: ProgramStatus;
  dayNumber: number;
  dayLabel: string | null;
}

export interface ExerciseOption {
  exerciseId: string;
  name: string;
  lastLoggedAt: string;
}

export interface ExerciseHistorySession {
  sessionId: string;
  startedAt: string;
  programVersion: number;
  isArchivedVersion: boolean;
  /** Topgewicht (kg) of, bij een bodyweight-oefening, het hoogste aantal reps in deze sessie. */
  topValue: number;
  sets: HistorySet[];
}

export interface ExerciseHistoryResult {
  /**
   * Globaal over de hele oefening (alle sessies), niet per sessie: zodra
   * ooit gewicht is toegevoegd blijft de grafiek op kg staan, ook voor
   * eerdere sessies zonder gewicht (die krijgen dan 0 kg als topValue).
   * Eén as, geen wisselende eenheid tussen staven.
   */
  isBodyweight: boolean;
  sessions: ExerciseHistorySession[];
}

/** "Vorige keer"-referentie voor weergave 1, per exercise_id. */
export interface PreviousExerciseLog {
  sessionId: string;
  startedAt: string;
  programVersion: number;
  isArchivedVersion: boolean;
  sets: HistorySet[];
}

export interface WorkoutExercise {
  programExerciseId: string;
  slot: string;
  exerciseId: string;
  exerciseName: string;
  /** Lokaal aan deze sessie: bepaalt alleen de bold-set in SetList, geen grafiek hier. */
  isBodyweight: boolean;
  sets: HistorySet[];
}

export interface WorkoutSession {
  sessionId: string;
  startedAt: string;
  completedAt: string;
  dayNumber: number;
  dayLabel: string | null;
  programVersion: number;
  isArchivedVersion: boolean;
  /** Leeg = afgerond zonder gelogde sets; tonen met "Geen sets gelogd", niet verbergen. */
  exercises: WorkoutExercise[];
}
