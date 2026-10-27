import type { HistorySet } from "@/lib/training-history/types";

/**
 * Gedeelde gewicht- en setnotatie voor de trainingshistorie, op nl-NL
 * (decimale komma: "82,5 kg"). Eén plek, gebruikt door de
 * historiecomponenten in deze map en door weergave 1 op de
 * workout-pagina (WorkoutSessionClient.tsx). Puur, geen "server-only":
 * draait zowel server- als clientside.
 */
const WEIGHT_FORMATTER = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatWeightKg(weightKg: number): string {
  return `${WEIGHT_FORMATTER.format(weightKg)} kg`;
}

/**
 * Gewicht 0 betekent bodyweight: toon reps zonder gewicht. Gewicht > 0
 * op een bodyweight-oefening is toegevoegde last en toont als gewone
 * last, net als elke andere oefening (trainingshistorie-besluit).
 */
export function formatSet(set: Pick<HistorySet, "weightKg" | "reps">): string {
  if (set.weightKg === 0) {
    // COPY: confirm met Marlon
    return `${set.reps} reps`;
  }
  return `${formatWeightKg(set.weightKg)} × ${set.reps}`;
}
