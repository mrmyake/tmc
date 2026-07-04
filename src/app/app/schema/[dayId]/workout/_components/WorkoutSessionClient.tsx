"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkoutDay, LoggedSet } from "@/lib/member/workout-query";
import {
  completeWorkoutSession,
  logSet,
  startWorkoutSession,
} from "@/lib/member/workout-actions";
import { tempoNotation, tempoPlainLanguage } from "@/lib/training-tempo";

interface Props {
  day: WorkoutDay;
  initialSessionId: string | null;
  initialLoggedSets: LoggedSet[];
  previousSets: Record<string, LoggedSet[]>;
}

interface RowState {
  weightKg: string;
  reps: string;
  saved: boolean;
}

function rowKey(programExerciseId: string, setNumber: number): string {
  return `${programExerciseId}:${setNumber}`;
}

function initialRows(logged: LoggedSet[]): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const s of logged) {
    rows[rowKey(s.programExerciseId, s.setNumber)] = {
      weightKg: String(s.weightKg),
      reps: String(s.reps),
      saved: true,
    };
  }
  return rows;
}

export function WorkoutSessionClient({
  day,
  initialSessionId,
  initialLoggedSets,
  previousSets,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [startError, setStartError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>(
    initialRows(initialLoggedSets),
  );
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function handleStart() {
    setStartError(null);
    startTransition(async () => {
      const res = await startWorkoutSession(day.id);
      if (res.ok) {
        setSessionId(res.sessionId);
      } else {
        setStartError(res.message);
      }
    });
  }

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((r) => {
      const base = r[key] ?? { weightKg: "", reps: "", saved: false };
      return { ...r, [key]: { ...base, ...patch, saved: false } };
    });
  }

  function handleLogSet(programExerciseId: string, setNumber: number) {
    if (!sessionId) return;
    const key = rowKey(programExerciseId, setNumber);
    const row = rows[key];
    const weightKg = Number(row?.weightKg);
    const reps = Number(row?.reps);

    if (!row?.weightKg || !row?.reps || !Number.isFinite(weightKg) || weightKg < 0 || !Number.isInteger(reps) || reps < 0) {
      // COPY: confirm met Marlon
      setRowErrors((e) => ({ ...e, [key]: "Vul een geldig gewicht en aantal reps in." }));
      return;
    }

    setRowErrors((e) => ({ ...e, [key]: "" }));
    setSavingKey(key);
    startTransition(async () => {
      const res = await logSet({
        sessionId,
        programExerciseId,
        setNumber,
        weightKg,
        reps,
      });
      setSavingKey(null);
      if (res.ok) {
        setRows((r) => ({ ...r, [key]: { ...r[key], saved: true } }));
      } else {
        setRowErrors((e) => ({ ...e, [key]: res.message }));
      }
    });
  }

  function handleComplete() {
    if (!sessionId) return;
    // COPY: confirm met Marlon
    const ok = window.confirm("Workout afronden?");
    if (!ok) return;
    startTransition(async () => {
      const res = await completeWorkoutSession(sessionId);
      if (res.ok) {
        router.push("/app/schema");
      } else {
        window.alert(res.message);
      }
    });
  }

  return (
    <div>
      <header className="mb-10">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Workout
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
          {/* COPY: confirm met Marlon */}
          Dag {day.dayNumber}
          {day.label ? `: ${day.label}` : ""}
        </h1>

        {!sessionId && (
          <div>
            <button
              type="button"
              onClick={handleStart}
              disabled={pending}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {pending ? "Bezig" : "Start workout"}
            </button>
            {startError && (
              <p className="text-[color:var(--danger)] text-sm mt-3">
                {startError}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-col gap-10">
        {day.exercises.map((ex) => (
          <section
            key={ex.id}
            className="border border-[color:var(--ink-500)] bg-bg-elevated"
          >
            <header className="px-6 py-4 border-b border-[color:var(--ink-500)]/60">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-accent font-medium tabular-nums text-sm">
                  {ex.slot}
                </span>
                <span className="text-text font-medium">{ex.exerciseName}</span>
              </div>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-xs">
                {ex.repsMin === ex.repsMax ? ex.repsMin : `${ex.repsMin}-${ex.repsMax}`}{" "}
                reps · Tempo{" "}
                {tempoNotation(
                  ex.tempoEccentric,
                  ex.tempoPauseBottom,
                  ex.tempoConcentric,
                  ex.tempoPauseTop,
                )}{" "}
                · Rust {ex.restSeconds}s
              </p>
              <p className="text-text-muted text-xs mt-1">
                {tempoPlainLanguage(
                  ex.tempoEccentric,
                  ex.tempoPauseBottom,
                  ex.tempoConcentric,
                  ex.tempoPauseTop,
                )}
              </p>
            </header>

            {sessionId && (
              <div className="px-6 py-5 flex flex-col gap-3">
                {Array.from({ length: ex.sets }, (_, i) => i + 1).map(
                  (setNumber) => {
                    const key = rowKey(ex.id, setNumber);
                    const row = rows[key] ?? { weightKg: "", reps: "", saved: false };
                    const prev = previousSets[ex.id]?.find(
                      (s) => s.setNumber === setNumber,
                    );
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center gap-3"
                      >
                        {/* COPY: confirm met Marlon */}
                        <span className="text-text-muted text-xs w-14 shrink-0">
                          Set {setNumber}
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min={0}
                          // COPY: confirm met Marlon
                          placeholder="kg"
                          value={row.weightKg}
                          onChange={(e) =>
                            updateRow(key, { weightKg: e.target.value })
                          }
                          className="w-20 bg-bg border border-[color:var(--ink-500)] px-2 py-1.5 text-sm text-text"
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          // COPY: confirm met Marlon
                          placeholder="reps"
                          value={row.reps}
                          onChange={(e) =>
                            updateRow(key, { reps: e.target.value })
                          }
                          className="w-20 bg-bg border border-[color:var(--ink-500)] px-2 py-1.5 text-sm text-text"
                        />
                        <button
                          type="button"
                          onClick={() => handleLogSet(ex.id, setNumber)}
                          disabled={pending && savingKey === key}
                          className={`px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] border transition-colors cursor-pointer disabled:opacity-50 ${
                            row.saved
                              ? "border-accent/50 text-accent"
                              : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                          }`}
                        >
                          {/* COPY: confirm met Marlon */}
                          {row.saved ? "Gelogd" : "Log set"}
                        </button>
                        {prev && (
                          // COPY: confirm met Marlon
                          <span className="text-text-muted text-xs">
                            Vorige keer: {prev.weightKg} kg × {prev.reps}
                          </span>
                        )}
                        {rowErrors[key] && (
                          <span className="text-[color:var(--danger)] text-xs w-full">
                            {rowErrors[key]}
                          </span>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {sessionId && (
        <div className="mt-10">
          <button
            type="button"
            onClick={handleComplete}
            disabled={pending}
            className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Workout afronden
          </button>
        </div>
      )}
    </div>
  );
}
