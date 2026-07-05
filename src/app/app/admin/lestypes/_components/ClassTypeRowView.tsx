"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, EyeOff, Eye } from "lucide-react";
import { setClassTypeActive } from "@/lib/admin/class-types-actions";
import type { ClassTypeRow } from "@/lib/admin/class-types-query";

interface Props {
  row: ClassTypeRow;
  onEdit: () => void;
}

export function ClassTypeRowView({ row, onEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onToggleActive() {
    const confirmMsg = row.isActive
      ? // COPY: confirm met Marlon
        `"${row.name}" deactiveren? Het verdwijnt dan uit de keuzelijst bij nieuwe sessies, bestaande sessies blijven intact.`
      : // COPY: confirm met Marlon
        `"${row.name}" weer activeren?`;
    const ok = window.confirm(confirmMsg);
    if (!ok) return;
    startTransition(async () => {
      const res = await setClassTypeActive(row.id, !row.isActive);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  return (
    <article className="flex flex-col gap-2 py-5 border-b border-[color:var(--ink-500)]/40">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {row.color && (
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: row.color }}
          />
        )}
        <h3 className="text-text text-base font-medium tracking-[-0.01em]">
          {row.name}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {row.pillar}
        </span>
        {!row.isActive && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--danger)]">
            {/* COPY: confirm met Marlon */}
            Gedeactiveerd
          </span>
        )}
      </div>
      {row.description && (
        <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
          {row.description}
        </p>
      )}
      <p className="text-text-muted text-xs">
        {row.defaultDurationMinutes} min ·{" "}
        {row.defaultCapacity === null
          ? // COPY: confirm met Marlon
            "Onbeperkte capaciteit"
          : // COPY: confirm met Marlon
            `Capaciteit ${row.defaultCapacity}`}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
        >
          <Pencil size={12} strokeWidth={1.8} />
          {/* COPY: confirm met Marlon */}
          Bewerken
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          disabled={pending}
          className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border transition-colors disabled:opacity-50 cursor-pointer ${
            row.isActive
              ? "border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
              : "border-[color:var(--success)]/40 text-[color:var(--success)] hover:bg-[color:var(--success)]/10"
          }`}
        >
          {row.isActive ? (
            <>
              <EyeOff size={12} strokeWidth={1.8} />
              {/* COPY: confirm met Marlon */}
              Deactiveren
            </>
          ) : (
            <>
              <Eye size={12} strokeWidth={1.8} />
              {/* COPY: confirm met Marlon */}
              Activeren
            </>
          )}
        </button>
      </div>
    </article>
  );
}
