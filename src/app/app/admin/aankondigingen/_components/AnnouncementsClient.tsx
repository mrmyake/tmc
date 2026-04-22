"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { AnnouncementRow } from "@/lib/announcements-query";
import { AnnouncementForm } from "./AnnouncementForm";
import { AnnouncementRowView } from "./AnnouncementRowView";

interface AnnouncementsClientProps {
  rows: AnnouncementRow[];
}

export function AnnouncementsClient({ rows }: AnnouncementsClientProps) {
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [creating, setCreating] = useState(false);

  const showForm = creating || editing !== null;

  const now = new Date();
  const active: AnnouncementRow[] = [];
  const scheduled: AnnouncementRow[] = [];
  const expiredOrDraft: AnnouncementRow[] = [];
  for (const r of rows) {
    const publishedInPast =
      r.publishedAt && new Date(r.publishedAt).getTime() <= now.getTime();
    const expired =
      r.expiresAt && new Date(r.expiresAt).getTime() <= now.getTime();
    if (publishedInPast && !expired) active.push(r);
    else if (r.publishedAt && !publishedInPast) scheduled.push(r);
    else expiredOrDraft.push(r);
  }

  return (
    <>
      {!showForm && (
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
          >
            <Plus size={14} strokeWidth={1.8} />
            Nieuwe aankondiging
          </button>
        </div>
      )}

      {showForm && (
        <div className="mb-10">
          <AnnouncementForm
            existing={editing}
            onDone={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </div>
      )}

      {!showForm && (
        <div className="flex flex-col gap-12">
          <Section title="Actief" rows={active} onEdit={setEditing} />
          {scheduled.length > 0 && (
            <Section title="Ingepland" rows={scheduled} onEdit={setEditing} />
          )}
          {expiredOrDraft.length > 0 && (
            <Section
              title="Concept / verlopen"
              rows={expiredOrDraft}
              onEdit={setEditing}
              muted
            />
          )}
          {rows.length === 0 && (
            <div className="py-16 text-center border-t border-[color:var(--ink-500)]/60">
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
                Nog niks
              </span>
              <p className="text-text-muted text-sm max-w-md mx-auto">
                Plaats een aankondiging voor trainers, leden of iedereen.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Section({
  title,
  rows,
  onEdit,
  muted,
}: {
  title: string;
  rows: AnnouncementRow[];
  onEdit: (r: AnnouncementRow) => void;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <header className="mb-4">
        <span
          className={`tmc-eyebrow ${muted ? "" : "tmc-eyebrow--accent"} block mb-2`}
        >
          {title}
        </span>
        <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
          {rows.length} {rows.length === 1 ? "item" : "items"}
        </h2>
      </header>
      <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((r) => (
          <li key={r.id} className={muted ? "opacity-70" : ""}>
            <AnnouncementRowView row={r} onEdit={() => onEdit(r)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
