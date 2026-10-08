"use client";

import { useMemo, useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { AdminWeekGrid } from "./_components/AdminWeekGrid";
import { SessionEditPanel } from "./_components/SessionEditPanel";
import {
  NewSessionDialog,
  type NewSessionPrefill,
} from "./_components/NewSessionDialog";
import { isoDateAmsterdam } from "@/lib/format-date";
import { SeriesManagerPanel } from "./_components/SeriesManagerPanel";
import { DayCancelPanel } from "./_components/DayCancelPanel";
import type {
  AdminClassTypeOption,
  AdminDay,
  AdminScheduleTemplateOption,
  AdminSessionBlockData,
  AdminTrainerOption,
} from "./_components/types";

interface RoosterEditorClientProps {
  days: AdminDay[];
  trainers: AdminTrainerOption[];
  classTypes: AdminClassTypeOption[];
  scheduleTemplates: AdminScheduleTemplateOption[];
  defaultNewDate: string;
}

export function RoosterEditorClient({
  days,
  trainers,
  classTypes,
  scheduleTemplates,
  defaultNewDate,
}: RoosterEditorClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newPrefill, setNewPrefill] = useState<NewSessionPrefill | null>(null);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [cancelDay, setCancelDay] = useState<string | null>(null);

  const allSessions = useMemo(
    () => days.flatMap((d) => d.sessions),
    [days],
  );
  const selected = selectedId
    ? allSessions.find((s) => s.id === selectedId) ?? null
    : null;

  // Geannuleerde les: nieuwe sessie voorgevuld met dezelfde gegevens. Gaat
  // via adminCreateSession, dus de duplicate-guard geldt ook hier.
  function createSimilar(s: AdminSessionBlockData) {
    setNewPrefill({
      classTypeId: s.classTypeId,
      trainerId: s.trainerId,
      date: isoDateAmsterdam(new Date(s.startAt)),
      startTime: s.startLabel,
      durationMinutes: s.durationMin,
      capacity: s.capacity,
    });
    setSelectedId(null);
    setNewOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => {
            setNewPrefill(null);
            setNewOpen(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
        >
          <Plus size={14} strokeWidth={1.8} />
          Nieuwe sessie
        </button>
        <button
          type="button"
          onClick={() => setSeriesOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent cursor-pointer"
        >
          <Settings2 size={14} strokeWidth={1.8} />
          Series beheren
        </button>
      </div>

      <AdminWeekGrid
        days={days}
        onSelect={setSelectedId}
        onCancelDay={setCancelDay}
      />

      <DayCancelPanel isoDate={cancelDay} onClose={() => setCancelDay(null)} />

      <SessionEditPanel
        session={selected}
        trainers={trainers}
        onCreateSimilar={createSimilar}
        onClose={() => setSelectedId(null)}
      />

      <NewSessionDialog
        open={newOpen}
        prefill={newPrefill}
        classTypes={classTypes}
        trainers={trainers}
        defaultDate={defaultNewDate}
        onClose={() => setNewOpen(false)}
      />

      <SeriesManagerPanel
        open={seriesOpen}
        templates={scheduleTemplates}
        classTypes={classTypes}
        trainers={trainers}
        onClose={() => setSeriesOpen(false)}
      />
    </>
  );
}
