import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";

export interface HistoryRowData {
  bookingId: string;
  startAt: string;
  className: string;
  trainerName: string;
  status: SessionStatus;
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

export function HistoryRow({ row }: { row: HistoryRowData }) {
  const start = new Date(row.startAt);

  return (
    <article className="grid grid-cols-[72px_1fr_auto] items-baseline gap-6 py-6 border-b border-[color:var(--ink-500)]/60">
      <div className="flex flex-col items-start gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
          {DAY_SHORT[start.getDay()]} · {MONTH_SHORT[start.getMonth()]}{" "}
          {start.getFullYear()}
        </span>
        <span className="font-[family-name:var(--font-playfair)] text-3xl leading-none tracking-[-0.02em] text-text">
          {start.getDate()}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-[family-name:var(--font-playfair)] text-xl text-text leading-[1.05] tracking-[-0.01em]">
          {row.className}
        </h3>
        <p className="text-text-muted text-sm">
          Met {row.trainerName} ·{" "}
          {start.toLocaleTimeString("nl-NL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <StatusBadge status={row.status} />
    </article>
  );
}
