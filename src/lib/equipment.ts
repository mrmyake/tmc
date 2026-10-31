/**
 * Type materiaal per oefening (spec-trainingsprotocol.md, "Vervolg,
 * vorige waarden"). Pure module, geen React en geen "server-only": draait
 * in de client, op de server en onder de node:test-runner
 * (scripts/workout-logging/equipment.test.mts).
 *
 * De database (tmc.exercises.equipment) kent dezelfde vijf waarden plus
 * NULL voor "nog niet ingedeeld". De editor in de workout-logger kiest op
 * dit type: stepper (barbell, dumbbell, machine, onbekend), chips
 * (kettlebell) of alleen reps (bodyweight).
 */

export const EQUIPMENT_TYPES = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "bodyweight",
] as const;

export type Equipment = (typeof EQUIPMENT_TYPES)[number];

export function isEquipment(value: unknown): value is Equipment {
  return typeof value === "string" && (EQUIPMENT_TYPES as readonly string[]).includes(value);
}

// COPY: confirm met Marlon
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  machine: "Kabel / machine",
  bodyweight: "Lichaamsgewicht",
};

// COPY: confirm met Marlon
export const EQUIPMENT_UNKNOWN_LABEL = "Nog niet ingedeeld";

export function equipmentLabel(equipment: Equipment | null): string {
  return equipment ? EQUIPMENT_LABEL[equipment] : EQUIPMENT_UNKNOWN_LABEL;
}

/**
 * Standaardstap van de gewicht-stepper per type (besluit 2026-10-31):
 * barbell 2,5, dumbbell 2, machine 5, onbekend 2,5. Kettlebell werkt met
 * chips en heeft geen stepper; het extra gewicht bij bodyweight loopt in
 * stappen van 2,5 (vest of gordel).
 */
export const DEFAULT_WEIGHT_STEP_KG: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2,
  kettlebell: 4,
  machine: 5,
  bodyweight: 2.5,
};

export const UNKNOWN_WEIGHT_STEP_KG = 2.5;

export function defaultWeightStep(equipment: Equipment | null): number {
  return equipment ? DEFAULT_WEIGHT_STEP_KG[equipment] : UNKNOWN_WEIGHT_STEP_KG;
}

/** De effectieve stap: de overschrijving van de coach, anders de standaard van het type. */
export function effectiveWeightStep(
  equipment: Equipment | null,
  overrideStepKg: number | null | undefined,
): number {
  if (typeof overrideStepKg === "number" && Number.isFinite(overrideStepKg) && overrideStepKg > 0) {
    return overrideStepKg;
  }
  return defaultWeightStep(equipment);
}

// CONFIRM: kettlebellmaten van de studio met Marlon
export const KETTLEBELL_SIZES_KG: readonly number[] = [8, 12, 16, 20, 24, 28, 32];

/** Gewicht van een lege olympische stang. */
export const BARBELL_BAR_KG = 20;

/** Maximaal gewicht dat een set_logs-rij kan dragen (numeric(5,2)). */
export const MAX_WEIGHT_KG = 999.99;

/**
 * Schijven per kant bij een barbell. null bij 20 kg of minder (lege stang).
 * Afgerond op 2 decimalen tegen floating-point-ruis (22,5 - 20 = 2,5).
 */
export function platesPerSide(totalKg: number): number | null {
  if (!Number.isFinite(totalKg) || totalKg <= BARBELL_BAR_KG) return null;
  return roundKg((totalKg - BARBELL_BAR_KG) / 2);
}

/** Afronden op 2 decimalen, zonder floating-point-ruis (0,1 + 0,2). */
export function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Een stap omhoog of omlaag, begrensd op 0 en MAX_WEIGHT_KG. */
export function stepWeight(current: number | null, stepKg: number, direction: 1 | -1): number {
  const base = current ?? 0;
  const next = roundKg(base + direction * stepKg);
  if (next < 0) return 0;
  if (next > MAX_WEIGHT_KG) return MAX_WEIGHT_KG;
  return next;
}

/** Een reps-stap, begrensd op 0 (0 = nog niets, de set kan dan niet afgevinkt worden). */
export function stepReps(current: number | null, direction: 1 | -1): number {
  const next = (current ?? 0) + direction;
  return next < 0 ? 0 : next;
}

/**
 * Gewicht als Nederlandse tekst zonder eenheid ("22,5", "80"). Zelfde
 * notatie als formatWeightKg in components/training-history/formatSet.ts,
 * maar zonder " kg" zodat de kolommen en labels de eenheid zelf kiezen.
 */
export function formatKg(value: number): string {
  const rounded = roundKg(value);
  const [whole, frac] = String(rounded).split(".");
  return frac ? `${whole},${frac}` : whole;
}

/** "+2,5 kg" / "-5 kg" / "+1 reps"; null als er geen verschil is. */
export function formatDelta(delta: number, unit: "kg" | "reps"): string | null {
  const rounded = unit === "kg" ? roundKg(delta) : Math.round(delta);
  if (rounded === 0) return null;
  const sign = rounded > 0 ? "+" : "-";
  const abs = Math.abs(rounded);
  return `${sign}${unit === "kg" ? formatKg(abs) : abs} ${unit}`;
}
