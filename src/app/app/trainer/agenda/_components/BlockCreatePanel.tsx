"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import { OverrideWarning } from "../../boeken/_components/OverrideWarning";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import { createPtBlock } from "@/lib/trainer/pt-agenda-actions";

interface BlockCreatePanelProps {
  trainerId: string;
  /** Voorgeselecteerde datum (ISO yyyy-mm-dd), meestal de agenda-anchor. */
  defaultDateIso: string;
  onClose: () => void;
}

/**
 * PT-agenda C4: ad-hoc tijd blokkeren in de agenda. Zelfde slide-over-
 * vorm als SessionDetailPanel en dezelfde override-flow als verzetten:
 * bij een overlap- of omkleedtijd-conflict toont het paneel een
 * OverrideWarning en kan Marlon het blok bewust forceren.
 */
export function BlockCreatePanel({
  trainerId,
  defaultDateIso,
  onClose,
}: BlockCreatePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(defaultDateIso);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [note, setNote] = useState("");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [allowNoTurnaround, setAllowNoTurnaround] = useState(false);
  const [overlapConflict, setOverlapConflict] = useState(false);
  const [turnaroundConflict, setTurnaroundConflict] = useState(false);

  function clearConflicts() {
    setOverlapConflict(false);
    setTurnaroundConflict(false);
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    const [year, month, day] = date.split("-").map(Number);
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    const startAt = zonedWallClockToUtc(year, month, day, startHour, startMinute);
    // Een eindtijd voor of op de starttijd betekent: het blok loopt tot
    // die tijd op de volgende dag (bv. 23:00 - 01:00).
    let endAt = zonedWallClockToUtc(year, month, day, endHour, endMinute);
    if (endAt.getTime() <= startAt.getTime()) {
      const next = new Date(Date.UTC(year, month - 1, day + 1));
      endAt = zonedWallClockToUtc(
        next.getUTCFullYear(),
        next.getUTCMonth() + 1,
        next.getUTCDate(),
        endHour,
        endMinute,
      );
    }

    startTransition(async () => {
      const res = await createPtBlock({
        trainerId,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        note: note.trim() || undefined,
        allowOverlap,
        allowNoTurnaround,
      });
      if (!res.ok) {
        if (res.reason === "pt_overlap") {
          setOverlapConflict(true);
        } else if (res.reason === "pt_no_turnaround") {
          setTurnaroundConflict(true);
        } else {
          setError(res.message);
        }
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-md h-full bg-bg-elevated border-l border-[color:var(--ink-500)] overflow-y-auto p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="absolute top-6 right-6 text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          <X size={20} strokeWidth={1.5} />
        </button>

        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Blok toevoegen
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6 pr-10">
          {/* COPY: confirm met Marlon */}
          Blokkeer tijd in de agenda.
        </h2>
        <p className="text-text-muted text-sm mb-6">
          {/* COPY: confirm met Marlon */}
          Geblokkeerde tijd is niet boekbaar en kost geen credit.
        </p>

        <div className="flex flex-col gap-4">
          <AdminField label="Datum">
            <AdminInput
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                clearConflicts();
              }}
            />
          </AdminField>
          <div className="grid grid-cols-2 gap-4">
            <AdminField label="Van">
              <AdminInput
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  clearConflicts();
                }}
              />
            </AdminField>
            <AdminField label="Tot">
              <AdminInput
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  clearConflicts();
                }}
              />
            </AdminField>
          </div>
          <AdminField label="Notitie (optioneel)">
            <AdminInput
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              // COPY: confirm met Marlon
              placeholder="Bijv. prive-afspraak"
            />
          </AdminField>

          {overlapConflict && (
            <OverrideWarning
              tone="danger"
              // COPY: confirm met Marlon
              title="Dit blok overlapt met een bestaande afspraak."
              detail=""
              checked={allowOverlap}
              onCheckedChange={setAllowOverlap}
              checkboxLabel="Toch blokkeren, ik weet dat dit overlapt"
            />
          )}
          {turnaroundConflict && (
            <OverrideWarning
              tone="warning"
              // COPY: confirm met Marlon
              title="Geen omkleedtijd rond dit blok."
              detail=""
              checked={allowNoTurnaround}
              onCheckedChange={setAllowNoTurnaround}
              checkboxLabel="Toch blokkeren, zonder omkleedtijd"
            />
          )}

          <button
            type="button"
            disabled={pending}
            onClick={handleSubmit}
            className="w-full px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] bg-accent text-bg border border-accent hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            {pending ? "Bezig..." : "Blokkeer deze tijd"}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
