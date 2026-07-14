import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MemberActiveProgram,
  MemberProgramDayRow,
} from "@/lib/member/training-program-query";

/**
 * PT-agenda C4: data voor de smalle trainer-klantweergave
 * (/app/trainer/klant/[id]). Vergrendelde zichtbaarheidsregel: een
 * trainer ziet naam + contact + trainingsschema van een eigen klant,
 * niet meer (geen ledenbeheer, betaling of identiteitsmutatie — dat
 * blijft /app/admin/leden). Leesacties via de service-role-client,
 * dezelfde vertrouwenslaag als de agenda zelf; de toegangscontrole zit
 * in de page (requireTrainerOrAdmin + de eigen-klant-check hieronder).
 */

export interface TrainerClientProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Eigen-klant-check: heeft dit profiel minstens een PT-boeking op een
 * sessie van deze trainer? Dit spiegelt de eigen-sessie-grens van de
 * C4-RPC's: de agenda linkt alleen vanaf eigen sessies hierheen.
 */
export async function trainerHasClient(
  trainerId: string,
  profileId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("pt_bookings")
    .select("id, pt_sessions!inner(trainer_id)", {
      count: "exact",
      head: true,
    })
    .eq("profile_id", profileId)
    .eq("pt_sessions.trainer_id", trainerId);

  if (error) {
    console.error("[trainerHasClient] query failed", error);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function loadTrainerClientProfile(
  profileId: string,
): Promise<TrainerClientProfile | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, phone")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[loadTrainerClientProfile] query failed", error);
    return null;
  }
  return {
    id: data.id,
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    email: data.email,
    phone: data.phone,
  };
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
 * Actieve trainingsschema van een klant. Zelfde select en mapping als
 * loadActiveProgramForMember (src/lib/member/training-program-query.ts),
 * maar via de service-role-client met een expliciete profile_id: de
 * RLS-policies dekken alleen het eigen profiel van het ingelogde lid.
 */
export async function loadActiveProgramForProfile(
  profileId: string,
): Promise<MemberActiveProgram | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
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
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    if (error)
      console.error("[loadActiveProgramForProfile] query failed", error);
    return null;
  }

  const days: MemberProgramDayRow[] = ((data.days ?? []) as RawDay[])
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
