"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProgramActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

const SLOTS = [
  "A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2",
] as const;

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id };
}

function revalidateFor(profileId: string, programId?: string) {
  revalidatePath(`/app/admin/leden/${profileId}`);
  if (programId) {
    revalidatePath(`/app/admin/leden/${profileId}/schema/${programId}`);
  }
}

/** Draft-guard: geeft de profile_id terug als het programma een draft is. */
async function requireDraft(
  programId: string,
): Promise<{ ok: true; profileId: string } | { ok: false; message: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("training_programs")
    .select("profile_id, status")
    .eq("id", programId)
    .maybeSingle();
  if (!data) return { ok: false, message: "Programma niet gevonden." };
  if (data.status !== "draft") {
    // COPY: confirm met Marlon
    return {
      ok: false,
      message:
        "Alleen concepten zijn bewerkbaar. Dupliceer een actief schema om het aan te passen.",
    };
  }
  return { ok: true, profileId: data.profile_id };
}

// ---------------------------------------------------------------------------
// Programma
// ---------------------------------------------------------------------------

export async function createDraftProgram(
  profileId: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: latest } = await admin
    .from("training_programs")
    .select("version")
    .eq("profile_id", profileId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("training_programs")
    .insert({
      profile_id: profileId,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[createDraftProgram] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken lukte niet. Probeer opnieuw." };
  }

  revalidateFor(profileId);
  // COPY: confirm met Marlon
  return { ok: true, message: "Concept aangemaakt.", id: data.id };
}

export async function updateProgramMeta(input: {
  programId: string;
  title: string;
  notes: string;
}): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const draft = await requireDraft(input.programId);
  if (!draft.ok) return draft;

  const title = input.title.trim() || null;
  const notes = input.notes.trim() || null;
  if (title && title.length > 120) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Titel mag max 120 tekens zijn." };
  }
  if (notes && notes.length > 4000) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Notities mogen max 4000 tekens zijn." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("training_programs")
    .update({ title, notes })
    .eq("id", input.programId)
    .eq("status", "draft");

  if (error) {
    console.error("[updateProgramMeta] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan lukte niet." };
  }

  revalidateFor(draft.profileId, input.programId);
  // COPY: confirm met Marlon
  return { ok: true, message: "Opgeslagen." };
}

export async function deleteDraftProgram(
  programId: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const draft = await requireDraft(programId);
  if (!draft.ok) return draft;

  const admin = createAdminClient();
  const { error } = await admin
    .from("training_programs")
    .delete()
    .eq("id", programId)
    .eq("status", "draft");

  if (error) {
    console.error("[deleteDraftProgram] delete failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Verwijderen lukte niet." };
  }

  revalidateFor(draft.profileId);
  // COPY: confirm met Marlon
  return { ok: true, message: "Concept verwijderd." };
}

export async function activateProgram(
  programId: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("activate_training_program", {
    p_program_id: programId,
  });

  if (error) {
    console.error("[activateProgram] rpc failed", error);
    return {
      ok: false,
      // De RPC raise't Nederlandse meldingen (niet gevonden / geen draft).
      message: error.message || "Activeren lukte niet.",
    };
  }

  const profileId = (data as { profile_id?: string } | null)?.profile_id;
  if (profileId) revalidateFor(profileId, programId);
  // COPY: confirm met Marlon
  return { ok: true, message: "Schema geactiveerd." };
}

export async function duplicateProgram(
  programId: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: newId, error } = await admin.rpc(
    "duplicate_training_program",
    { p_program_id: programId },
  );

  if (error || !newId) {
    console.error("[duplicateProgram] rpc failed", error);
    return {
      ok: false,
      message: error?.message || "Dupliceren lukte niet.",
    };
  }

  const { data: src } = await admin
    .from("training_programs")
    .select("profile_id")
    .eq("id", programId)
    .maybeSingle();
  if (src?.profile_id) revalidateFor(src.profile_id);

  // COPY: confirm met Marlon
  return {
    ok: true,
    message: "Gekopieerd naar een nieuw concept.",
    id: newId as string,
  };
}

// ---------------------------------------------------------------------------
// Dagen
// ---------------------------------------------------------------------------

export async function addProgramDay(
  programId: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const draft = await requireDraft(programId);
  if (!draft.ok) return draft;

  const admin = createAdminClient();
  const { data: latest } = await admin
    .from("program_days")
    .select("day_number")
    .eq("program_id", programId)
    .order("day_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("program_days")
    .insert({
      program_id: programId,
      day_number: (latest?.day_number ?? 0) + 1,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[addProgramDay] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Dag toevoegen lukte niet." };
  }

  revalidateFor(draft.profileId, programId);
  // COPY: confirm met Marlon
  return { ok: true, message: "Dag toegevoegd.", id: data.id };
}

export async function updateProgramDayLabel(input: {
  dayId: string;
  label: string;
}): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: day } = await admin
    .from("program_days")
    .select("program_id")
    .eq("id", input.dayId)
    .maybeSingle();
  if (!day) return { ok: false, message: "Dag niet gevonden." };

  const draft = await requireDraft(day.program_id);
  if (!draft.ok) return draft;

  const label = input.label.trim() || null;
  if (label && label.length > 120) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Label mag max 120 tekens zijn." };
  }

  const { error } = await admin
    .from("program_days")
    .update({ label })
    .eq("id", input.dayId);

  if (error) {
    console.error("[updateProgramDayLabel] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan lukte niet." };
  }

  revalidateFor(draft.profileId, day.program_id);
  // COPY: confirm met Marlon
  return { ok: true, message: "Opgeslagen." };
}

