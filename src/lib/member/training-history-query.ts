import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface LoggedExerciseOption {
  exerciseId: string;
  name: string;
  lastLoggedAt: string;
}

export interface ExerciseHistorySet {
  setNumber: number;
  weightKg: number;
  reps: number;
}

export interface ExerciseHistorySession {
  sessionId: string;
  startedAt: string;
  topWeightKg: number;
  sets: ExerciseHistorySet[];
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * Oefeningen die het ingelogde lid ooit gelogd heeft, meest recent eerst.
 * RLS-scoped client (set_logs_self_read / workout_sessions_self_read hebben
 * geen status-filter), gematcht op exercise_id zodat de historie over alle
 * schema-versies heen werkt.
 */
export async function listLoggedExercisesForSelf(): Promise<LoggedExerciseOption[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("set_logs")
    .select(
      `
        exercise_id,
        exercise:exercises(name),
        session:workout_sessions!inner(started_at, completed_at)
      `,
    )
    .not("session.completed_at", "is", null);

  if (error) {
    console.error("[listLoggedExercisesForSelf] query failed", error);
    return [];
  }

  type Row = {
    exercise_id: string;
    exercise: { name: string } | { name: string }[] | null;
    session: { started_at: string } | { started_at: string }[];
  };

  const byExercise = new Map<string, LoggedExerciseOption>();
  for (const row of (data ?? []) as Row[]) {
    const ex = firstOf(row.exercise);
    const session = firstOf(row.session);
    if (!session) continue;
    const existing = byExercise.get(row.exercise_id);
    if (!existing || session.started_at > existing.lastLoggedAt) {
      byExercise.set(row.exercise_id, {
        exerciseId: row.exercise_id,
        name: ex?.name ?? "Onbekende oefening",
        lastLoggedAt: session.started_at,
      });
    }
  }

  return Array.from(byExercise.values()).sort((a, b) =>
    b.lastLoggedAt.localeCompare(a.lastLoggedAt),
  );
}

/** Eigen log-historie voor één oefening, chronologisch. */
export async function loadOwnExerciseHistory(
  exerciseId: string,
): Promise<ExerciseHistorySession[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("set_logs")
    .select(
      `
        session_id, set_number, weight_kg, reps,
        session:workout_sessions!inner(id, started_at, completed_at)
      `,
    )
    .eq("exercise_id", exerciseId)
    .not("session.completed_at", "is", null);

  if (error) {
    console.error("[loadOwnExerciseHistory] query failed", error);
    return [];
  }

  type Row = {
    session_id: string;
    set_number: number;
    weight_kg: number;
    reps: number;
    session:
      | { id: string; started_at: string; completed_at: string | null }
      | { id: string; started_at: string; completed_at: string | null }[];
  };

  const bySession = new Map<string, ExerciseHistorySession>();
  for (const row of (data ?? []) as Row[]) {
    const session = firstOf(row.session);
    if (!session) continue;
    const existing = bySession.get(row.session_id);
    const set = { setNumber: row.set_number, weightKg: Number(row.weight_kg), reps: row.reps };
    if (existing) {
      existing.sets.push(set);
      existing.topWeightKg = Math.max(existing.topWeightKg, set.weightKg);
    } else {
      bySession.set(row.session_id, {
        sessionId: row.session_id,
        startedAt: session.started_at,
        topWeightKg: set.weightKg,
        sets: [set],
      });
    }
  }

  const sessions = Array.from(bySession.values());
  for (const s of sessions) {
    s.sets.sort((a, b) => a.setNumber - b.setNumber);
  }
  sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return sessions;
}
