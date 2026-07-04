import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  videoUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

type RawRow = {
  id: string;
  name: string;
  description: string | null;
  video_url: string | null;
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
    .select("id, name, description, video_url, is_active, created_at")
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
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}
