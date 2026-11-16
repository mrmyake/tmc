"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { ProgrammaIntakeRow } from "@/lib/admin/programma-intakes-query";
import {
  updateProgrammaIntakeNotes,
  updateProgrammaIntakeStatus,
} from "@/lib/admin/programma-intakes-actions";
import {
  PROGRAMMA_INTAKE_NOTES_MAX,
  PROGRAMMA_INTAKE_STATUSES,
  PROGRAMMA_INTAKE_STATUS_LABEL,
  type ProgrammaIntakeStatus,
} from "@/lib/programma-intake/status";
import { formatShortDateWithYear, formatTime } from "@/lib/format-date";

const STATUS_TONE: Record<ProgrammaIntakeStatus, ChipTone> = {
  new: "accent",
  contacted: "warning",
  booked: "success",
  lost: "muted",
};

const fieldClasses =
  "w-full bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent";

/**
 * Een intake per kaart: contactgegevens als tel:- en mailto:-link, dag,
 * bericht (met regeleinden), bron, en de twee bewerkbare velden status en
 * notitie. Opslaan stuurt alleen wat gewijzigd is.
 */
export function IntakeCard({ row }: { row: ProgrammaIntakeRow }) {
  const router = useRouter();
  const [status, setStatus] = useState<ProgrammaIntakeStatus>(row.status);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const statusChanged = status !== row.status;
  const notesChanged = notes.trim() !== (row.notes ?? "");
  const dirty = statusChanged || notesChanged;
  const created = new Date(row.createdAt);

  function save() {
    startTransition(async () => {
      const messages: string[] = [];
      let ok = true;
      if (statusChanged) {
        const res = await updateProgrammaIntakeStatus(row.id, status);
        ok = ok && res.ok;
        messages.push(res.message);
      }
      if (notesChanged) {
        const res = await updateProgrammaIntakeNotes(row.id, notes);
        ok = ok && res.ok;
        messages.push(res.message);
      }
      setResult({ ok, message: messages.join(" ") });
      if (ok) router.refresh();
    });
  }

  return (
    <li
      className={`grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 py-6 border-b border-[color:var(--ink-500)]/40 ${
        row.status === "booked" || row.status === "lost" ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-base text-text">{row.name}</span>
          <Chip tone={STATUS_TONE[row.status]}>{PROGRAMMA_INTAKE_STATUS_LABEL[row.status]}</Chip>
          {row.isTest && <Chip tone="muted">Test</Chip>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-text">
          <a href={`tel:${row.phone}`} className="hover:text-accent transition-colors">
            {row.phone}
          </a>
          <a href={`mailto:${row.email}`} className="hover:text-accent transition-colors break-all">
            {row.email}
          </a>
          {row.whatsappHref && (
            <a
              href={row.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              {/* COPY: confirm met Marlon */}
              WhatsApp
            </a>
          )}
        </div>
        <p className="text-xs text-text-muted">
          {/* COPY: confirm met Marlon */}
          {formatShortDateWithYear(created)} om {formatTime(created)} · voorkeur {row.preferredDay}
        </p>
        {row.message && (
          <p className="whitespace-pre-wrap text-sm text-text-muted">{row.message}</p>
        )}
        {row.sourceLines.length > 0 && (
          <ul className="text-xs text-text-muted/80 break-all">
            {row.sourceLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProgrammaIntakeStatus)}
            disabled={pending}
            className={`${fieldClasses} cursor-pointer`}
          >
            {PROGRAMMA_INTAKE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROGRAMMA_INTAKE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Notitie (intern)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={PROGRAMMA_INTAKE_NOTES_MAX}
            disabled={pending}
            className={`${fieldClasses} resize-none`}
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent disabled:text-text-muted/50 cursor-pointer disabled:cursor-default"
          >
            {/* COPY: confirm met Marlon */}
            {pending ? "Bezig" : "Opslaan"}
          </button>
          {result && (
            <span
              role="status"
              className={`text-xs ${result.ok ? "text-text-muted" : "text-red-400"}`}
            >
              {result.message}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
