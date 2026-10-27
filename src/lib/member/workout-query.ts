import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface WorkoutExercise {
  id: string;
  slot: string;
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  tempoEccentric: number;
  tempoPauseBottom: number;
  tempoConcentric: number;
  tempoPauseTop: number;
  restSeconds: number;
  notes: string | null;
}

export interface WorkoutDay {
  id: string;
  dayNumber: number;
  label: string | null;
  exercises: WorkoutExercise[];
}

export interface LoggedSet {
  programExerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  notes: string | null;
}

type RawExercise = {
  id: string;
  slot: string;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  tempo_eccentric: number;
  tempo_pause_bottom: number;
  tempo_concentric: number;
  tempo_pause_top: number;
  rest_seconds: number;
  notes: string | null;
  exercise: { name: string } | { name: string }[] | null;
};

/**
 * Dag + oefeningen voor de workout-flow. RLS (program_days_self_active_read
 * / program_exercises_self_active_read) zorgt dat dit alleen een dag uit
 * het eigen actieve schema kan zijn.
 */
export async function loadDayForMember(dayId: string): Promise<WorkoutDay | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("program_days")
    .select(
      `
        id, day_number, label,
        exercises:program_exercises(
          id, slot, exercise_id, sets, reps_min, reps_max,
          tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
          rest_seconds, notes,
          exercise:exercises(name)
        )
      `,
    )
    .eq("id", dayId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[loadDayForMember] query failed", error);
    return null;
  }

  const exercises = ((data.exercises ?? []) as RawExercise[])
    .slice()
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((e) => {
      const exRaw = e.exercise;
      const ex = Array.isArray(exRaw) ? exRaw[0] : exRaw;
      return {
        id: e.id,
        slot: e.slot,
        exerciseId: e.exercise_id,
        exerciseName: ex?.name ?? "Onbekende oefening",
        sets: e.sets,
        repsMin: e.reps_min,
        repsMax: e.reps_max,
        tempoEccentric: e.tempo_eccentric,
        tempoPauseBottom: e.tempo_pause_bottom,
        tempoConcentric: e.tempo_concentric,
        tempoPauseTop: e.tempo_pause_top,
        restSeconds: e.rest_seconds,
        notes: e.notes,
      };
    });

  return {
    id: data.id,
    dayNumber: data.day_number,
    label: data.label,
    exercises,
  };
}

/** Meest recente, nog niet afgeronde sessie voor deze dag (self-scoped via RLS). */
export async function loadOpenSessionForDay(
  dayId: string,
): Promise<{ id: string; startedAt: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, started_at")
    .eq("day_id", dayId)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[loadOpenSessionForDay] query failed", error);
    return null;
  }

  return { id: data.id, startedAt: data.started_at };
}

/** Al gelogde sets voor deze (lopende) sessie, zodat een refresh niets verliest. */
export async function loadLoggedSetsForSession(
  sessionId: string,
): Promise<LoggedSet[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("set_logs")
    .select("program_exercise_id, set_number, weight_kg, reps, notes")
    .eq("session_id", sessionId);

  if (error) {
    console.error("[loadLoggedSetsForSession] query failed", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    programExerciseId: r.program_exercise_id,
    setNumber: r.set_number,
    weightKg: Number(r.weight_kg),
    reps: r.reps,
    notes: r.notes,
  }));
}
