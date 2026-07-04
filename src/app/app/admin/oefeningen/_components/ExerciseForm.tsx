"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminField, AdminInput, AdminTextarea } from "@/components/ui/AdminField";
import {
  saveExercise,
  type ExerciseActionResult,
} from "@/lib/admin/exercises-actions";
import type { ExerciseRow } from "@/lib/admin/exercises-query";

interface Props {
  existing: ExerciseRow | null;
  onDone: () => void;
}

export function ExerciseForm({ existing, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ExerciseActionResult | null>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(existing?.videoUrl ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveExercise({
        id: existing?.id,
        name,
        description,
        videoUrl,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onDone, 500);
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-bg-elevated p-6 md:p-8 border border-[color:var(--ink-500)] flex flex-col gap-6"
    >
      <header className="flex items-center justify-between">
        <span className="tmc-eyebrow tmc-eyebrow--accent">
          {/* COPY: confirm met Marlon */}
          {existing ? "Oefening bewerken" : "Nieuwe oefening"}
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

      <AdminField label="Naam">
        <AdminInput
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
      </AdminField>

      <AdminField label="Beschrijving" hint="Optioneel">
        <AdminTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
        />
      </AdminField>

      <AdminField label="Video-URL" hint="Optioneel">
        <AdminInput
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://..."
        />
      </AdminField>

      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`text-sm p-4 border ${
            result.ok
              ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
              : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || !name.trim()}
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
