"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/ui/AdminField";
import {
  saveClassType,
  type ClassTypeActionResult,
} from "@/lib/admin/class-types-actions";
import type { ClassTypeRow, ClassPillarOption } from "@/lib/admin/class-types-query";

interface Props {
  existing: ClassTypeRow | null;
  pillars: ClassPillarOption[];
  onDone: () => void;
}

export function ClassTypeForm({ existing, pillars, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ClassTypeActionResult | null>(null);
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [pillar, setPillar] = useState(existing?.pillar ?? pillars[0]?.code ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [duration, setDuration] = useState(
    String(existing?.defaultDurationMinutes ?? 60),
  );
  const [capacity, setCapacity] = useState(
    existing?.defaultCapacity != null ? String(existing.defaultCapacity) : "",
  );
  const [color, setColor] = useState(existing?.color ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveClassType({
        id: existing?.id,
        slug: existing ? undefined : slug,
        name,
        pillar,
        description,
        defaultDurationMinutes: Number(duration),
        defaultCapacity: capacity.trim() === "" ? null : Number(capacity),
        color,
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
          {existing ? "Lestype bewerken" : "Nieuw lestype"}
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

      {!existing && (
        <AdminField
          label="Slug"
          // COPY: confirm met Marlon
          hint="Alleen kleine letters, cijfers en koppeltekens. Kan later niet meer worden gewijzigd."
        >
          <AdminInput
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="bijv-nieuwe-les"
            required
          />
        </AdminField>
      )}

      <AdminField label="Pillar">
        <AdminSelect value={pillar} onChange={(e) => setPillar(e.target.value)}>
          {pillars.map((p) => (
            <option key={p.code} value={p.code}>
              {p.nameNl}
            </option>
          ))}
        </AdminSelect>
      </AdminField>

      <AdminField label="Beschrijving" hint="Optioneel">
        <AdminTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
        />
      </AdminField>

      <AdminField label="Standaardduur (minuten)">
        <AdminInput
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          min={1}
          required
        />
      </AdminField>

      <AdminField
        label="Standaardcapaciteit"
        // COPY: confirm met Marlon
        hint="Leeg laten = onbeperkte capaciteit."
      >
        <AdminInput
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          min={1}
          placeholder="Onbeperkt"
        />
      </AdminField>

      <AdminField label="Kleur" hint="Optioneel, voor roosterweergave">
        <AdminInput
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#C9A86B"
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
          disabled={pending || !name.trim() || !pillar || (!existing && !slug.trim())}
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
