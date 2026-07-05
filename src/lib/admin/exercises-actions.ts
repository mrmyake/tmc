"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ExerciseActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

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

function revalidateAll() {
  revalidatePath("/app/admin/oefeningen");
}

function isValidVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

interface UpsertInput {
  id?: string;
  name: string;
  description?: string;
  videoUrl?: string;
}

export async function saveExercise(
  input: UpsertInput,
): Promise<ExerciseActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const name = input.name?.trim();
  // COPY: confirm met Marlon
  if (!name) return { ok: false, message: "Naam is verplicht." };
  if (name.length > 120) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Naam mag max 120 tekens zijn." };
  }

  const description = input.description?.trim() || null;
  if (description && description.length > 2000) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Beschrijving mag max 2000 tekens zijn." };
  }

  const videoUrl = input.videoUrl?.trim() || null;
  if (videoUrl && !isValidVideoUrl(videoUrl)) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      message: "Video-URL is geen geldige link (http of https).",
    };
  }

  const admin = createAdminClient();

  if (input.id) {
    const { error } = await admin
      .from("exercises")
      .update({ name, description, video_url: videoUrl })
      .eq("id", input.id);

    if (error) {
      if (error.code === "23505") {
        // COPY: confirm met Marlon
        return {
          ok: false,
          message: "Er bestaat al een oefening met deze naam.",
        };
      }
      console.error("[saveExercise] update failed", error);
      // COPY: confirm met Marlon
      return { ok: false, message: "Bijwerken lukte niet." };
    }
    revalidateAll();
    // COPY: confirm met Marlon
    return { ok: true, message: "Oefening bijgewerkt.", id: input.id };
  }

  const { data, error } = await admin
    .from("exercises")
    .insert({ name, description, video_url: videoUrl })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      // COPY: confirm met Marlon
      return {
        ok: false,
        message: "Er bestaat al een oefening met deze naam.",
      };
    }
    console.error("[saveExercise] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken lukte niet." };
  }

  revalidateAll();
  // COPY: confirm met Marlon
  return { ok: true, message: "Oefening toegevoegd.", id: data.id };
}

export async function setExerciseActive(
  id: string,
  isActive: boolean,
): Promise<ExerciseActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("exercises")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    console.error("[setExerciseActive] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Bijwerken lukte niet." };
  }

  revalidateAll();
  return {
    ok: true,
    // COPY: confirm met Marlon
    message: isActive ? "Oefening geheractiveerd." : "Oefening gedeactiveerd.",
  };
}
