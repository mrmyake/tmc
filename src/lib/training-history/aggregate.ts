/**
 * Pure aggregatiefuncties voor de trainingshistorie
 * (spec-trainingsprotocol.md PR 5 vervolg). Geen Supabase-import, geen
 * "server-only": deze module moet los van de app en los van de database
 * testbaar zijn (scripts/training-history/aggregate.test.mts). De data
 * komt uit query.ts (HistoryRow[] uit tmc.set_log_history, SessionMeta[]
 * uit een rechtstreekse select op workout_sessions).
 */
import type {
  ExerciseHistoryResult,
  ExerciseHistorySession,
  ExerciseOption,
  HistoryRow,
  HistorySet,
  PreviousExerciseLog,
  ProgramStatus,
  SessionMeta,
  WorkoutExercise,
  WorkoutSession,
} from "./types";

function isArchived(status: ProgramStatus): boolean {
  return status !== "active";
}

/** Bodyweight = elke set van de reeks heeft gewicht 0. Leeg is geen bodyweight. */
export function isBodyweightSets(sets: HistorySet[]): boolean {
  return sets.length > 0 && sets.every((s) => s.weightKg === 0);
}

/** Topwaarde van een reeks sets: hoogste gewicht, of bij bodyweight de meeste reps. */
export function topSetValue(sets: HistorySet[], isBodyweight: boolean): number {
  if (sets.length === 0) return 0;
  return isBodyweight
    ? Math.max(...sets.map((s) => s.reps))
    : Math.max(...sets.map((s) => s.weightKg));
}

function sortSets(sets: HistorySet[]): HistorySet[] {
  return sets.slice().sort((a, b) => a.setNumber - b.setNumber);
}

/** Oefeningen die ooit gelogd zijn, meest recent eerst (weergave 2, chips). */
export function buildExerciseOptions(rows: HistoryRow[]): ExerciseOption[] {
  const byExercise = new Map<string, ExerciseOption>();
  for (const row of rows) {
    const existing = byExercise.get(row.exerciseId);
    if (!existing || row.startedAt > existing.lastLoggedAt) {
      byExercise.set(row.exerciseId, {
        exerciseId: row.exerciseId,
        name: row.exerciseName,
        lastLoggedAt: row.startedAt,
      });
    }
  }
  return Array.from(byExercise.values()).sort((a, b) =>
    b.lastLoggedAt.localeCompare(a.lastLoggedAt),
  );
}

/**
 * Historie voor één oefening, chronologisch (weergave 2). isBodyweight
 * wordt globaal over alle sessies van deze oefening bepaald, zie
 * ExerciseHistoryResult.
 */
export function buildExerciseHistory(
  rows: HistoryRow[],
  exerciseId: string,
): ExerciseHistoryResult {
  const matching = rows.filter((r) => r.exerciseId === exerciseId);
  const isBodyweight = matching.length > 0 && matching.every((r) => r.set.weightKg === 0);

  const bySession = new Map<
    string,
    {
      sessionId: string;
      startedAt: string;
      programVersion: number;
      programStatus: ProgramStatus;
      sets: HistorySet[];
    }
  >();

  for (const row of matching) {
    const existing = bySession.get(row.sessionId);
    if (existing) {
      existing.sets.push(row.set);
    } else {
      bySession.set(row.sessionId, {
        sessionId: row.sessionId,
        startedAt: row.startedAt,
        programVersion: row.programVersion,
        programStatus: row.programStatus,
        sets: [row.set],
      });
    }
  }

  const sessions: ExerciseHistorySession[] = Array.from(bySession.values()).map((s) => {
    const sets = sortSets(s.sets);
    return {
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      programVersion: s.programVersion,
      isArchivedVersion: isArchived(s.programStatus),
      topValue: topSetValue(sets, isBodyweight),
      sets,
    };
  });

  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return { isBodyweight, sessions };
}

/**
 * "Vorige keer"-referentie per exercise_id (weergave 1): de meeste
 * recente afgeronde sessie waarin deze oefening voorkwam, met sets en
 * versie-info. tmc.set_log_history bevat alleen afgeronde sessies, dus
 * de huidige (lopende) sessie kan hier nooit tussen zitten; een
 * expliciete uitsluiting is niet nodig.
 */
export function buildPreviousLogsByExercise(
  rows: HistoryRow[],
): Map<string, PreviousExerciseLog> {
  const bestByExercise = new Map<
    string,
    { sessionId: string; startedAt: string; programVersion: number; programStatus: ProgramStatus }
  >();

  for (const row of rows) {
    const current = bestByExercise.get(row.exerciseId);
    if (!current || row.startedAt > current.startedAt) {
      bestByExercise.set(row.exerciseId, {
        sessionId: row.sessionId,
        startedAt: row.startedAt,
        programVersion: row.programVersion,
        programStatus: row.programStatus,
      });
    }
  }

  const result = new Map<string, PreviousExerciseLog>();
  for (const row of rows) {
    const best = bestByExercise.get(row.exerciseId);
    if (!best || row.sessionId !== best.sessionId) continue;
    const existing = result.get(row.exerciseId);
    if (existing) {
      existing.sets.push(row.set);
    } else {
      result.set(row.exerciseId, {
        sessionId: best.sessionId,
        startedAt: best.startedAt,
        programVersion: best.programVersion,
        isArchivedVersion: isArchived(best.programStatus),
        sets: [row.set],
      });
    }
  }

  for (const log of result.values()) {
    log.sets = sortSets(log.sets);
  }

  return result;
}

/**
 * Sessies per workout (weergave 3), nieuwste eerst. `sessions` is de
 * volledige lijst afgeronde sessies (ook zonder sets, uit een
 * rechtstreekse select op workout_sessions); `rows` levert de gelogde
 * sets erbij. Een sessie zonder rijen krijgt exercises: [], de UI toont
 * dan "Geen sets gelogd" in plaats van de sessie te verbergen.
 */
export function buildWorkoutSessions(
  sessions: SessionMeta[],
  rows: HistoryRow[],
): WorkoutSession[] {
  const exercisesBySession = new Map<string, Map<string, WorkoutExercise>>();

  for (const row of rows) {
    let bySlot = exercisesBySession.get(row.sessionId);
    if (!bySlot) {
      bySlot = new Map();
      exercisesBySession.set(row.sessionId, bySlot);
    }
    const existing = bySlot.get(row.programExerciseId);
    if (existing) {
      existing.sets.push(row.set);
    } else {
      bySlot.set(row.programExerciseId, {
        programExerciseId: row.programExerciseId,
        slot: row.slot,
        exerciseId: row.exerciseId,
        exerciseName: row.exerciseName,
        isBodyweight: false,
        sets: [row.set],
      });
    }
  }

  const result: WorkoutSession[] = sessions.map((s) => {
    const bySlot = exercisesBySession.get(s.sessionId);
    const exercises: WorkoutExercise[] = bySlot
      ? Array.from(bySlot.values())
          .map((ex) => {
            const sets = sortSets(ex.sets);
            return { ...ex, sets, isBodyweight: isBodyweightSets(sets) };
          })
          .sort((a, b) => a.slot.localeCompare(b.slot))
      : [];

    return {
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      dayNumber: s.dayNumber,
      dayLabel: s.dayLabel,
      programVersion: s.programVersion,
      isArchivedVersion: isArchived(s.programStatus),
      exercises,
    };
  });

  result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return result;
}
