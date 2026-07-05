import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ClassTypeRow {
  id: string;
  slug: string;
  name: string;
  pillar: string;
  ageCategory: string;
  description: string | null;
  defaultDurationMinutes: number;
  defaultCapacity: number | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ClassPillarOption {
  code: string;
  nameNl: string;
  ageCategory: string;
}

type RawRow = {
  id: string;
  slug: string;
  name: string;
  pillar: string;
  age_category: string;
  description: string | null;
  default_duration_minutes: number;
  default_capacity: number | null;
  color: string | null;
  is_active: boolean;
  sort_order: number;
};

/**
 * Admin-only: alle lestypes, actief en gedeactiveerd, gesorteerd op
 * sort_order. class_types heeft bewust geen admin-RLS-write-policy die
 * de request-scoped client kan gebruiken op dezelfde manier als de rest
 * van de cockpit (zie exercises-query.ts); we lezen daarom via de
 * service-role client.
 */
export async function listAllClassTypes(): Promise<ClassTypeRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_types")
    .select(
      "id, slug, name, pillar, age_category, description, default_duration_minutes, default_capacity, color, is_active, sort_order",
    )
    .order("sort_order", { ascending: true })
    .returns<RawRow[]>();

  if (error) {
    console.error("[listAllClassTypes] query failed", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    pillar: r.pillar,
    ageCategory: r.age_category,
    description: r.description,
    defaultDurationMinutes: r.default_duration_minutes,
    defaultCapacity: r.default_capacity,
    color: r.color,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  }));
}

/** Pillar-opties voor de select in het lestype-formulier. */
export async function listClassPillars(): Promise<ClassPillarOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_pillars")
    .select("code, name_nl, age_category")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[listClassPillars] query failed", error);
    return [];
  }

  return (data ?? []).map((p) => ({
    code: p.code,
    nameNl: p.name_nl,
    ageCategory: p.age_category,
  }));
}
