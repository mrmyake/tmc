"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "@/lib/member/booking-actions";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatRelativeWhen,
  formatTimeRange,
} from "@/lib/format-date";

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

function isLateCancel(startMs: number, windowHours: number): boolean {
  return (startMs - Date.now()) / 3_600_000 < windowHours;
}

export function UpcomingRow({ row, cancellationWindowHours }: UpcomingRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = new Date(row.startAt);
  const end = new Date(row.endAt);

  function doCancel() {
    const note = isLateCancel(start.getTime(), cancellationWindowHours)
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
          {DAY_SHORT_NL[amsterdamParts(start).weekday]} ·{" "}
          {MONTH_SHORT_NL[amsterdamParts(start).month - 1]}
        </span>
        <span className="font-[family-name:var(--font-playfair)] text-5xl leading-none tracking-[-0.02em]">
          {amsterdamParts(start).day}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.01em]">
          {row.className}
        </h3>
        <p className="text-text-muted text-sm">Met {row.trainerName}</p>
        <p className="text-text-muted text-sm">{formatTimeRange(start, end)}</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          {formatRelativeWhen(start)}
        </p>
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
