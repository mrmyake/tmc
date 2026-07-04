import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProgramStatus = "draft" | "active" | "archived";

export interface ProgramSummary {
  id: string;
  version: number;
  status: ProgramStatus;
  title: string | null;
  activatedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  dayCount: number;
  exerciseCount: number;
}

export interface ProgramExerciseRow {
  id: string;
  slot: string;
  exerciseId: string;
  exerciseName: string;
  exerciseIsActive: boolean;
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

export interface ProgramDayRow {
  id: string;
  dayNumber: number;
  label: string | null;
  exercises: ProgramExerciseRow[];
}

export interface ProgramDetail {
  id: string;
  profileId: string;
  memberName: string;
  version: number;
  status: ProgramStatus;
  title: string | null;
  notes: string | null;
  activatedAt: string | null;
  archivedAt: string | null;
  days: ProgramDayRow[];
}

/**
 * Versie-historie van een klant, nieuwste eerst. Admin-only via de
 * service-role client; de tabellen hebben bewust geen admin-RLS-policy
 * (zie de PR 1-migratie).
 */
export async function listProgramsForMember(
  profileId: string,
): Promise<ProgramSummary[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_programs")
    .select(
      `
        id, version, status, title, activated_at, archived_at, created_at,
        days:program_days(id, exercises:program_exercises(id))
      `,
    )
    .eq("profile_id", profileId)
    .order("version", { ascending: false });

  if (error) {
    console.error("[listProgramsForMember] query failed", error);
    return [];
  }

  type Raw = {
    id: string;
    version: number;
    status: ProgramStatus;
    title: string | null;
    activated_at: string | null;
    archived_at: string | null;
    created_at: string;
    days: Array<{ id: string; exercises: Array<{ id: string }> }>;
  };

  return ((data ?? []) as Raw[]).map((r) => ({
    id: r.id,
    version: r.version,
    status: r.status,
    title: r.title,
    activatedAt: r.activated_at,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    dayCount: r.days.length,
    exerciseCount: r.days.reduce((sum, d) => sum + d.exercises.length, 0),
  }));
}

/** Volledig programma inclusief dagen, oefeningen en klantnaam. */
export async function loadProgramDetail(
  programId: string,
): Promise<ProgramDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("training_programs")
    .select(
      `
        id, profile_id, version, status, title, notes, activated_at, archived_at,
        profile:profiles!profile_id(first_name, last_name),
        days:program_days(
          id, day_number, label,
          exercises:program_exercises(
            id, slot, exercise_id, sets, reps_min, reps_max,
            tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
            rest_seconds, notes,
            exercise:exercises(name, is_active)
          )
        )
      `,
    )
    .eq("id", programId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[loadProgramDetail] query failed", error);
    return null;
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
    exercise: { name: string; is_active: boolean } | { name: string; is_active: boolean }[] | null;
  };
  type RawDay = {
    id: string;
    day_number: number;
    label: string | null;
    exercises: RawExercise[];
  };
  type RawProfile = { first_name: string; last_name: string };

  const profileRaw = data.profile as unknown as RawProfile | RawProfile[] | null;
  const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;

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
            exerciseId: e.exercise_id,
            exerciseName: ex?.name ?? "Onbekende oefening",
            exerciseIsActive: ex?.is_active ?? false,
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
    profileId: data.profile_id,
    memberName: [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(" "),
    version: data.version,
    status: data.status as ProgramStatus,
    title: data.title,
    notes: data.notes,
    activatedAt: data.activated_at,
    archivedAt: data.archived_at,
    days,
  };
}
