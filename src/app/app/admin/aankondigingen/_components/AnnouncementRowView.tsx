"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil } from "lucide-react";
import { deleteAnnouncement } from "@/lib/admin/announcements-actions";
import { formatShortDate } from "@/lib/format-date";
import type { AnnouncementRow } from "@/lib/announcements-query";

const AUDIENCE_LABEL: Record<AnnouncementRow["audience"], string> = {
  all: "Iedereen",
  trainers: "Trainers",
  members: "Leden",
};

interface Props {
  row: AnnouncementRow;
  onEdit: () => void;
}

export function AnnouncementRowView({ row, onEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    const ok = window.confirm("Zeker weten verwijderen?");
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteAnnouncement(row.id);
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  }

  return (
    <article className="flex flex-col gap-3 py-5 border-b border-[color:var(--ink-500)]/40">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-text text-base font-medium tracking-[-0.01em]">
          {row.title}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.16em] text-accent">
          {AUDIENCE_LABEL[row.audience]}
        </span>
        {row.publishedAt ? (
          <span className="tmc-eyebrow text-text-muted/80">
            Gepubliceerd {formatShortDate(new Date(row.publishedAt))}
          </span>
        ) : (
          <span className="tmc-eyebrow text-text-muted/80">Concept</span>
        )}
        {row.expiresAt && (
          <span className="tmc-eyebrow text-text-muted/80">
            Verloopt {formatShortDate(new Date(row.expiresAt))}
          </span>
        )}
      </div>
      {row.body && (
        <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
          {row.body}
        </p>
      )}
      <p className="tmc-eyebrow text-text-muted/70">Door {row.authorName}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
        >
          <Pencil size={12} strokeWidth={1.8} />
          Bewerken
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Trash2 size={12} strokeWidth={1.8} />
          Verwijderen
        </button>
      </div>
    </article>
  );
}
