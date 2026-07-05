"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProgramExerciseRow } from "@/lib/admin/training-programs-query";
import { saveProgramExercise } from "@/lib/admin/training-programs-actions";
import { AdminField, AdminInput, AdminSelect } from "@/components/ui/AdminField";
import { parseTempoInput, tempoDigit, tempoNotation } from "@/lib/training-tempo";
import type { ExerciseOption } from "./ProgramBuilder";

const ALL_SLOTS = [
  "A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2", "E1", "E2",
] as const;

interface Props {
  dayId: string;
  existing: ProgramExerciseRow | null;
  takenSlots: string[];
  exerciseOptions: ExerciseOption[];
  onDone: () => void;
}

export function ExerciseSlotForm({
  dayId,
  existing,
  takenSlots,
  exerciseOptions,
  onDone,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const freeSlots = ALL_SLOTS.filter((s) => !takenSlots.includes(s));
  const [slot, setSlot] = useState(existing?.slot ?? freeSlots[0] ?? "A1");
  const [exerciseId, setExerciseId] = useState(existing?.exerciseId ?? "");
  const [sets, setSets] = useState(String(existing?.sets ?? 3));
  const [repsMin, setRepsMin] = useState(String(existing?.repsMin ?? 8));
  const [repsMax, setRepsMax] = useState(String(existing?.repsMax ?? 12));
  const [tEcc, setTEcc] = useState(
    existing ? tempoDigit(existing.tempoEccentric) : "2",
  );
  const [tBottom, setTBottom] = useState(
    existing ? tempoDigit(existing.tempoPauseBottom) : "0",
  );
  const [tCon, setTCon] = useState(
    existing ? tempoDigit(existing.tempoConcentric) : "1",
  );
  const [tTop, setTTop] = useState(
    existing ? tempoDigit(existing.tempoPauseTop) : "0",
  );
  const [rest, setRest] = useState(String(existing?.restSeconds ?? 90));
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const tempoValues = [tEcc, tBottom, tCon, tTop].map(parseTempoInput);
  const tempoValid = tempoValues.every((v) => v !== null);
  const preview = tempoValid
    ? tempoNotation(
        tempoValues[0] as number,
        tempoValues[1] as number,
        tempoValues[2] as number,
        tempoValues[3] as number,
      )
    : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tempoValid) {
      // COPY: confirm met Marlon
      setError("Tempo: gebruik cijfers of X (X betekent explosief).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveProgramExercise({
        id: existing?.id,
        dayId,
        slot,
        exerciseId,
        sets: Number(sets),
        repsMin: Number(repsMin),
        repsMax: Number(repsMax),
        tempoEccentric: tempoValues[0] as number,
        tempoPauseBottom: tempoValues[1] as number,
        tempoConcentric: tempoValues[2] as number,
        tempoPauseTop: tempoValues[3] as number,
        restSeconds: Number(rest),
        notes,
      });
      if (res.ok) {
        router.refresh();
        onDone();
      } else {
        setError(res.message);
      }
    });
  }

  const tempoInputClass = "w-14 text-center px-2";

  return (
    <form
      onSubmit={submit}
      className="border border-[color:var(--ink-500)] bg-bg p-5 flex flex-col gap-5 mb-4"
    >
      <header className="flex items-center justify-between">
        <span className="tmc-eyebrow tmc-eyebrow--accent">
          {/* COPY: confirm met Marlon */}
          {existing ? `Slot ${existing.slot} bewerken` : "Oefening toevoegen"}
        </span>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Sluit
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AdminField label="Slot">
          <AdminSelect value={slot} onChange={(e) => setSlot(e.target.value)}>
            {ALL_SLOTS.map((s) => (
              <option key={s} value={s} disabled={takenSlots.includes(s)}>
                {s}
                {/* COPY: confirm met Marlon */}
                {takenSlots.includes(s) ? " (bezet)" : ""}
              </option>
            ))}
          </AdminSelect>
        </AdminField>

        <AdminField label="Oefening" className="col-span-2 md:col-span-3">
          <AdminSelect
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            required
          >
            {/* COPY: confirm met Marlon */}
            <option value="" disabled>
              Kies een oefening
            </option>
            {exerciseOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-md">
        <AdminField label="Sets">
          <AdminInput
            type="number"
            min={1}
            max={20}
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            required
          />
        </AdminField>
        <AdminField label="Reps min">
          <AdminInput
            type="number"
            min={1}
            max={100}
            value={repsMin}
            onChange={(e) => setRepsMin(e.target.value)}
            required
          />
        </AdminField>
        <AdminField label="Reps max">
          <AdminInput
            type="number"
            min={1}
            max={100}
            value={repsMax}
            onChange={(e) => setRepsMax(e.target.value)}
            required
          />
        </AdminField>
      </div>

      <div>
        {/* COPY: confirm met Marlon (label + uitleg) */}
        <span className="tmc-eyebrow block mb-2">
          Tempo (excentrisch · pauze onder · concentrisch · pauze boven)
        </span>
        <div className="flex items-center gap-3">
          <AdminInput
            aria-label="Excentrisch (seconden omlaag)"
            value={tEcc}
            onChange={(e) => setTEcc(e.target.value)}
            maxLength={2}
            className={tempoInputClass}
          />
          <AdminInput
            aria-label="Pauze onder"
            value={tBottom}
            onChange={(e) => setTBottom(e.target.value)}
            maxLength={2}
            className={tempoInputClass}
          />
          <AdminInput
            aria-label="Concentrisch (seconden omhoog)"
            value={tCon}
            onChange={(e) => setTCon(e.target.value)}
            maxLength={2}
            className={tempoInputClass}
          />
          <AdminInput
            aria-label="Pauze boven"
            value={tTop}
            onChange={(e) => setTTop(e.target.value)}
            maxLength={2}
            className={tempoInputClass}
          />
          <span
            className={`text-sm tabular-nums ${preview ? "text-accent" : "text-[color:var(--danger)]"}`}
          >
            {/* COPY: confirm met Marlon */}
            {preview ? `Notatie: ${preview}` : "Cijfer of X"}
          </span>
        </div>
        {/* COPY: confirm met Marlon */}
        <p className="text-xs text-text-muted mt-2">
          X (of 0) betekent explosief.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <AdminField label="Rust (seconden)">
          <AdminInput
            type="number"
            min={0}
            max={3600}
            step={5}
            value={rest}
            onChange={(e) => setRest(e.target.value)}
            required
          />
        </AdminField>
      </div>

      <AdminField label="Notitie" hint="Optioneel, zichtbaar voor het lid">
        <AdminInput
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </AdminField>

      {error && (
        <div
          role="alert"
          className="text-sm p-4 border border-[color:var(--danger)]/40 text-[color:var(--danger)]"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !exerciseId}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig" : existing ? "Opslaan" : "Toevoegen"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Annuleren
        </button>
      </div>
    </form>
  );
}
