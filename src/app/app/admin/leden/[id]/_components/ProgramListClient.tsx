"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Copy, Pencil, Eye } from "lucide-react";
import type { ProgramSummary } from "@/lib/admin/training-programs-query";
import {
  createDraftProgram,
  duplicateProgram,
} from "@/lib/admin/training-programs-actions";
import { formatShortDate } from "@/lib/format-date";

interface Props {
  profileId: string;
  programs: ProgramSummary[];
}

// COPY: confirm met Marlon
const STATUS_LABEL: Record<ProgramSummary["status"], string> = {
  draft: "Concept",
  active: "Actief",
  archived: "Gearchiveerd",
};

const STATUS_CLASS: Record<ProgramSummary["status"], string> = {
  draft: "text-text-muted border-text-muted/40",
  active: "text-accent border-accent/50",
  archived: "text-text-muted/70 border-[color:var(--ink-500)]",
};

export function ProgramListClient({ profileId, programs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onNew() {
    startTransition(async () => {
      const res = await createDraftProgram(profileId);
      if (res.ok && res.id) {
        router.push(`/app/admin/leden/${profileId}/schema/${res.id}`);
      } else if (!res.ok) {
        window.alert(res.message);
      }
    });
  }

  function onDuplicate(programId: string) {
    startTransition(async () => {
      const res = await duplicateProgram(programId);
      if (res.ok && res.id) {
        router.push(`/app/admin/leden/${profileId}/schema/${res.id}`);
      } else if (!res.ok) {
        window.alert(res.message);
      }
    });
  }

  return (
    <div>
      <div className="mb-8">
        <button
          type="button"
          onClick={onNew}
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          <Plus size={14} strokeWidth={1.8} />
          {/* COPY: confirm met Marlon */}
          Nieuw schema
        </button>
      </div>

      {programs.length === 0 ? (
        <div className="py-16 text-center border-t border-[color:var(--ink-500)]/60">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Nog geen schema
          </span>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Maak het eerste trainingsschema voor dit lid.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
          {programs.map((p) => (
            <li
              key={p.id}
              className={`flex flex-wrap items-center justify-between gap-4 py-5 border-b border-[color:var(--ink-500)]/40 ${
                p.status === "archived" ? "opacity-70" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-text text-base font-medium tracking-[-0.01em]">
                    {/* COPY: confirm met Marlon */}
                    Versie {p.version}
                    {p.title ? ` · ${p.title}` : ""}
                  </h3>
                  <span
                    className={`text-[10px] uppercase tracking-[0.16em] border px-1.5 py-0.5 ${STATUS_CLASS[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>
                <p className="tmc-eyebrow text-text-muted/80 mt-1">
                  {p.dayCount} {p.dayCount === 1 ? "dag" : "dagen"} ·{" "}
                  {p.exerciseCount}{" "}
                  {p.exerciseCount === 1 ? "oefening" : "oefeningen"}
                  {p.activatedAt &&
                    ` · geactiveerd ${formatShortDate(new Date(p.activatedAt))}`}
                  {p.archivedAt &&
                    ` · gearchiveerd ${formatShortDate(new Date(p.archivedAt))}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/app/admin/leden/${profileId}/schema/${p.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors"
                >
                  {p.status === "draft" ? (
                    <>
                      <Pencil size={12} strokeWidth={1.8} />
                      {/* COPY: confirm met Marlon */}
                      Bewerken
                    </>
                  ) : (
                    <>
                      <Eye size={12} strokeWidth={1.8} />
                      {/* COPY: confirm met Marlon */}
                      Bekijken
                    </>
                  )}
                </Link>
                {p.status === "active" && (
                  <button
                    type="button"
                    onClick={() => onDuplicate(p.id)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Copy size={12} strokeWidth={1.8} />
                    {/* COPY: confirm met Marlon */}
                    Dupliceren
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
