export const CHECK_IN_PILLAR_OPTIONS = [
  "yoga_mobility",
  "kettlebell",
  "vrij_trainen",
  "kids",
  "senior",
] as const;

export type CheckInPillar = (typeof CHECK_IN_PILLAR_OPTIONS)[number];
