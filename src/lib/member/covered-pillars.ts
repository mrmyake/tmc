import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface CoveredPillars {
  /** Vereniging van covered_pillars over alle memberships van het lid. */
  pillars: ReadonlySet<string>;
  /** Er is minstens een rij die vrij_trainen dekt. */
  coversVrijTrainen: boolean;
  /** Alle rijen die vrij_trainen dekken zijn gepauzeerd. */
  vrijTrainenPaused: boolean;
  /** Weekcap van de nieuwste rij die vrij_trainen dekt (check-in-weergave). */
  vrijTrainenFrequencyCap: number | null;
}

/**
 * Welke weergaven het rooster toont (spec-rooster-vrij-trainen.md). Dit is
 * alleen een weergavekeuze: canBook() en de membership-selectie van het
 * rooster zelf blijven onaangeroerd. Rittenkaarten tellen mee, alleen
 * pt_package valt eruit.
 */
export async function loadCoveredPillars(
  supabase: Supabase,
  userId: string,
): Promise<CoveredPillars> {
  const { data } = await supabase
    .from("memberships")
    .select("covered_pillars, status, frequency_cap")
    .eq("profile_id", userId)
    .in("status", ["active", "cancellation_requested", "paused"])
    .neq("plan_type", "pt_package")
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const pillars = new Set<string>();
  for (const r of rows) for (const p of r.covered_pillars ?? []) pillars.add(p);

  const vrijRows = rows.filter((r) => (r.covered_pillars ?? []).includes("vrij_trainen"));
  return {
    pillars,
    coversVrijTrainen: vrijRows.length > 0,
    vrijTrainenPaused: vrijRows.length > 0 && vrijRows.every((r) => r.status === "paused"),
    vrijTrainenFrequencyCap: vrijRows[0]?.frequency_cap ?? null,
  };
}
