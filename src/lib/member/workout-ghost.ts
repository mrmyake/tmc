/**
 * Ghost values voor de workout-logger (spec-trainingsprotocol.md,
 * "Vervolg, vorige waarden"). Pure functies, geen React en geen
 * "server-only": draaien in de client en onder de node:test-runner
 * (scripts/workout-logging/ghost.test.mts).
 *
 * Bron van "vorige keer": de meest recente afgeronde sessie van dezelfde
 * klant met dezelfde exercise_id waarin minstens een set is afgevinkt.
 * Die selectie gebeurt in training-history/aggregate.ts
 * (buildPreviousLogsByExercise) bovenop tmc.set_log_history, die sinds
 * migratie 20261031120000 alleen afgevinkte sets bevat. Deze module
 * vertaalt zo'n referentie naar een ghost per setnummer:
 *   - per setnummer de waarde van die set;
 *   - ontbreekt die (vorige keer minder sets), dan de laatste gedane set;
 *   - geen historie: startgewicht van de coach en reps_min als reps;
 *   - geen startgewicht: gewicht blijft leeg (null), behalve bij
 *     bodyweight, waar leeg 0 betekent en de set dus altijd afgevinkt
 *     kan worden.
 */
import type { Equipment } from "../equipment";

export interface GhostSet {
  /** null = geen ghost-gewicht, de set kan pas afgevinkt worden als er een gewicht staat. */
  weightKg: number | null;
  reps: number | null;
  /** true = uit de historie; false = startgewicht van de coach of leeg. */
  fromPrevious: boolean;
}

export interface GhostSourceSet {
  setNumber: number;
  weightKg: number;
  reps: number;
}

export interface GhostExerciseInput {
  sets: number;
  repsMin: number;
  startWeightKg: number | null;
  equipment: Equipment | null;
}

/** Ghost per setnummer (1 t/m sets). */
export function buildGhostSets(
  exercise: GhostExerciseInput,
  previousSets: GhostSourceSet[] | null | undefined,
): Record<number, GhostSet> {
  const result: Record<number, GhostSet> = {};
  const previous = (previousSets ?? []).slice().sort((a, b) => a.setNumber - b.setNumber);
  const last = previous.length > 0 ? previous[previous.length - 1] : null;

  for (let n = 1; n <= exercise.sets; n++) {
    if (last) {
      const exact = previous.find((s) => s.setNumber === n) ?? last;
      result[n] = { weightKg: exact.weightKg, reps: exact.reps, fromPrevious: true };
      continue;
    }
    const weightKg =
      exercise.startWeightKg ?? (exercise.equipment === "bodyweight" ? 0 : null);
    result[n] = { weightKg, reps: exercise.repsMin, fromPrevious: false };
  }

  return result;
}

/**
 * Bron van een afgevinkte set (tmc.set_logs.source): gelijk aan de ghost
 * is 'previous', anders 'edited'. Zonder ghost-gewicht is elke waarde een
 * eigen keuze en dus 'edited'.
 */
export function sourceFor(
  ghost: GhostSet | undefined,
  weightKg: number,
  reps: number,
): "previous" | "edited" {
  if (!ghost || ghost.weightKg === null || ghost.reps === null) return "edited";
  return ghost.weightKg === weightKg && ghost.reps === reps ? "previous" : "edited";
}

/** Verschil met vorige keer; null als er geen historie of geen verschil is. */
export function deltaFromPrevious(
  ghost: GhostSet | undefined,
  weightKg: number,
  reps: number,
): { weightKg: number; reps: number } | null {
  if (!ghost || !ghost.fromPrevious || ghost.weightKg === null || ghost.reps === null) {
    return null;
  }
  const dw = Math.round((weightKg - ghost.weightKg) * 100) / 100;
  const dr = reps - ghost.reps;
  if (dw === 0 && dr === 0) return null;
  return { weightKg: dw, reps: dr };
}

/** Kalenderdagen tussen twee momenten in de Amsterdamse tijdzone. */
export function daysBetweenAmsterdam(earlier: Date, later: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const toUtcDay = (d: Date) => {
    const parts = fmt.formatToParts(d);
    const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(pick("year"), pick("month") - 1, pick("day"));
  };
  return Math.round((toUtcDay(later) - toUtcDay(earlier)) / 86400000);
}
