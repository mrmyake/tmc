import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEquipment, type Equipment } from "@/lib/equipment";

export interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  videoUrl: string | null;
  /** Type materiaal; null = nog niet ingedeeld (Marlon via de admin). */
  equipment: Equipment | null;
  /** Stapgrootte van de coach; null = standaard van het type. */
  weightStepKg: number | null;
  isActive: boolean;
  createdAt: string;
}

type RawRow = {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
  equipment: string | null;
  weight_step_kg: number | string | null;
  is_active: boolean;
  created_at: string;
};

/**
 * Admin-only: alle oefeningen, actief en gedeactiveerd. exercises heeft
 * bewust geen admin-RLS-policy (alleen `exercises_member_read` voor
 * actieve rijen); de cockpit gebruikt daarom de service-role client,
 * net als de rest van src/lib/admin/*.
 */
export async function listAllExercises(): Promise<ExerciseRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("exercises")
    .select("id, name, description, video_url, equipment, weight_step_kg, is_active, created_at")
    .order("name", { ascending: true })
    .returns<RawRow[]>();

  if (error) {
    console.error("[listAllExercises] query failed", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    videoUrl: r.video_url,
    equipment: isEquipment(r.equipment) ? r.equipment : null,
    weightStepKg:
      r.weight_step_kg === null || r.weight_step_kg === undefined
        ? null
        : Number(r.weight_step_kg),
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}
