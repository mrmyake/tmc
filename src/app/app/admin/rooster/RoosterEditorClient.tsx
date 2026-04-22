"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { AdminWeekGrid } from "./_components/AdminWeekGrid";
import { SessionEditPanel } from "./_components/SessionEditPanel";
import { NewSessionDialog } from "./_components/NewSessionDialog";
import type {
  AdminClassTypeOption,
  AdminDay,
  AdminTrainerOption,
} from "./_components/types";

interface RoosterEditorClientProps {
  days: AdminDay[];
  trainers: AdminTrainerOption[];
  classTypes: AdminClassTypeOption[];
  sanityStudioUrl: string;
  defaultNewDate: string;
}

export function RoosterEditorClient({
  days,
  trainers,
  classTypes,
  sanityStudioUrl,
  defaultNewDate,
}: RoosterEditorClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const allSessions = useMemo(
    () => days.flatMap((d) => d.sessions),
    [days],
  );
  const selected = selectedId
    ? allSessions.find((s) => s.id === selectedId) ?? null
    : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
        >
          <Plus size={14} strokeWidth={1.8} />
          Nieuwe sessie
        </button>
        <Link
          href={sanityStudioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
        >
          <Settings2 size={14} strokeWidth={1.8} />
          Template beheren
        </Link>
      </div>

      <AdminWeekGrid days={days} onSelect={setSelectedId} />

      <SessionEditPanel
        session={selected}
        trainers={trainers}
        onClose={() => setSelectedId(null)}
      />

      <NewSessionDialog
        open={newOpen}
        classTypes={classTypes}
        trainers={trainers}
        defaultDate={defaultNewDate}
        onClose={() => setNewOpen(false)}
      />
    </>
  );
}
