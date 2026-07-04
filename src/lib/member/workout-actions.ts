"use server";

import { createClient } from "@/lib/supabase/server";

export type StartWorkoutResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

export type LogSetResult = { ok: true } | { ok: false; message: string };

export type CompleteWorkoutResult = { ok: true } | { ok: false; message: string };

// COPY: confirm met Marlon
const START_REASON_COPY: Record<string, string> = {
  day_not_found: "Deze trainingsdag hoort niet bij je actieve schema.",
};

// COPY: confirm met Marlon
const LOG_SET_REASON_COPY: Record<string, string> = {
  session_not_found: "Deze workout-sessie is niet gevonden.",
  session_completed: "Deze workout is al afgerond.",
  exercise_not_in_session: "Deze oefening hoort niet bij deze workout.",
  set_number_out_of_range: "Ongeldig setnummer voor deze oefening.",
  invalid_values: "Vul een geldig gewicht en aantal reps in.",
};

// COPY: confirm met Marlon
const COMPLETE_REASON_COPY: Record<string, string> = {
  session_not_found: "Deze workout-sessie is niet gevonden.",
  already_completed: "Deze workout is al afgerond.",
};

type RpcResult = { ok: boolean; reason?: string; [key: string]: unknown };

export async function startWorkoutSession(
  dayId: string,
): Promise<StartWorkoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("start_workout_session", {
    p_day_id: dayId,
  });

  if (rpcResult.error) {
    console.error("[startWorkoutSession] rpc failed", rpcResult.error);
    return { ok: false, message: "Workout starten lukte niet. Probeer het opnieuw." };
  }

  const result = rpcResult.data as RpcResult;
  if (!result.ok) {
    return {
      ok: false,
      message:
        START_REASON_COPY[result.reason ?? ""] ??
        "Workout starten lukte niet. Probeer het opnieuw.",
    };
  }

  return { ok: true, sessionId: result.session_id as string };
}

export async function logSet(input: {
  sessionId: string;
  programExerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  notes?: string;
}): Promise<LogSetResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("log_set", {
    p_session_id: input.sessionId,
    p_program_exercise_id: input.programExerciseId,
    p_set_number: input.setNumber,
    p_weight_kg: input.weightKg,
    p_reps: input.reps,
    p_notes: input.notes ?? null,
  });

  if (rpcResult.error) {
    console.error("[logSet] rpc failed", rpcResult.error);
    return { ok: false, message: "Set loggen lukte niet. Probeer het opnieuw." };
  }

  const result = rpcResult.data as RpcResult;
  if (!result.ok) {
    return {
      ok: false,
      message:
        LOG_SET_REASON_COPY[result.reason ?? ""] ??
        "Set loggen lukte niet. Probeer het opnieuw.",
    };
  }

  return { ok: true };
}

export async function completeWorkoutSession(
  sessionId: string,
): Promise<CompleteWorkoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("complete_workout_session", {
    p_session_id: sessionId,
  });

  if (rpcResult.error) {
    console.error("[completeWorkoutSession] rpc failed", rpcResult.error);
    return { ok: false, message: "Afronden lukte niet. Probeer het opnieuw." };
  }

  const result = rpcResult.data as RpcResult;
  if (!result.ok) {
    return {
      ok: false,
      message:
        COMPLETE_REASON_COPY[result.reason ?? ""] ??
        "Afronden lukte niet. Probeer het opnieuw.",
    };
  }

  return { ok: true };
}
