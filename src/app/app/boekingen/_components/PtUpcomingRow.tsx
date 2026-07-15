import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatRelativeWhen,
  formatTimeRange,
} from "@/lib/format-date";
import { PtCancellationRequestAction } from "./PtCancellationRequestAction";

export interface PtUpcomingRowData {
  bookingId: string;
  startAt: string;
  endAt: string;
  label: string;
  trainerName: string;
  status: SessionStatus;
  /** Eigen pending annuleer-verzoek op deze boeking (PR E2). */
  hasPendingCancellation: boolean;
}

/**
 * PT-agenda PR E2: het lid muteert nooit direct (geen annuleren/verzetten
 * server-side vanaf deze rij), maar kan wel een annuleer-VERZOEK indienen
 * dat staf afhandelt (PtCancellationRequestAction). PtUpcomingRow blijft
 * zelf een server component; alleen de actie is "use client".
 */
export function PtUpcomingRow({ row }: { row: PtUpcomingRowData }) {
  const start = new Date(row.startAt);
  const end = new Date(row.endAt);

  return (
    <article className="grid grid-cols-[72px_1fr_auto] items-start gap-6 py-8 border-b border-[color:var(--ink-500)]/60">
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
          {row.label}
        </h3>
        <p className="text-text-muted text-sm">Met {row.trainerName}</p>
        <p className="text-text-muted text-sm">{formatTimeRange(start, end)}</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          {formatRelativeWhen(start)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-4">
        <StatusBadge status={row.status} />
        <PtCancellationRequestAction
          ptBookingId={row.bookingId}
          hasPendingCancellation={row.hasPendingCancellation}
        />
      </div>
    </article>
  );
}
