"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";

export type ClassTypeActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

function revalidateAll() {
  revalidatePath("/app/admin/lestypes");
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface UpsertInput {
  id?: string;
  slug?: string;
  name: string;
  pillar: string;
  description?: string;
  defaultDurationMinutes: number;
  defaultCapacity: number | null;
  color?: string;
}

export async function saveClassType(
  input: UpsertInput,
): Promise<ClassTypeActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const name = input.name?.trim();
  // COPY: confirm met Marlon
  if (!name) return { ok: false, message: "Naam is verplicht." };
  if (name.length > 120) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Naam mag max 120 tekens zijn." };
  }

  const pillar = input.pillar?.trim();
  // COPY: confirm met Marlon
  if (!pillar) return { ok: false, message: "Pillar is verplicht." };

  const admin = createAdminClient();

  const { data: pillarRow, error: pillarError } = await admin
    .from("class_pillars")
    .select("age_category")
    .eq("code", pillar)
    .maybeSingle();
  if (pillarError || !pillarRow) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Onbekende pillar." };
  }
  const ageCategory = pillarRow.age_category;

  const description = input.description?.trim() || null;
  if (description && description.length > 2000) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Beschrijving mag max 2000 tekens zijn." };
  }

  const duration = input.defaultDurationMinutes;
  if (!Number.isFinite(duration) || duration <= 0) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Standaardduur moet een positief getal zijn." };
  }

  const capacity = input.defaultCapacity;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity <= 0)) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      message: "Standaardcapaciteit moet leeg zijn (onbeperkt) of een positief getal.",
    };
  }

  const color = input.color?.trim() || null;

  if (input.id) {
    const { error } = await admin
      .from("class_types")
      .update({
        name,
        pillar,
        age_category: ageCategory,
        description,
        default_duration_minutes: duration,
        default_capacity: capacity,
        color,
      })
      .eq("id", input.id);

    if (error) {
      console.error("[saveClassType] update failed", error);
      // COPY: confirm met Marlon
      return { ok: false, message: "Bijwerken lukte niet." };
    }
    revalidateAll();
    // COPY: confirm met Marlon
    return { ok: true, message: "Lestype bijgewerkt.", id: input.id };
  }

  const slug = input.slug?.trim().toLowerCase();
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: "Slug is verplicht en mag alleen kleine letters, cijfers en koppeltekens bevatten.",
    };
  }

  const { data, error } = await admin
    .from("class_types")
    .insert({
      slug,
      name,
      pillar,
      age_category: ageCategory,
      description,
      default_duration_minutes: duration,
      default_capacity: capacity,
      color,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      // COPY: confirm met Marlon
      return { ok: false, message: "Er bestaat al een lestype met deze slug." };
    }
    console.error("[saveClassType] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Aanmaken lukte niet." };
  }

  revalidateAll();
  // COPY: confirm met Marlon
  return { ok: true, message: "Lestype toegevoegd.", id: data.id };
}

export async function setClassTypeActive(
  id: string,
  isActive: boolean,
): Promise<ClassTypeActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("class_types")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    console.error("[setClassTypeActive] update failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Bijwerken lukte niet." };
  }

  revalidateAll();
  return {
    ok: true,
    // COPY: confirm met Marlon
    message: isActive ? "Lestype geheractiveerd." : "Lestype gedeactiveerd.",
  };
}
