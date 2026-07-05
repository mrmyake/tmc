import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface WorkoutExercise {
  id: string;
  slot: string;
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
          id, slot, sets, reps_min, reps_max,
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

/**
 * "Vorige keer"-referentie per oefening: de sets van de meest recente
 * afgeronde sessie (niet de huidige) voor dezelfde program_exercise_id.
 * Bewust geen cross-versie-matching: een nieuwe schema-versie heeft een
 * nieuwe program_exercise_id, dus de referentie reset vanzelf als Marlon
 * de sets/reps/tempo voor die slot heeft aangepast.
 */
export async function loadPreviousSetLogs(
  programExerciseIds: string[],
  excludeSessionId: string,
): Promise<Map<string, LoggedSet[]>> {
  const result = new Map<string, LoggedSet[]>();
  if (programExerciseIds.length === 0) return result;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("set_logs")
    .select(
      `
        program_exercise_id, set_number, weight_kg, reps, notes,
        session:workout_sessions!inner(id, started_at, completed_at)
      `,
    )
    .in("program_exercise_id", programExerciseIds);

  if (error) {
    console.error("[loadPreviousSetLogs] query failed", error);
    return result;
  }

  type Row = {
    program_exercise_id: string;
    set_number: number;
    weight_kg: number;
    reps: number;
    notes: string | null;
    session: { id: string; started_at: string; completed_at: string | null } | { id: string; started_at: string; completed_at: string | null }[];
  };

  const rows = (data ?? []) as Row[];

  const bestSessionByExercise = new Map<string, { sessionId: string; startedAt: string }>();
  for (const row of rows) {
    const session = Array.isArray(row.session) ? row.session[0] : row.session;
    if (!session || session.id === excludeSessionId || !session.completed_at) continue;
    const current = bestSessionByExercise.get(row.program_exercise_id);
    if (!current || session.started_at > current.startedAt) {
      bestSessionByExercise.set(row.program_exercise_id, {
        sessionId: session.id,
        startedAt: session.started_at,
      });
    }
  }

  for (const row of rows) {
    const best = bestSessionByExercise.get(row.program_exercise_id);
    const session = Array.isArray(row.session) ? row.session[0] : row.session;
    if (!best || !session || session.id !== best.sessionId) continue;
    const list = result.get(row.program_exercise_id) ?? [];
    list.push({
      programExerciseId: row.program_exercise_id,
      setNumber: row.set_number,
      weightKg: Number(row.weight_kg),
      reps: row.reps,
      notes: row.notes,
    });
    result.set(row.program_exercise_id, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.setNumber - b.setNumber);
  }

  return result;
}
