"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/ui/AdminField";
import {
  adminCreateSession,
  type AdminActionResult,
} from "@/lib/admin/session-actions";
import {
  type AdminClassTypeOption,
  type AdminTrainerOption,
} from "./types";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

interface NewSessionDialogProps {
  open: boolean;
  classTypes: AdminClassTypeOption[];
  trainers: AdminTrainerOption[];
  defaultDate: string; // yyyy-mm-dd
  onClose: () => void;
}

export function NewSessionDialog({
  open,
  classTypes,
  trainers,
  defaultDate,
  onClose,
}: NewSessionDialogProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [classTypeId, setClassTypeId] = useState(classTypes[0]?.id ?? "");
  const [trainerId, setTrainerId] = useState(trainers[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(8);
  const [notes, setNotes] = useState("");

  const selectedType = classTypes.find((t) => t.id === classTypeId);

  // Sync capacity + duration from chosen class type (but only when type changes).
  useEffect(() => {
    if (!selectedType) return;
    setCapacity(selectedType.defaultCapacity);
    setDurationMinutes(selectedType.defaultDurationMinutes);
  }, [selectedType]);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setResult(null);
    }
  }, [open, defaultDate]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function submit() {
    if (!classTypeId || !trainerId || !date || !startTime) {
      setResult({ ok: false, message: "Vul alle velden in." });
      return;
    }
    // Build timezone-safe ISO strings: interpret date+time as Amsterdam wall-clock.
    // Supabase timestamptz will store UTC; we submit as local + offset.
    const startLocal = buildAmsterdamIso(date, startTime);
    const endDate = new Date(
      new Date(startLocal).getTime() + durationMinutes * 60_000,
    );
    const endIso = endDate.toISOString();

    startTransition(async () => {
      const res = await adminCreateSession({
        classTypeId,
        trainerId,
        startAt: startLocal,
        endAt: endIso,
        capacity,
        notes,
      });
      setResult(res);
      if (res.ok) {
        window.setTimeout(onClose, 1000);
      }
    });
  }

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
            transition={{ duration: 0.4, ease: clubEase }}
            className="fixed inset-0 z-40 bg-bg/55 backdrop-blur-sm cursor-default"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-new-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: clubEase }}
            className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,560px)] max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 bg-bg border border-[color:var(--ink-500)] text-text"
          >
            <div className="flex items-start justify-between p-8">
              <span className="tmc-eyebrow tmc-eyebrow--accent">
                Nieuwe sessie
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Sluit"
                className="text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 pb-6">
              <h2
                id="admin-new-title"
                className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-2"
              >
                Ad-hoc sessie.
              </h2>
              <p className="text-text-muted text-sm mb-8">
                Voeg een sessie toe buiten het vaste template om.
              </p>

              <div className="flex flex-col gap-5">
                <AdminField label="Lestype">
                  <AdminSelect
                    value={classTypeId}
                    onChange={(e) => setClassTypeId(e.target.value)}
                  >
                    {classTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ·{" "}
                        {PILLAR_LABELS[t.pillar as Pillar] ?? t.pillar}
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
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName}
                        </option>
                      ))}
                  </AdminSelect>
                </AdminField>

                <div className="grid grid-cols-2 gap-4">
                  <AdminField label="Datum">
                    <AdminInput
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </AdminField>
                  <AdminField label="Starttijd">
                    <AdminInput
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </AdminField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <AdminField label="Duur (min)">
                    <AdminInput
                      type="number"
                      min={15}
                      max={240}
                      step={15}
                      value={durationMinutes}
                      onChange={(e) =>
                        setDurationMinutes(Number(e.target.value) || 60)
                      }
                    />
                  </AdminField>
                  <AdminField label="Capaciteit">
                    <AdminInput
                      type="number"
                      min={1}
                      max={50}
                      value={capacity}
                      onChange={(e) =>
                        setCapacity(Number(e.target.value) || 1)
                      }
                    />
                  </AdminField>
                </div>

                <AdminField label="Notities">
                  <AdminTextarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Optioneel, intern zichtbaar."
                  />
                </AdminField>
              </div>
            </div>

            <div className="p-8 pt-6 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-4">
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
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {pending ? "Bezig" : "Aanmaken"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Given Amsterdam-local date + time, produce an ISO timestamp that will
 * parse to that wall-clock in the Europe/Amsterdam zone. Uses the browser's
 * timezone-aware Intl to find the current UTC offset for that wall-clock.
 * Handles DST transitions correctly.
 */
function buildAmsterdamIso(date: string, time: string): string {
  // Try both offsets (summer +02:00, winter +01:00) and pick the one whose
  // resulting UTC instant formats back to the same wall-clock in Amsterdam.
  for (const offset of ["+02:00", "+01:00"]) {
    const candidate = `${date}T${time}:00${offset}`;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) continue;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(parsed);
    const pick = (t: string) =>
      parts.find((p) => p.type === t)?.value ?? "";
    const backDate = `${pick("year")}-${pick("month")}-${pick("day")}`;
    const backTime = `${pick("hour")}:${pick("minute")}`;
    if (backDate === date && backTime === time) {
      return parsed.toISOString();
    }
  }
  // Fallback: treat as UTC.
  return new Date(`${date}T${time}:00Z`).toISOString();
}
