import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { formatTime } from "@/lib/format-date";

export interface PublicSessionCardData {
  id: string;
  startAt: string;
  endAt: string;
  className: string;
  trainerName: string;
  pillar: string;
  capacity: number;
  bookedCount: number;
  userHasBooked: boolean;
}

interface PublicSessionCardProps {
  session: PublicSessionCardData;
}

export function PublicSessionCard({ session }: PublicSessionCardProps) {
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  const spotsLeft = Math.max(0, session.capacity - session.bookedCount);
  const isFull = spotsLeft === 0;
  const pillarLabel =
    PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar;

  return (
    <article className="bg-bg-elevated p-5 md:p-6 h-full flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-[family-name:var(--font-mono)] text-xs tracking-wide text-text-muted">
          {formatTime(start)} &ndash; {formatTime(end)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
          {pillarLabel}
        </span>
      </div>
      <h3 className="font-[family-name:var(--font-playfair)] text-xl md:text-2xl text-text leading-[1.05] tracking-[-0.01em]">
        {session.className}
      </h3>
      <p className="text-text-muted text-sm">met {session.trainerName}</p>
      <div className="mt-auto pt-3 border-t border-[color:var(--ink-500)]/60 flex items-center justify-between gap-3">
        <span
          className={`text-[11px] font-medium uppercase tracking-[0.16em] ${
            session.userHasBooked
              ? "text-[color:var(--success)]"
              : isFull
                ? "text-[color:var(--stone-600)]"
                : "text-accent"
          }`}
        >
          {session.userHasBooked
            ? "Geboekt"
            : isFull
              ? "Vol"
              : `${spotsLeft} van ${session.capacity} plekken`}
        </span>
      </div>
    </article>
  );
}
