/**
 * Slotlijst voor trainingsschema's (spec-trainingsprotocol.md): supersets
 * A1/A2 t/m G1/G2, dus maximaal 14 oefeningen per dag. Moet gelijk blijven
 * aan de DB-check `tmc.program_exercises_slot_check` (`^[A-G][12]$`).
 */
export const SLOT_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;

export const ALL_SLOTS = SLOT_LETTERS.flatMap((letter) => [
  `${letter}1`,
  `${letter}2`,
]);

export const FIRST_SLOT = ALL_SLOTS[0];
export const LAST_SLOT = ALL_SLOTS[ALL_SLOTS.length - 1];
