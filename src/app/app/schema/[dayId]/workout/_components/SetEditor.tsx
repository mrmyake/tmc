"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  BARBELL_BAR_KG,
  KETTLEBELL_SIZES_KG,
  formatKg,
  platesPerSide,
  type Equipment,
} from "@/lib/equipment";
import type { EffectiveValues } from "@/lib/member/workout-rows";

// COPY: confirm met Marlon
const COPY = {
  weight: "Gewicht",
  perDumbbell: "Kg per dumbbell",
  stackPosition: "Stand op de stack",
  kettlebell: "Kettlebell",
  extraWeight: "Extra gewicht",
  bodyweight: "Lichaamsgewicht",
  reps: "Reps",
  emptyBar: `Lege stang (${BARBELL_BAR_KG} kg)`,
  plates: (perSide: number) => `Stang ${BARBELL_BAR_KG} kg + ${formatKg(perSide)} kg per kant`,
  step: (kg: number) => `stap ${formatKg(kg)} kg`,
  tick: "Set afvinken",
  close: "Klaar",
  needsWeight: "Vul eerst een gewicht in om de set af te vinken.",
  minus: "Minder",
  plus: "Meer",
};

interface Props {
  setNumber: number;
  equipment: Equipment | null;
  stepKg: number;
  weightRaw: string;
  repsRaw: string;
  effective: EffectiveValues;
  completed: boolean;
  canTick: boolean;
  disabled: boolean;
  onWeightChange: (raw: string) => void;
  onRepsChange: (raw: string) => void;
  onStepWeight: (direction: 1 | -1) => void;
  onStepReps: (direction: 1 | -1) => void;
  onPickWeight: (kg: number) => void;
  onBlur: () => void;
  onTick: () => void;
  onClose: () => void;
}

const stepperButtonClass =
  "inline-flex items-center justify-center size-11 rounded-[4px] border border-[color:var(--ink-500)] text-text hover:border-accent hover:text-accent active:scale-[0.97] transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer";

/**
 * Inline editor onder een setrij. De gewichtsinvoer hangt af van het type
 * materiaal: stepper (barbell met schijvenberekening, dumbbell, machine,
 * onbekend), chips (kettlebell) of ingeklapt extra gewicht (bodyweight).
 * Het grote getal is een tekstveld met inputmode decimal; komma en punt
 * zijn allebei goed (parsing in workout-input.ts).
 */
