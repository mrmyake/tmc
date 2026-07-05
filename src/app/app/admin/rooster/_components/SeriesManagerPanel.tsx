"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AdminField,
  AdminInput,
  AdminSelect,
} from "@/components/ui/AdminField";
import {
  adminUpdateSeries,
  adminCancelSeries,
  type SeriesActionResult,
} from "@/lib/admin/series-actions";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import type {
  AdminClassTypeOption,
  AdminScheduleTemplateOption,
  AdminTrainerOption,
} from "./types";

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

// Zelfde conventie als schedule_templates.day_of_week / opening_hours.weekday:
// 0-6, 0 = zondag (JS getDay).
const DAY_LABEL: Record<number, string> = {
  0: "Zondag",
  1: "Maandag",
  2: "Dinsdag",
  3: "Woensdag",
  4: "Donderdag",
  5: "Vrijdag",
  6: "Zaterdag",
};
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0];

interface SeriesManagerPanelProps {
  open: boolean;
  templates: AdminScheduleTemplateOption[];
  classTypes: AdminClassTypeOption[];
  trainers: AdminTrainerOption[];
  onClose: () => void;
}

export function SeriesManagerPanel({
  open,
  templates,
  classTypes,
  trainers,
  onClose,
}: SeriesManagerPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Sluit"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: clubEase }}
            className="fixed inset-0 z-40 bg-bg/55 backdrop-blur-sm cursor-default"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="series-manager-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: clubEase }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[640px] bg-bg border-l border-[color:var(--ink-500)] flex flex-col text-text"
          >
            <div className="flex items-start justify-between p-8">
              <span className="tmc-eyebrow tmc-eyebrow--accent">
                {/* COPY: confirm met Marlon */}
                Series beheren
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Sluit paneel"
                className="text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text cursor-pointer"
              >
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 pb-8 flex-1 overflow-y-auto">
              <h2
                id="series-manager-title"
                className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-2"
              >
                Actieve series.
              </h2>
              <p className="text-text-muted text-sm mb-8">
                {/* COPY: confirm met Marlon */}
                Wijzigen of stoppen raakt alleen toekomstige sessies zonder
                boekingen. Sessies met boekingen blijven ongemoeid.
              </p>

              {templates.length === 0 ? (
                <div className="py-16 text-center border-t border-[color:var(--ink-500)]/60">
                  {/* COPY: confirm met Marlon */}
                  <p className="text-text-muted text-sm">
                    Nog geen herhalende series. Maak er een aan via &quot;Nieuwe
                    sessie&quot; → &quot;Herhalend&quot;.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
                  {templates.map((t) =>
                    editingId === t.id ? (
                      <li
                        key={t.id}
                        className="py-5 border-b border-[color:var(--ink-500)]/40"
                      >
                        <SeriesEditForm
                          template={t}
                          classTypes={classTypes}
                          trainers={trainers}
                          onDone={() => setEditingId(null)}
                        />
                      </li>
                    ) : (
                      <li
                        key={t.id}
                        className="py-5 border-b border-[color:var(--ink-500)]/40"
                      >
                        <SeriesRowView
                          template={t}
                          onEdit={() => setEditingId(t.id)}
                        />
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SeriesRowView({
  template: t,
  onEdit,
}: {
  template: AdminScheduleTemplateOption;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SeriesActionResult | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  function stop() {
    startTransition(async () => {
      const res = await adminCancelSeries(t.id);
      setResult(res);
      if (res.ok) {
        window.setTimeout(() => router.refresh(), 800);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-text text-base font-medium tracking-[-0.01em]">
          {t.className}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">
          {PILLAR_LABELS[t.pillar as Pillar] ?? t.pillar}
        </span>
        {t.blocksFreeTraining && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-accent">
            {/* COPY: confirm met Marlon */}
            Blokkeert vrij trainen
          </span>
        )}
      </div>
      <p className="text-text-muted text-sm">
        {DAY_LABEL[t.dayOfWeek]} · {t.startTime} · {t.durationMinutes} min ·{" "}
        {t.trainerName} · capaciteit {t.capacity}
      </p>
      <p className="text-text-muted text-xs">
        {/* COPY: confirm met Marlon */}
        Vanaf {t.validFrom}
        {t.validUntil ? ` tot ${t.validUntil}` : ", geen einddatum"}
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
        {!confirmStop ? (
          <button
            type="button"
            onClick={() => setConfirmStop(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Stop serie
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">
              {/* COPY: confirm met Marlon */}
              Zeker weten?
            </span>
            <button
              type="button"
              onClick={stop}
              disabled={pending}
              className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {pending ? "Bezig" : "Bevestig"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmStop(false)}
              className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Terug
            </button>
          </div>
        )}
      </div>

      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`mt-2 text-sm p-3 border ${
            result.ok
              ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
              : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

function SeriesEditForm({
  template: t,
  classTypes,
  trainers,
  onDone,
}: {
  template: AdminScheduleTemplateOption;
  classTypes: AdminClassTypeOption[];
  trainers: AdminTrainerOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SeriesActionResult | null>(null);
  const [classTypeId, setClassTypeId] = useState(t.classTypeId);
  const [trainerId, setTrainerId] = useState(t.trainerId);
  const [dayOfWeek, setDayOfWeek] = useState(t.dayOfWeek);
  const [startTime, setStartTime] = useState(t.startTime);
  const [durationMinutes, setDurationMinutes] = useState(t.durationMinutes);
  const [capacity, setCapacity] = useState(t.capacity);
  const [blocksFreeTraining, setBlocksFreeTraining] = useState(
    t.blocksFreeTraining,
  );
  const [hasEndDate, setHasEndDate] = useState(t.validUntil !== null);
  const [endDate, setEndDate] = useState(t.validUntil ?? "");

  function submit() {
    startTransition(async () => {
      const res = await adminUpdateSeries({
        templateId: t.id,
        classTypeId,
        trainerId,
        dayOfWeek,
        startTime,
        durationMinutes,
        capacity,
        blocksFreeTraining,
        validUntil: hasEndDate ? endDate || null : null,
      });
      setResult(res);
      if (res.ok) {
        router.refresh();
        window.setTimeout(onDone, 800);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 bg-bg-elevated p-5 border border-[color:var(--ink-500)]">
      <AdminField label="Lestype">
        <AdminSelect
          value={classTypeId}
          onChange={(e) => setClassTypeId(e.target.value)}
        >
          {classTypes.map((ct) => (
            <option key={ct.id} value={ct.id}>
              {ct.name}
            </option>
          ))}
        </AdminSelect>
      </AdminField>

      <AdminField label="Trainer">
        <AdminSelect
          value={trainerId}
          onChange={(e) => setTrainerId(e.target.value)}
        >
          {trainers
            .filter((tr) => tr.isActive || tr.id === t.trainerId)
            .map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.displayName}
              </option>
            ))}
        </AdminSelect>
      </AdminField>

      <AdminField label="Dag van de week">
        <AdminSelect
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value))}
        >
          {WEEKDAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DAY_LABEL[d]}
            </option>
          ))}
        </AdminSelect>
      </AdminField>

      <div className="grid grid-cols-2 gap-4">
        <AdminField label="Starttijd">
          <AdminInput
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </AdminField>
        <AdminField label="Duur (min)">
          <AdminInput
            type="number"
            min={15}
            max={240}
            step={15}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
          />
        </AdminField>
      </div>

      <AdminField label="Capaciteit">
        <AdminInput
          type="number"
          min={1}
          max={50}
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value) || 1)}
        />
      </AdminField>

      <AdminField
        label="Einddatum"
      >
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={!hasEndDate}
              onChange={() => setHasEndDate(false)}
              className="cursor-pointer"
            />
            {/* COPY: confirm met Marlon */}
            Geen einddatum
          </label>
          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={hasEndDate}
              onChange={() => setHasEndDate(true)}
              className="cursor-pointer"
            />
            {/* COPY: confirm met Marlon */}
            Einddatum instellen
          </label>
        </div>
        {hasEndDate && (
          <AdminInput
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-2"
          />
        )}
      </AdminField>

      <AdminField
        label="Blokkeert vrij trainen"
        hint="Tijdens deze sessie is de studio niet beschikbaar voor vrij trainen."
      >
        <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
          <input
            type="checkbox"
            checked={blocksFreeTraining}
            onChange={(e) => setBlocksFreeTraining(e.target.checked)}
            className="cursor-pointer"
          />
          {blocksFreeTraining ? "Ja" : "Nee"}
        </label>
      </AdminField>

      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`text-sm p-3 border ${
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
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center px-6 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig" : "Serie bijwerken"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-4 py-3 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Annuleren
        </button>
      </div>
    </div>
  );
}
