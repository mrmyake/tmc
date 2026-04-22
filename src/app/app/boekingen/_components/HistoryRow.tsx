import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatTime,
} from "@/lib/format-date";

export interface HistoryRowData {
  bookingId: string;
  startAt: string;
  className: string;
  trainerName: string;
  status: SessionStatus;
}

export function HistoryRow({ row }: { row: HistoryRowData }) {
  const start = new Date(row.startAt);

  return (
    <article className="grid grid-cols-[72px_1fr_auto] items-baseline gap-6 py-6 border-b border-[color:var(--ink-500)]/60">
      <div className="flex flex-col items-start gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
          {DAY_SHORT_NL[amsterdamParts(start).weekday]} ·{" "}
          {MONTH_SHORT_NL[amsterdamParts(start).month - 1]}{" "}
          {amsterdamParts(start).year}
        </span>
        <span className="font-[family-name:var(--font-playfair)] text-3xl leading-none tracking-[-0.02em] text-text">
          {amsterdamParts(start).day}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-[family-name:var(--font-playfair)] text-xl text-text leading-[1.05] tracking-[-0.01em]">
          {row.className}
        </h3>
        <p className="text-text-muted text-sm">
          Met {row.trainerName} · {formatTime(start)}
        </p>
      </div>
      <StatusBadge status={row.status} />
    </article>
  );
}
