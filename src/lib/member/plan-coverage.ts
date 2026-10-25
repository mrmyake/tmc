export const PILLARS = [
  "vrij_trainen",
  "yoga_mobility",
  "kettlebell",
  "kids",
  "senior",
] as const;

export type Pillar = (typeof PILLARS)[number];

export type PlanType =
  | "vrij_trainen"
  | "yoga_mobility"
  | "kettlebell"
  | "groepslessen"
  | "all_inclusive"
  | "kids"
  | "senior"
  | "ten_ride_card"
  | "pt_package"
  | "twelve_week_program";

export const PLAN_COVERAGE: Record<PlanType, Pillar[]> = {
  vrij_trainen: ["vrij_trainen"],
  yoga_mobility: ["yoga_mobility"],
  kettlebell: ["kettlebell"],
  // Gecombineerd lesabonnement: een les is een les, lid mixt zelf binnen
  // de weekcap. Vervangt de losse yoga_mobility- en kettlebell-lijnen.
  groepslessen: ["yoga_mobility", "kettlebell"],
  all_inclusive: ["vrij_trainen", "yoga_mobility", "kettlebell"],
  kids: ["kids"],
  senior: ["senior"],
  ten_ride_card: ["yoga_mobility", "kettlebell"],
  pt_package: [],
  twelve_week_program: ["vrij_trainen", "yoga_mobility", "kettlebell"],
};

export function planCovers(planType: string, pillar: string): boolean {
  const coverage = PLAN_COVERAGE[planType as PlanType];
  if (!coverage) return false;
  return coverage.includes(pillar as Pillar);
}

export const PILLAR_LABELS: Record<Pillar, string> = {
  vrij_trainen: "Vrij trainen",
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
  kids: "Kids",
  senior: "Senior",
};

/** De twee groepslespillars; samen geteld onder een weekcap. */
export const GROUP_PILLARS: readonly Pillar[] = ["yoga_mobility", "kettlebell"];

/**
 * Pillars die onder de weekcap van een membership vallen, afgeleid uit
 * covered_pillars (spec-weekcap-extra-les.md). Bevat de dekking een
 * groepspillar, dan zijn alleen de groepspillars capped en worden ze samen
 * geteld; vrij_trainen valt dan buiten de cap (All Access: vrij trainen
 * onbeperkt). Anders zijn alle gedekte pillars capped (Vrij Trainen 2x/3x
 * houdt zijn cap). Spiegel van tmc.capped_pillars(text[]); de volgorde is
 * alfabetisch, zoals in SQL.
 */
export function cappedPillars(covered: readonly string[] | null | undefined): string[] {
  const list = covered ?? [];
  const groups = list.filter((p) => (GROUP_PILLARS as readonly string[]).includes(p));
  if (groups.length > 0) return [...new Set(groups)].sort();
  return [...list];
}
