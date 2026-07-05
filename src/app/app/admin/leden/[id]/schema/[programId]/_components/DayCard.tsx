"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import type {
  ProgramDayRow,
  ProgramExerciseRow,
} from "@/lib/admin/training-programs-query";
import {
  deleteProgramDay,
  deleteProgramExercise,
  updateProgramDayLabel,
} from "@/lib/admin/training-programs-actions";
import { AdminInput } from "@/components/ui/AdminField";
import { tempoNotation } from "@/lib/training-tempo";
import { ExerciseSlotForm } from "./ExerciseSlotForm";
import type { ExerciseOption } from "./ProgramBuilder";

interface Props {
  day: ProgramDayRow;
  editable: boolean;
  exerciseOptions: ExerciseOption[];
}

export function DayCard({ day, editable, exerciseOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(day.label ?? "");
  const [editingExercise, setEditingExercise] =
    useState<ProgramExerciseRow | null>(null);
  const [addingExercise, setAddingExercise] = useState(false);

  const showForm = addingExercise || editingExercise !== null;
  const takenSlots = day.exercises
    .filter((e) => e.id !== editingExercise?.id)
    .map((e) => e.slot);

  function onSaveLabel() {
    startTransition(async () => {
      const res = await updateProgramDayLabel({ dayId: day.id, label });
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  function onDeleteDay() {
    // COPY: confirm met Marlon
    const ok = window.confirm(
      `Dag ${day.dayNumber} verwijderen, inclusief alle oefeningen op deze dag?`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteProgramDay(day.id);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  function onDeleteExercise(row: ProgramExerciseRow) {
    // COPY: confirm met Marlon
    const ok = window.confirm(
      `${row.slot} ${row.exerciseName} verwijderen uit deze dag?`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteProgramExercise(row.id);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  return (
    <section className="border border-[color:var(--ink-500)] bg-bg-elevated">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[color:var(--ink-500)]/60">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          <span className="tmc-eyebrow tmc-eyebrow--accent shrink-0">
            {/* COPY: confirm met Marlon */}
            Dag {day.dayNumber}
          </span>
          {editable ? (
            <div className="flex items-center gap-2">
              <AdminInput
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                // COPY: confirm met Marlon
                placeholder="Label, bv. Onderlichaam"
                maxLength={120}
                className="px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={onSaveLabel}
                disabled={pending || label === (day.label ?? "")}
                className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted hover:text-accent transition-colors disabled:opacity-40 cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Opslaan
              </button>
            </div>
          ) : (
            day.label && (
              <span className="text-text text-sm font-medium truncate">
                {day.label}
              </span>
            )
          )}
        </div>
        {editable && (
          <button
            type="button"
            onClick={onDeleteDay}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Trash2 size={12} strokeWidth={1.8} />
            {/* COPY: confirm met Marlon */}
            Dag verwijderen
          </button>
        )}
      </header>

      <div className="px-6 py-5">
        {day.exercises.length === 0 && !showForm && (
          // COPY: confirm met Marlon
          <p className="text-text-muted text-sm mb-4">
            Nog geen oefeningen op deze dag.
          </p>
        )}

        {day.exercises.length > 0 && (
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ink-500)]/60 text-left">
                  {/* COPY: confirm met Marlon (kolomkoppen) */}
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Slot</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Oefening</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Sets</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Reps</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Tempo</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Rust</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Notitie</th>
                  {editable && <th scope="col" className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {day.exercises.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[color:var(--ink-500)]/30"
                  >
                    <td className="py-3 pr-4 font-medium text-accent tabular-nums">
                      {row.slot}
                    </td>
                    <td className="py-3 pr-4 text-text">
                      {row.exerciseName}
                      {!row.exerciseIsActive && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--danger)]">
                          {/* COPY: confirm met Marlon */}
                          Gedeactiveerd
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-text">
                      {row.sets}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-text">
                      {row.repsMin === row.repsMax
                        ? row.repsMin
                        : `${row.repsMin}-${row.repsMax}`}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-text">
                      {tempoNotation(
                        row.tempoEccentric,
                        row.tempoPauseBottom,
                        row.tempoConcentric,
                        row.tempoPauseTop,
                      )}
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-text">
                      {row.restSeconds}s
                    </td>
                    <td className="py-3 pr-4 text-text-muted max-w-[240px] truncate">
                      {row.notes ?? ""}
                    </td>
                    {editable && (
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setAddingExercise(false);
                            setEditingExercise(row);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors cursor-pointer"
                        >
                          <Pencil size={11} strokeWidth={1.8} />
                          {/* COPY: confirm met Marlon */}
                          Bewerk
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteExercise(row)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Trash2 size={11} strokeWidth={1.8} />
                          {/* COPY: confirm met Marlon */}
                          Weg
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <ExerciseSlotForm
            dayId={day.id}
            existing={editingExercise}
            takenSlots={takenSlots}
            exerciseOptions={exerciseOptions}
            onDone={() => {
              setAddingExercise(false);
              setEditingExercise(null);
            }}
          />
        )}

        {editable && !showForm && day.exercises.length < 10 && (
          <button
            type="button"
            onClick={() => setAddingExercise(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            <Plus size={12} strokeWidth={1.8} />
            {/* COPY: confirm met Marlon */}
            Oefening toevoegen
          </button>
        )}
      </div>
    </section>
  );
}
