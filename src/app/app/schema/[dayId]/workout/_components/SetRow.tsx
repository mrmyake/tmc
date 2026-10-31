"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { formatDelta, formatKg, type Equipment } from "@/lib/equipment";
import type { GhostSet } from "@/lib/member/workout-ghost";
import type { DisplayStatus, EffectiveValues, RowVisual } from "@/lib/member/workout-rows";

// COPY: confirm met Marlon
const COPY = {
  set: (n: number) => `Set ${n}`,
  tick: (n: number) => `Set ${n} afvinken`,
  untick: (n: number) => `Set ${n} weer openzetten`,
  editWeight: (n: number) => `Set ${n}: gewicht aanpassen`,
  editReps: (n: number) => `Set ${n}: reps aanpassen`,
  kgPlaceholder: "kg",
  repsPlaceholder: "reps",
  saving: "Bezig met opslaan",
  deleting: "Bezig met verwijderen",
  saved: "Opgeslagen",
  saveFailed: "Opslaan mislukt",
  retry: "Opnieuw proberen",
  changed: "Aangepast t.o.v. vorige keer:",
};

export interface SetRowProps {
  setNumber: number;
  equipment: Equipment | null;
  ghost: GhostSet | undefined;
  effective: EffectiveValues;
  visual: RowVisual;
  status: DisplayStatus;
  savingKind: "save" | "delete" | null;
  message: string | null;
  completed: boolean;
  canTick: boolean;
  showWeightColumn: boolean;
  open: boolean;
  disabled: boolean;
  /** Verschil met vorige keer; alleen gevuld bij een afgevinkte set met historie. */
  delta: { weightKg: number; reps: number } | null;
  onOpen: () => void;
  onToggle: () => void;
  onRetry: () => void;
  children?: ReactNode;
}

/** "80 × 5", "22,5 × 8"; bodyweight: "8" of "+10 × 8". */
export function formatPrevious(ghost: GhostSet | undefined, equipment: Equipment | null): string {
  if (!ghost || !ghost.fromPrevious || ghost.weightKg === null || ghost.reps === null) return "";
  if (equipment === "bodyweight") {
    return ghost.weightKg === 0
      ? String(ghost.reps)
      : `+${formatKg(ghost.weightKg)} × ${ghost.reps}`;
  }
  return `${formatKg(ghost.weightKg)} × ${ghost.reps}`;
}

function formatWeightCell(weightKg: number | null, equipment: Equipment | null): string {
  if (weightKg === null) return "";
  if (equipment === "bodyweight") return weightKg === 0 ? "0" : `+${formatKg(weightKg)}`;
  return formatKg(weightKg);
}

/**
 * Een setrij: SET | VORIGE | KG | REPS | vinkje. Drie toestanden: ghost
 * (gestippeld, gedempt), gevuld (aangepast, nog niet afgevinkt) en
 * afgevinkt (lichte champagne-achtergrond, champagne vinkje). Tikken op
 * gewicht of reps opent de editor (children) onder de rij.
 */
export function SetRow({
  setNumber,
  equipment,
  ghost,
  effective,
  visual,
  status,
  savingKind,
  message,
  completed,
  canTick,
  showWeightColumn,
  open,
  disabled,
  delta,
  onOpen,
  onToggle,
  onRetry,
  children,
}: SetRowProps) {
  const cellBase =
    "min-h-11 w-full rounded-[4px] px-2 text-sm tabular-nums text-center flex items-center justify-center transition-colors cursor-pointer disabled:cursor-default";
  const cellVisual =
    visual === "ghost"
      ? "border border-dashed border-text-muted/50 text-text-muted"
      : visual === "completed"
        ? "border border-accent/40 bg-bg text-text"
        : "border border-[color:var(--ink-500)] bg-bg text-text";
  const invalidRing = status === "invalid" || status === "error" ? "ring-1 ring-[color:var(--danger)]/60" : "";

  const weightText = formatWeightCell(effective.weightKg, equipment);
  const repsText = effective.reps === null ? "" : String(effective.reps);
  const deltaParts = delta
    ? [formatDelta(delta.weightKg, "kg"), formatDelta(delta.reps, "reps")].filter(Boolean)
    : [];

  const gridCols = showWeightColumn
    ? "grid-cols-[2rem_minmax(0,1fr)_4rem_3.5rem_2.75rem]"
    : "grid-cols-[2rem_minmax(0,1fr)_3.5rem_2.75rem]";

  return (
    <div
      className={`rounded-[8px] px-2 py-1.5 -mx-2 transition-colors ${
        completed ? "bg-accent/10" : ""
      }`}
    >
      <div className={`grid ${gridCols} items-center gap-2`}>
        <span className="text-text-muted text-xs tabular-nums">{setNumber}</span>
        <span className="text-text-muted text-xs tabular-nums truncate">
          {formatPrevious(ghost, equipment)}
        </span>
        {showWeightColumn && (
          <button
            type="button"
            aria-label={COPY.editWeight(setNumber)}
            aria-expanded={open}
            onClick={onOpen}
            disabled={disabled}
            className={`${cellBase} ${cellVisual} ${invalidRing}`}
          >
            {weightText || <span className="text-text-muted/60">{COPY.kgPlaceholder}</span>}
          </button>
        )}
        <button
          type="button"
          aria-label={COPY.editReps(setNumber)}
          aria-expanded={open}
          onClick={onOpen}
          disabled={disabled}
          className={`${cellBase} ${cellVisual} ${invalidRing}`}
        >
          {repsText || <span className="text-text-muted/60">{COPY.repsPlaceholder}</span>}
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? COPY.untick(setNumber) : COPY.tick(setNumber)}
          onClick={onToggle}
          disabled={disabled || (!completed && !canTick)}
          className={`size-11 rounded-[4px] border flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${
            completed
              ? "border-accent bg-accent text-bg"
              : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <Check size={18} strokeWidth={2.2} />
        </button>
      </div>

      {(deltaParts.length > 0 || message || status === "saving" || status === "error" || (status === "saved" && !completed)) && (
        <div className="mt-1 pl-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          {deltaParts.length > 0 && (
            <span className="text-accent">
              {COPY.changed} {deltaParts.join(", ")}
            </span>
          )}
          {status === "saving" && (
            <span aria-live="polite" className="text-text-muted uppercase tracking-[0.14em]">
              {savingKind === "delete" ? COPY.deleting : COPY.saving}
            </span>
          )}
          {status === "saved" && !completed && (
            <span aria-live="polite" className="text-text-muted uppercase tracking-[0.14em]">
              {COPY.saved}
            </span>
          )}
          {status === "error" && (
            <span aria-live="polite" className="text-[color:var(--danger)] flex items-center gap-2">
              {COPY.saveFailed}
              <button
                type="button"
                onClick={onRetry}
                disabled={disabled}
                className="underline underline-offset-2 text-text-muted hover:text-accent disabled:opacity-50 cursor-pointer"
              >
                {COPY.retry}
              </button>
            </span>
          )}
          {message && status !== "error" && (
            <span className="text-[color:var(--danger)]">{message}</span>
          )}
        </div>
      )}

      {open && children}
    </div>
  );
}
