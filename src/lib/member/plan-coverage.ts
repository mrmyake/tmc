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
