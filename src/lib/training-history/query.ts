import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRow, ProgramStatus, SessionMeta } from "./types";

/**
 * Losjes getypeerde client-parameter, zelfde patroon als
 * src/lib/member/account-deletion-preflight.ts: createClient()
 * (RLS-scoped, schema "tmc" via env) en createAdminClient()
 * (service-role) hebben elk een net iets andere inferred
 * SupabaseClient<...>-generic. Deze functies gebruiken alleen
 * .from(...).select(...), dus de volledige Database-generic doet er niet toe.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any, any, any>;

/**
 * Data-laag voor de trainingshistorie (spec-trainingsprotocol.md PR 5
 * vervolg). Neemt een al geconfigureerde Supabase-client: de RLS-scoped
 * client (self, geen profileId) voor het lid, of de service-role-client
 * (admin, trainer-klantpagina) met een expliciete profileId. tmc.set_log_history
 * heeft zelf geen policy (security invoker leunt op RLS van de
 * onderliggende tabellen), dus bij de service-role-client filtert de
 * query hier expliciet op profile_id.
 */

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type RawHistoryRow = {
  session_id: string;
  started_at: string;
  completed_at: string;
  program_id: string;
  program_version: number;
  program_status: string;
  day_id: string;
  day_number: number;
  day_label: string | null;
  program_exercise_id: string;
  slot: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  notes: string | null;
};

function mapHistoryRow(r: RawHistoryRow): HistoryRow {
  return {
    sessionId: r.session_id,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    programId: r.program_id,
    programVersion: r.program_version,
    programStatus: r.program_status as ProgramStatus,
    dayId: r.day_id,
    dayNumber: r.day_number,
    dayLabel: r.day_label,
    programExerciseId: r.program_exercise_id,
    slot: r.slot,
    exerciseId: r.exercise_id,
    exerciseName: r.exercise_name,
    set: {
      setNumber: r.set_number,
      weightKg: Number(r.weight_kg),
      reps: r.reps,
      notes: r.notes,
    },
  };
}

/**
 * Alle gelogde sets, platte rijen uit tmc.set_log_history (alleen
 * afgeronde sessies). Bevat geen sessies zonder sets, zie
 * loadCompletedSessions daarvoor.
 */
export async function loadHistoryRows(
  supabase: AnySupabaseClient,
  profileId?: string,
): Promise<HistoryRow[]> {
  let query = supabase
    .from("set_log_history")
    .select(
      `
        session_id, started_at, completed_at,
        program_id, program_version, program_status,
        day_id, day_number, day_label,
        program_exercise_id, slot,
        exercise_id, exercise_name,
        set_number, weight_kg, reps, notes
      `,
    );
  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) {
    console.error("[loadHistoryRows] query failed", error);
    return [];
  }
  return ((data ?? []) as RawHistoryRow[]).map(mapHistoryRow);
}

type RawSessionRow = {
  id: string;
  started_at: string;
  completed_at: string;
  program:
    | { version: number; status: string }
    | { version: number; status: string }[]
    | null;
  day:
    | { day_number: number; label: string | null }
    | { day_number: number; label: string | null }[]
    | null;
};

/**
 * Alle afgeronde sessies van een lid, inclusief sessies zonder gelogde
 * sets. De view set_log_history mist die (inner join op set_logs): voor
 * weergave 3 (per workout) moet een lege, afgeronde sessie wel getoond
 * worden ("Geen sets gelogd"), niet verdwijnen. Nieuwste eerst.
 */
export async function loadCompletedSessions(
  supabase: AnySupabaseClient,
  profileId?: string,
): Promise<SessionMeta[]> {
  let query = supabase
    .from("workout_sessions")
    .select(
      `
        id, started_at, completed_at,
        program:training_programs(version, status),
        day:program_days(day_number, label)
      `,
    )
    .not("completed_at", "is", null)
    .order("started_at", { ascending: false });
  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) {
    console.error("[loadCompletedSessions] query failed", error);
    return [];
  }

  const rows: SessionMeta[] = [];
  for (const r of (data ?? []) as RawSessionRow[]) {
    const program = firstOf(r.program);
    const day = firstOf(r.day);
    // Zou alleen ontbreken als de self_logged_read-policies niet live
    // staan (migratie nog niet toegepast); dan liever overslaan dan
    // crashen op een niet-leesbaar programma of dag.
    if (!program || !day || !r.completed_at) continue;
    rows.push({
      sessionId: r.id,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      programVersion: program.version,
      programStatus: program.status as ProgramStatus,
      dayNumber: day.day_number,
      dayLabel: day.label,
    });
  }
  return rows;
}