export async function deleteProgramDay(
  dayId: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: day } = await admin
    .from("program_days")
    .select("program_id")
    .eq("id", dayId)
    .maybeSingle();
  if (!day) return { ok: false, message: "Dag niet gevonden." };

  const draft = await requireDraft(day.program_id);
  if (!draft.ok) return draft;

  const { error } = await admin.from("program_days").delete().eq("id", dayId);
  if (error) {
    console.error("[deleteProgramDay] delete failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Verwijderen lukte niet." };
  }

  revalidateFor(draft.profileId, day.program_id);
  // COPY: confirm met Marlon
  return { ok: true, message: "Dag verwijderd." };
}

// ---------------------------------------------------------------------------
// Oefeningen in slots
// ---------------------------------------------------------------------------

interface SaveExerciseInput {
  id?: string;
  dayId: string;
  slot: string;
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  tempoEccentric: number;
  tempoPauseBottom: number;
  tempoConcentric: number;
  tempoPauseTop: number;
  restSeconds: number;
  notes: string;
}

function validateExerciseInput(
  input: SaveExerciseInput,
): { ok: true } | { ok: false; message: string } {
  // COPY: confirm met Marlon (alle meldingen hieronder)
  if (!(SLOTS as readonly string[]).includes(input.slot)) {
    return { ok: false, message: "Kies een geldig slot (A1 t/m E2)." };
  }
  if (!input.exerciseId) {
    return { ok: false, message: "Kies een oefening." };
  }
  if (!Number.isInteger(input.sets) || input.sets < 1) {
    return { ok: false, message: "Sets moet minimaal 1 zijn." };
  }
  if (
    !Number.isInteger(input.repsMin) ||
    !Number.isInteger(input.repsMax) ||
    input.repsMin < 1 ||
    input.repsMax < input.repsMin
  ) {
    return {
      ok: false,
      message: "Reps: minimum vanaf 1, maximum niet lager dan minimum.",
    };
  }
  const tempos = [
    input.tempoEccentric,
    input.tempoPauseBottom,
    input.tempoConcentric,
    input.tempoPauseTop,
  ];
  if (tempos.some((t) => !Number.isInteger(t) || t < 0 || t > 20)) {
    return {
      ok: false,
      message: "Tempo: hele seconden van 0 t/m 20 (0 telt als X, explosief).",
    };
  }
  if (
    !Number.isInteger(input.restSeconds) ||
    input.restSeconds < 0 ||
    input.restSeconds > 3600
  ) {
    return { ok: false, message: "Rust: 0 t/m 3600 seconden." };
  }
  if (input.notes.trim().length > 1000) {
    return { ok: false, message: "Notitie mag max 1000 tekens zijn." };
  }
  return { ok: true };
}

export async function saveProgramExercise(
  input: SaveExerciseInput,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: day } = await admin
    .from("program_days")
    .select("program_id")
    .eq("id", input.dayId)
    .maybeSingle();
  if (!day) return { ok: false, message: "Dag niet gevonden." };

  const draft = await requireDraft(day.program_id);
  if (!draft.ok) return draft;

  const valid = validateExerciseInput(input);
  if (!valid.ok) return valid;

  const row = {
    day_id: input.dayId,
    slot: input.slot,
    exercise_id: input.exerciseId,
    sets: input.sets,
    reps_min: input.repsMin,
    reps_max: input.repsMax,
    tempo_eccentric: input.tempoEccentric,
    tempo_pause_bottom: input.tempoPauseBottom,
    tempo_concentric: input.tempoConcentric,
    tempo_pause_top: input.tempoPauseTop,
    rest_seconds: input.restSeconds,
    notes: input.notes.trim() || null,
  };

  const result = input.id
    ? await admin.from("program_exercises").update(row).eq("id", input.id)
    : await admin.from("program_exercises").insert(row);

  if (result.error) {
    if (result.error.code === "23505") {
      // COPY: confirm met Marlon
      return {
        ok: false,
        message: `Slot ${input.slot} is al bezet op deze dag.`,
      };
    }
    console.error("[saveProgramExercise] failed", result.error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan lukte niet." };
  }

  revalidateFor(draft.profileId, day.program_id);
  // COPY: confirm met Marlon
  return { ok: true, message: "Oefening opgeslagen." };
}

export async function deleteProgramExercise(
  id: string,
): Promise<ProgramActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("program_exercises")
    .select("day_id, day:program_days(program_id)")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { ok: false, message: "Oefening niet gevonden." };

  type DayRef = { program_id: string } | { program_id: string }[] | null;
  const dayRaw = row.day as unknown as DayRef;
  const programId = Array.isArray(dayRaw)
    ? dayRaw[0]?.program_id
    : dayRaw?.program_id;
  if (!programId) return { ok: false, message: "Programma niet gevonden." };

  const draft = await requireDraft(programId);
  if (!draft.ok) return draft;

  const { error } = await admin.from("program_exercises").delete().eq("id", id);
  if (error) {
    console.error("[deleteProgramExercise] delete failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Verwijderen lukte niet." };
  }

  revalidateFor(draft.profileId, programId);
  // COPY: confirm met Marlon
  return { ok: true, message: "Oefening verwijderd." };
}
