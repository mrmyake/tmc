/**
 * Rijstaat van de workout-logger (spec-trainingsprotocol.md, "Vervolg,
 * vorige waarden"). Pure functies, geen React en geen "server-only":
 * draaien in de client en onder de node:test-runner
 * (scripts/workout-logging/rows.test.mts).
 *
 * Per set houdt de client bij:
 *   - weightRaw / repsRaw: wat het lid zelf heeft ingevuld (leeg = niet
 *     aangeraakt, de rij toont dan de ghost value);
 *   - completed: de gewenste staat van het vinkje;
 *   - stored: wat tmc.set_logs volgens de client bevat (null = geen rij);
 *   - phase en foutinfo voor de autosave.
 *
 * Regels:
 *   - Een rij die nooit is aangeraakt (beide velden leeg, niet afgevinkt)
 *     wordt nooit opgeslagen: geen ghost value in de database.
 *   - Elke wijziging van een waarde gaat als draft (completed false) naar
 *     de database, tenzij de set al afgevinkt was; dan blijft hij
 *     afgevinkt en wordt de source opnieuw bepaald.
 *   - Afvinken neemt de getoonde waarden over (materialize) en zet
 *     completed; nog eens tikken zet completed terug, de waarden blijven.
 *   - Beide velden leeg op een opgeslagen, niet afgevinkte rij: de set
 *     wordt verwijderd en de rij toont weer de ghost value.
 */
import { formatWeightForInput, parseRepsInput, parseWeightInput } from "./workout-input";
import { sourceFor, type GhostSet } from "./workout-ghost";

export type SetSource = "previous" | "edited" | null;

export interface StoredSet {
  weightKg: number;
  reps: number;
  completed: boolean;
  source: SetSource;
}

export type RowPhase = "idle" | "saving" | "error";

export interface RowState {
  weightRaw: string;
  repsRaw: string;
  /** Gewenste staat van het vinkje. */
  completed: boolean;
  /** Wat tmc.set_logs volgens de client bevat; null = geen rij. */
  stored: StoredSet | null;
  phase: RowPhase;
  /** Alleen bij phase "saving": opslaan of verwijderen. */
  savingKind: "save" | "delete" | null;
  errorMessage: string | null;
  /** De ene automatische retry is gebruikt; daarna alleen handmatig. */
  autoRetried: boolean;
  /** Na blur: een tussenstand ("82,") wel als melding tonen. */
  showIncomplete: boolean;
}

export type Intent =
  | { kind: "none" }
  | { kind: "save"; weightKg: number; reps: number; completed: boolean; source: SetSource }
  | { kind: "delete" };

/** Hoe de rij eruitziet: ghost (niet aangeraakt), gevuld (aangepast), afgevinkt. */
export type RowVisual = "ghost" | "filled" | "completed";

export type DisplayStatus =
  | "empty"
  | "incomplete"
  | "invalid"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

// COPY: confirm met Marlon
export const ROW_COPY = {
  savedRowPartial: "Vul beide velden in, of maak de rij leeg om de set te verwijderen.",
  completedRowEmpty: "Vul gewicht en reps in, of vink de set uit.",
  weightIncomplete: "Vul een geldig gewicht in.",
};

export function rowKey(programExerciseId: string, setNumber: number): string {
  return `${programExerciseId}:${setNumber}`;
}

export function splitKey(key: string): { programExerciseId: string; setNumber: number } {
  const i = key.lastIndexOf(":");
  return { programExerciseId: key.slice(0, i), setNumber: Number(key.slice(i + 1)) };
}

export function emptyRow(): RowState {
  return {
    weightRaw: "",
    repsRaw: "",
    completed: false,
    stored: null,
    phase: "idle",
    savingKind: null,
    errorMessage: null,
    autoRetried: false,
    showIncomplete: false,
  };
}

export function rowFromStored(stored: StoredSet): RowState {
  return {
    ...emptyRow(),
    weightRaw: formatWeightForInput(stored.weightKg),
    repsRaw: String(stored.reps),
    completed: stored.completed,
    stored,
  };
}

export interface EffectiveValues {
  /** null = leeg of ongeldig. */
  weightKg: number | null;
  reps: number | null;
  weightFromGhost: boolean;
  repsFromGhost: boolean;
}