export function SetEditor({
  setNumber,
  equipment,
  stepKg,
  weightRaw,
  repsRaw,
  effective,
  completed,
  canTick,
  disabled,
  onWeightChange,
  onRepsChange,
  onStepWeight,
  onStepReps,
  onPickWeight,
  onBlur,
  onTick,
  onClose,
}: Props) {
  const isBodyweight = equipment === "bodyweight";
  const [extraOpen, setExtraOpen] = useState(
    isBodyweight && effective.weightKg !== null && effective.weightKg > 0,
  );

  const weightDisplay =
    weightRaw !== ""
      ? weightRaw
      : effective.weightKg !== null
        ? formatKg(effective.weightKg)
        : "";
  const repsDisplay =
    repsRaw !== "" ? repsRaw : effective.reps !== null ? String(effective.reps) : "";

  const weightLabel =
    equipment === "dumbbell"
      ? COPY.perDumbbell
      : equipment === "machine"
        ? COPY.stackPosition
        : equipment === "kettlebell"
          ? COPY.kettlebell
          : isBodyweight
            ? COPY.extraWeight
            : COPY.weight;

  const showWeight = !isBodyweight || extraOpen;

  return (
    <div className="mt-2 rounded-[8px] border border-[color:var(--ink-500)] bg-bg px-4 py-4 flex flex-col gap-5">
      {isBodyweight && !extraOpen && (
        <button
          type="button"
          onClick={() => setExtraOpen(true)}
          disabled={disabled}
          className="self-start text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted hover:text-accent transition-colors cursor-pointer disabled:opacity-40"
        >
          + {COPY.extraWeight}
        </button>
      )}

      {showWeight && (
        <div className="flex flex-col gap-3">
          <span className="tmc-eyebrow">
            {weightLabel}
            {equipment !== "kettlebell" && (
              <span className="normal-case tracking-normal text-text-muted/70">
                {" "}
                · {COPY.step(stepKg)}
              </span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={COPY.minus}
              onClick={() => onStepWeight(-1)}
              disabled={disabled}
              className={stepperButtonClass}
            >
              <Minus size={16} strokeWidth={1.8} />
            </button>
            <div className="flex-1 flex items-baseline justify-center gap-1.5">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={`Set ${setNumber} gewicht in kg`}
                value={weightDisplay}
                disabled={disabled}
                onChange={(e) => onWeightChange(e.target.value)}
                onBlur={onBlur}
                className={`w-28 bg-transparent text-center font-[family-name:var(--font-playfair)] text-4xl leading-none tracking-[-0.02em] outline-none border-b border-transparent focus:border-accent ${
                  weightRaw === "" ? "text-text-muted" : "text-text"
                }`}
              />
              <span className="text-text-muted text-sm">kg</span>
            </div>
            <button
              type="button"
              aria-label={COPY.plus}
              onClick={() => onStepWeight(1)}
              disabled={disabled}
              className={stepperButtonClass}
            >
              <Plus size={16} strokeWidth={1.8} />
            </button>
          </div>

          {equipment === "barbell" && effective.weightKg !== null && (
            <p className="text-center text-xs text-text-muted">
              {(() => {
                const perSide = platesPerSide(effective.weightKg);
                return perSide === null ? COPY.emptyBar : COPY.plates(perSide);
              })()}
            </p>
          )}

          {isBodyweight && (effective.weightKg === null || effective.weightKg === 0) && (
            <p className="text-center text-xs text-text-muted">{COPY.bodyweight}</p>
          )}

          {equipment === "kettlebell" && (
            <div className="flex flex-wrap gap-2 justify-center">
              {KETTLEBELL_SIZES_KG.map((kg) => {
                const selected = effective.weightKg === kg;
                return (
                  <button
                    key={kg}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onPickWeight(kg)}
                    disabled={disabled}
                    className={`min-w-11 min-h-11 px-3 rounded-[4px] border text-sm tabular-nums transition-colors cursor-pointer disabled:opacity-40 ${
                      selected
                        ? "border-accent bg-accent text-bg"
                        : "border-[color:var(--ink-500)] text-text hover:border-accent hover:text-accent"
                    }`}
                  >
                    {formatKg(kg)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="tmc-eyebrow">{COPY.reps}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={COPY.minus}
            onClick={() => onStepReps(-1)}
            disabled={disabled}
            className={stepperButtonClass}
          >
            <Minus size={16} strokeWidth={1.8} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={`Set ${setNumber} reps`}
            value={repsDisplay}
            disabled={disabled}
            onChange={(e) => onRepsChange(e.target.value)}
            onBlur={onBlur}
            className={`flex-1 bg-transparent text-center font-[family-name:var(--font-playfair)] text-4xl leading-none tracking-[-0.02em] outline-none border-b border-transparent focus:border-accent ${
              repsRaw === "" ? "text-text-muted" : "text-text"
            }`}
          />
          <button
            type="button"
            aria-label={COPY.plus}
            onClick={() => onStepReps(1)}
            disabled={disabled}
            className={stepperButtonClass}
          >
            <Plus size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {completed ? (
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-[4px] text-xs font-medium uppercase tracking-[0.18em] border border-accent text-accent hover:bg-accent hover:text-bg transition-colors cursor-pointer disabled:opacity-40"
          >
            {COPY.close}
          </button>
        ) : (
          <button
            type="button"
            onClick={onTick}
            disabled={disabled || !canTick}
            className="inline-flex items-center justify-center min-h-11 px-6 rounded-[4px] text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          >
            {COPY.tick}
          </button>
        )}
        {!completed && !canTick && (
          <p className="text-center text-xs text-text-muted">{COPY.needsWeight}</p>
        )}
      </div>
    </div>
  );
}
