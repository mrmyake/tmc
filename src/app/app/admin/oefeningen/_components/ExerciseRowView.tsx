"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, EyeOff, Eye, Video } from "lucide-react";
import { setExerciseActive } from "@/lib/admin/exercises-actions";
import type { ExerciseRow } from "@/lib/admin/exercises-query";

interface Props {
  row: ExerciseRow;
  onEdit: () => void;
}

export function ExerciseRowView({ row, onEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onToggleActive() {
    const confirmMsg = row.isActive
      ? // COPY: confirm met Marlon
        `"${row.name}" deactiveren? Members zien deze oefening dan niet meer.`
      : // COPY: confirm met Marlon
        `"${row.name}" weer activeren?`;
    const ok = window.confirm(confirmMsg);
    if (!ok) return;
    startTransition(async () => {
      const res = await setExerciseActive(row.id, !row.isActive);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  return (
    <article className="flex flex-col gap-2 py-5 border-b border-[color:var(--ink-500)]/40">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-text text-base font-medium tracking-[-0.01em]">
          {row.name}
        </h3>
        {!row.isActive && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--danger)]">
            {/* COPY: confirm met Marlon */}
            Gedeactiveerd
          </span>
        )}
        {row.videoUrl && (
          <a
            href={row.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-accent hover:underline"
          >
            <Video size={11} strokeWidth={1.8} />
            {/* COPY: confirm met Marlon */}
            Video
          </a>
        )}
      </div>
      {row.description && (
        <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
          {row.description}
        </p>
      )}
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