/** De getoonde waarden: eigen invoer als die geldig is, anders de ghost value. */
export function effectiveValues(row: RowState, ghost: GhostSet | undefined): EffectiveValues {
  const w = parseWeightInput(row.weightRaw);
  const r = parseRepsInput(row.repsRaw);
  const weightFromGhost = w.kind === "empty";
  const repsFromGhost = r.kind === "empty";
  return {
    weightKg: w.kind === "valid" ? w.value : weightFromGhost ? (ghost?.weightKg ?? null) : null,
    reps: r.kind === "valid" ? r.value : repsFromGhost ? (ghost?.reps ?? null) : null,
    weightFromGhost,
    repsFromGhost,
  };
}

/** Kan de set afgevinkt worden: een gewicht (ook 0) en minimaal 1 rep. */
export function canComplete(row: RowState, ghost: GhostSet | undefined): boolean {
  const v = effectiveValues(row, ghost);
  return v.weightKg !== null && v.reps !== null && v.reps >= 1;
}

/**
 * Invoer die de ghost value overneemt: lege velden krijgen de ghost als
 * tekst. Gebruikt bij afvinken en bij de eerste wijziging in een rij, zodat
 * beide velden daarna echte waarden bevatten.
 */
export function materialize(
  row: RowState,
  ghost: GhostSet | undefined,
): Pick<RowState, "weightRaw" | "repsRaw"> {
  const weightRaw =
    row.weightRaw.trim() === "" && ghost && ghost.weightKg !== null
      ? formatWeightForInput(ghost.weightKg)
      : row.weightRaw;
  const repsRaw =
    row.repsRaw.trim() === "" && ghost && ghost.reps !== null ? String(ghost.reps) : row.repsRaw;
  return { weightRaw, repsRaw };
}

/** Wat er met deze rij moet gebeuren, puur uit invoer, vinkje en stored. */
export function intentOf(row: RowState, ghost: GhostSet | undefined): Intent {
  const w = parseWeightInput(row.weightRaw);
  const r = parseRepsInput(row.repsRaw);
  if (w.kind === "empty" && r.kind === "empty") {
    // Niet aangeraakt, of weer leeggemaakt: terug naar de ghost value. Een
    // afgevinkte rij zonder waarden is ongeldig en doet niets.
    if (row.completed) return { kind: "none" };
    return row.stored ? { kind: "delete" } : { kind: "none" };
  }
  if (w.kind !== "valid" || r.kind !== "valid") return { kind: "none" };
  if (
    row.stored &&
    row.stored.weightKg === w.value &&
    row.stored.reps === r.value &&
    row.stored.completed === row.completed
  ) {
    return { kind: "none" };
  }
  return {
    kind: "save",
    weightKg: w.value,
    reps: r.value,
    completed: row.completed,
    source: row.completed ? sourceFor(ghost, w.value, r.value) : null,
  };
}

/** Zichtbare status en melding, puur uit de rij. */
export function describeRow(row: RowState): { status: DisplayStatus; message: string | null } {
  if (row.phase === "saving") return { status: "saving", message: null };
  if (row.phase === "error") return { status: "error", message: row.errorMessage };

  const w = parseWeightInput(row.weightRaw);
  const r = parseRepsInput(row.repsRaw);

  if (w.kind === "empty" && r.kind === "empty") {
    if (row.completed) return { status: "invalid", message: ROW_COPY.completedRowEmpty };
    // Beide leeg op een opgeslagen rij: de delete staat klaar (dirty).
    return { status: row.stored ? "dirty" : "empty", message: null };
  }
  if (w.kind === "invalid") return { status: "invalid", message: w.message };
  if (r.kind === "invalid") return { status: "invalid", message: r.message };
  if (w.kind === "incomplete") {
    return { status: "incomplete", message: row.showIncomplete ? ROW_COPY.weightIncomplete : null };
  }
  if (w.kind === "empty" || r.kind === "empty") {
    // Een veld leeg, het andere gevuld.
    return row.stored || row.completed
      ? { status: "invalid", message: ROW_COPY.savedRowPartial }
      : { status: "incomplete", message: null };
  }
  if (w.kind !== "valid" || r.kind !== "valid") {
    return { status: "incomplete", message: null };
  }
  if (
    row.stored &&
    row.stored.weightKg === w.value &&
    row.stored.reps === r.value &&
    row.stored.completed === row.completed
  ) {
    return { status: "saved", message: null };
  }
  return { status: "dirty", message: null };
}

export function visualOf(row: RowState): RowVisual {
  if (row.completed) return "completed";
  if (row.weightRaw.trim() !== "" || row.repsRaw.trim() !== "" || row.stored) return "filled";
  return "ghost";
}
