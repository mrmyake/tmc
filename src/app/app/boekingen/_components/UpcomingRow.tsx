"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "@/lib/member/booking-actions";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface UpcomingRowData {
  bookingId: string;
  startAt: string;
  endAt: string;
  className: string;
  trainerName: string;
  status: "booked" | "waitlisted";
}

interface UpcomingRowProps {
  row: UpcomingRowData;
  cancellationWindowHours: number;
}

const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

function formatTimeRange(start: Date, end: Date) {
  const fmt = (d: Date) =>
    d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function UpcomingRow({ row, cancellationWindowHours }: UpcomingRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = new Date(row.startAt);
  const end = new Date(row.endAt);
  const hoursUntil = (start.getTime() - Date.now()) / 3_600_000;
  const lateCancel = hoursUntil < cancellationWindowHours;

  function doCancel() {
    const note = lateCancel
      ? "Je annuleert binnen het cancel-venster. Deze sessie telt mee. Weet je het zeker?"
      : null;
    if (note && !window.confirm(note)) return;
    startTransition(async () => {
      const res = await cancelBooking(row.bookingId);
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <article
      className={`grid grid-cols-[72px_1fr_auto] items-start gap-6 py-8 border-b border-[color:var(--ink-500)]/60 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <div className="flex flex-col items-start gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
          {DAY_SHORT[start.getDay()]} · {MONTH_SHORT[start.getMonth()]}
        </span>
        <span className="font-[family-name:var(--font-playfair)] text-5xl leading-none tracking-[-0.02em]">
          {start.getDate()}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.01em]">
          {row.className}
        </h3>
        <p className="text-text-muted text-sm">Met {row.trainerName}</p>
        <p className="text-text-muted text-sm">{formatTimeRange(start, end)}</p>
        {error && (
          <p role="alert" className="text-[color:var(--danger)] text-xs mt-2">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-4">
        <StatusBadge status={row.status} />
        <button
          type="button"
          onClick={doCancel}
          disabled={pending}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {pending ? "Bezig" : "Annuleer"}
        </button>
      </div>
    </article>
  );
}
