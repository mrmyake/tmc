"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2, CheckCircle2 } from "lucide-react";
import type { ProgramDetail } from "@/lib/admin/training-programs-query";
import {
  activateProgram,
  addProgramDay,
  deleteDraftProgram,
  duplicateProgram,
  updateProgramMeta,
} from "@/lib/admin/training-programs-actions";
import { AdminField, AdminInput, AdminTextarea } from "@/components/ui/AdminField";
import { DayCard } from "./DayCard";

export interface ExerciseOption {
  id: string;
  name: string;
}

interface Props {
  program: ProgramDetail;
  exerciseOptions: ExerciseOption[];
}

// COPY: confirm met Marlon
const STATUS_LABEL: Record<ProgramDetail["status"], string> = {
  draft: "Concept",
  active: "Actief",
  archived: "Gearchiveerd",
};

export function ProgramBuilder({ program, exerciseOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(program.title ?? "");
  const [notes, setNotes] = useState(program.notes ?? "");
  const [metaMsg, setMetaMsg] = useState<string | null>(null);

  const editable = program.status === "draft";

  function onSaveMeta() {
    startTransition(async () => {
      const res = await updateProgramMeta({
        programId: program.id,
        title,
        notes,
      });
      setMetaMsg(res.message);
      if (res.ok) {
        router.refresh();
        window.setTimeout(() => setMetaMsg(null), 2500);
      }
    });
  }

  function onActivate() {
    // COPY: confirm met Marlon
    const ok = window.confirm(
      "Dit schema activeren? Een eventueel huidig actief schema wordt gearchiveerd en dit wordt wat het lid ziet.",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await activateProgram(program.id);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  function onDeleteDraft() {
    // COPY: confirm met Marlon
    const ok = window.confirm(
      "Dit concept definitief verwijderen? Dit kan niet ongedaan gemaakt worden.",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteDraftProgram(program.id);
      if (res.ok) {
        router.push(`/app/admin/leden/${program.profileId}?tab=schema`);
      } else {
        window.alert(res.message);
      }
    });
  }

  function onDuplicate() {
    startTransition(async () => {
      const res = await duplicateProgram(program.id);
      if (res.ok && res.id) {
        router.push(`/app/admin/leden/${program.profileId}/schema/${res.id}`);
      } else if (!res.ok) {
        window.alert(res.message);
      }
    });
  }

  function onAddDay() {
    startTransition(async () => {
      const res = await addProgramDay(program.id);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  return (
    <div>
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Trainingsschema · {program.memberName}
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-5xl text-text leading-[1.02] tracking-[-0.02em]">
            Versie {program.version}.
          </h1>
          <span
            className={`text-[11px] uppercase tracking-[0.16em] border px-2 py-1 ${
              program.status === "active"
                ? "text-accent border-accent/50"
                : "text-text-muted border-text-muted/40"
            }`}
          >
            {STATUS_LABEL[program.status]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6">
          {editable && (
            <>
              <button
                type="button"
                onClick={onActivate}
                disabled={pending}
                className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 size={14} strokeWidth={1.8} />
                {/* COPY: confirm met Marlon */}
                Activeren
              </button>
              <button
                type="button"
                onClick={onDeleteDraft}
                disabled={pending}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={12} strokeWidth={1.8} />
                {/* COPY: confirm met Marlon */}
                Concept verwijderen
              </button>
            </>
          )}
          {program.status === "active" && (
            <button
              type="button"
              onClick={onDuplicate}
              disabled={pending}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Copy size={14} strokeWidth={1.8} />
              {/* COPY: confirm met Marlon */}
              Dupliceren naar nieuw concept
            </button>
          )}
        </div>
      </header>

      <section className="mb-12 bg-bg-elevated p-6 md:p-8 border border-[color:var(--ink-500)] flex flex-col gap-6 max-w-2xl">
        {editable ? (
          <>
            {/* COPY: confirm met Marlon (labels) */}
            <AdminField label="Titel" hint="Optioneel, bv. Blok 2: kracht">
              <AdminInput
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </AdminField>
            <AdminField
              label="Notities"
              hint="Optioneel, zichtbaar voor het lid"
            >
              <AdminTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={4000}
              />
            </AdminField>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onSaveMeta}
                disabled={pending}
                className="inline-flex items-center justify-center px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50 cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Titel en notities opslaan
              </button>
              {metaMsg && (
                <span className="text-xs text-text-muted">{metaMsg}</span>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="tmc-eyebrow block mb-1">Titel</span>
              <p className="text-text text-sm">{program.title ?? "Geen"}</p>
            </div>
            <div>
              <span className="tmc-eyebrow block mb-1">Notities</span>
              <p className="text-text-muted text-sm whitespace-pre-wrap">
                {program.notes ?? "Geen"}
              </p>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-10">
        {program.days.map((day) => (
          <DayCard
            key={day.id}
            day={day}
            editable={editable}
            exerciseOptions={exerciseOptions}
          />
        ))}

        {program.days.length === 0 && (
          <div className="py-12 text-center border-t border-[color:var(--ink-500)]/60">
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-sm">
              Nog geen trainingsdagen. Voeg de eerste dag toe.
            </p>
          </div>
        )}

        {editable && (
          <div>
            <button
              type="button"
              onClick={onAddDay}
              disabled={pending}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Plus size={14} strokeWidth={1.8} />
              {/* COPY: confirm met Marlon */}
              Dag toevoegen
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
