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
import { adminCreateSeries } from "@/lib/admin/series-actions";
import {
  type AdminClassTypeOption,
  type AdminTrainerOption,
} from "./types";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

// Weergave ma-zo; dayOfWeek-waarde volgt de project-conventie 0-6 met 0 =
// zondag (JS getDay), zie schedule_templates.day_of_week / opening_hours.weekday.
const WEEKDAY_CHIPS: Array<{ label: string; dayOfWeek: number }> = [
  { label: "Ma", dayOfWeek: 1 },
  { label: "Di", dayOfWeek: 2 },
  { label: "Wo", dayOfWeek: 3 },
  { label: "Do", dayOfWeek: 4 },
  { label: "Vr", dayOfWeek: 5 },
  { label: "Za", dayOfWeek: 6 },
  { label: "Zo", dayOfWeek: 0 },
];

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
  const [mode, setMode] = useState<"once" | "recurring">("once");
  const [classTypeId, setClassTypeId] = useState(classTypes[0]?.id ?? "");
  const [trainerId, setTrainerId] = useState(trainers[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(8);
  const [notes, setNotes] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [blocksFreeTraining, setBlocksFreeTraining] = useState(false);

  const selectedType = classTypes.find((t) => t.id === classTypeId);

  // Sync capacity + duration from chosen class type (but only when type changes).
  // defaultCapacity can be null (onbeperkt); dit dialoog boekt losse
  // sessies met een harde capaciteit, dus val terug op 8 totdat PR 2
  // nullable capaciteit hier functioneel maakt.
  useEffect(() => {
    if (!selectedType) return;
    setCapacity(selectedType.defaultCapacity ?? 8);
    setDurationMinutes(selectedType.defaultDurationMinutes);
  }, [selectedType]);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      setResult(null);
      setMode("once");
      setSelectedDays([]);
      setHasEndDate(false);
      setEndDate("");
      setBlocksFreeTraining(false);
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

  function toggleDay(dayOfWeek: number) {
    setSelectedDays((prev) =>
      prev.includes(dayOfWeek)
        ? prev.filter((d) => d !== dayOfWeek)
        : [...prev, dayOfWeek],
    );
  }

  function submitOnce() {
    // Build timezone-safe ISO strings: interpret date+time as Amsterdam wall-clock.
    // Supabase timestamptz will store UTC; we submit as local + offset.
    const startLocal = buildAmsterdamIso(date, startTime);
    const endDateTime = new Date(
      new Date(startLocal).getTime() + durationMinutes * 60_000,
    );
    const endIso = endDateTime.toISOString();

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

  function submitRecurring() {
    if (selectedDays.length === 0) {
      // COPY: confirm met Marlon
      setResult({ ok: false, message: "Kies minstens één dag van de week." });
      return;
    }
    if (hasEndDate && (!endDate || endDate <= date)) {
      // COPY: confirm met Marlon
      setResult({ ok: false, message: "Einddatum moet na de startdatum liggen." });
      return;
    }

    startTransition(async () => {
      const results = await Promise.all(
        selectedDays.map((dayOfWeek) =>
          adminCreateSeries({
            classTypeId,
            trainerId,
            dayOfWeek,
            startTime,
            durationMinutes,
            capacity,
            validFrom: date,
            validUntil: hasEndDate ? endDate : null,
            blocksFreeTraining,
          }),
        ),
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setResult({
          ok: false,
          // COPY: confirm met Marlon
          message: `${failed.length} van ${results.length} dag(en) mislukt: ${failed[0].message}`,
        });
        return;
      }

      const totalMaterialized = results.reduce(
        (sum, r) => sum + (r.ok ? r.materializedCount ?? 0 : 0),
        0,
      );
      setResult({
        ok: true,
        // COPY: confirm met Marlon
        message: `Serie aangemaakt voor ${results.length} dag(en) per week. ${totalMaterialized} sessie(s) ingepland voor de komende weken.`,
      });
      window.setTimeout(onClose, 1200);
    });
  }

  function submit() {
    if (!classTypeId || !trainerId || !date || !startTime) {
      // COPY: confirm met Marlon
      setResult({ ok: false, message: "Vul alle velden in." });
      return;
    }
    if (mode === "once") {
      submitOnce();
    } else {
      submitRecurring();
    }
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
                {mode === "once" ? "Ad-hoc sessie." : "Herhalende serie."}
              </h2>
              <p className="text-text-muted text-sm mb-8">
                {mode === "once"
                  ? // COPY: confirm met Marlon
                    "Voeg een sessie toe buiten het vaste rooster om."
                  : // COPY: confirm met Marlon
                    "Plant een wekelijkse serie. Bestaande sessies met boekingen worden nooit aangepast."}
              </p>

              <div
                role="group"
                aria-label="Type sessie"
                className="flex gap-2 mb-6"
              >
                <button
                  type="button"
                  onClick={() => setMode("once")}
                  className={`flex-1 px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] border transition-colors cursor-pointer ${
                    mode === "once"
                      ? "bg-accent text-bg border-accent"
                      : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {/* COPY: confirm met Marlon */}
                  Eenmalig
                </button>
                <button
                  type="button"
                  onClick={() => setMode("recurring")}
                  className={`flex-1 px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] border transition-colors cursor-pointer ${
                    mode === "recurring"
                      ? "bg-accent text-bg border-accent"
                      : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {/* COPY: confirm met Marlon */}
                  Herhalend
                </button>
              </div>

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

                {mode === "recurring" && (
                  <AdminField
                    label="Dagen van de week"
                    // COPY: confirm met Marlon
                    hint="Meerdere dagen mogelijk; er wordt per dag een aparte serie aangemaakt."
                  >
                    <div
                      role="group"
                      aria-label="Dagen van de week"
                      className="flex flex-wrap gap-2"
                    >
                      {WEEKDAY_CHIPS.map((d) => {
                        const active = selectedDays.includes(d.dayOfWeek);
                        return (
                          <button
                            key={d.dayOfWeek}
                            type="button"
                            onClick={() => toggleDay(d.dayOfWeek)}
                            aria-pressed={active}
                            className={`px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] border transition-colors cursor-pointer ${
                              active
                                ? "bg-accent text-bg border-accent"
                                : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </AdminField>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <AdminField label={mode === "once" ? "Datum" : "Startdatum"}>
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

                {mode === "recurring" && (
                  <>
                    <AdminField label="Einddatum">
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
                          min={date}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="mt-2"
                        />
                      )}
                    </AdminField>

                    <AdminField
                      label="Blokkeert vrij trainen"
                      // COPY: confirm met Marlon
                      hint="Tijdens deze sessie is de studio niet beschikbaar voor vrij trainen."
                    >
                      <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                        <input
                          type="checkbox"
                          checked={blocksFreeTraining}
                          onChange={(e) =>
                            setBlocksFreeTraining(e.target.checked)
                          }
                          className="cursor-pointer"
                        />
                        {/* COPY: confirm met Marlon */}
                        {blocksFreeTraining ? "Ja" : "Nee"}
                      </label>
                    </AdminField>
                  </>
                )}

                {mode === "once" && (
                  <AdminField label="Notities">
                    <AdminTextarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Optioneel, intern zichtbaar."
                    />
                  </AdminField>
                )}
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
