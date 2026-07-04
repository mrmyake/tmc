import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface MemberProgramExerciseRow {
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

export interface MemberProgramDayRow {
  id: string;
  dayNumber: number;
  label: string | null;
  exercises: MemberProgramExerciseRow[];
}

export interface MemberActiveProgram {
  id: string;
  title: string | null;
  notes: string | null;
  days: MemberProgramDayRow[];
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

type RawDay = {
  id: string;
  day_number: number;
  label: string | null;
  exercises: RawExercise[];
};

/**
 * Actieve trainingsschema van het ingelogde lid. Gebruikt de request-
 * scoped (RLS-enforced) client, niet de admin-client: de policies uit
 * de PR 1-migratie (`training_programs_self_active_read` e.a.) filteren
 * al op `profile_id = auth.uid() and status = 'active'`.
 */
export async function loadActiveProgramForMember(): Promise<MemberActiveProgram | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("training_programs")
    .select(
      `
        id, title, notes,
        days:program_days(
          id, day_number, label,
          exercises:program_exercises(
            id, slot, sets, reps_min, reps_max,
            tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
            rest_seconds, notes,
            exercise:exercises(name)
          )
        )
      `,
    )
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[loadActiveProgramForMember] query failed", error);
    return null;
  }

  const days = ((data.days ?? []) as RawDay[])
    .slice()
    .sort((a, b) => a.day_number - b.day_number)
    .map((d) => ({
      id: d.id,
      dayNumber: d.day_number,
      label: d.label,
      exercises: d.exercises
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
        }),
    }));

  return {
    id: data.id,
    title: data.title,
    notes: data.notes,
    days,
  };
}
