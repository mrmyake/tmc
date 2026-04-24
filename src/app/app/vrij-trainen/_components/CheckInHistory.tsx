import { amsterdamParts, DAY_SHORT_NL, MONTH_SHORT_NL } from "@/lib/format-date";

interface CheckInHistoryItem {
  id: string;
  checked_in_at: string;
}

interface Props {
  items: CheckInHistoryItem[];
}

export function CheckInHistory({ items }: Props) {
  return (
    <section aria-labelledby="checkin-history-title">
      <h2
        id="checkin-history-title"
        className="tmc-eyebrow block mb-5"
      >
        Recent ingecheckt
      </h2>
      {items.length === 0 ? (
        <div className="bg-bg-elevated p-8 text-center">
          <p className="text-text-muted text-sm leading-relaxed max-w-md mx-auto">
            Nog geen check-ins. Kom langs en tik je nummer bij de tablet —
            deze lijst vult zich daarna automatisch.
          </p>
        </div>
      ) : (
        <ul className="border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60">
          {items.map((item) => {
            const d = new Date(item.checked_in_at);
            const parts = amsterdamParts(d);
            const dayLabel = DAY_SHORT_NL[parts.weekday];
            const monthLabel = MONTH_SHORT_NL[parts.month - 1];
            const hh = String(parts.hour).padStart(2, "0");
            const mm = String(parts.minute).padStart(2, "0");
            return (
              <li
                key={item.id}
                className="grid grid-cols-[80px_1fr_auto] gap-4 py-4 items-baseline"
              >
                <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
                  {dayLabel} {parts.day} {monthLabel}
                </span>
                <span className="text-text text-sm">Vrij trainen</span>
                <span className="text-text-muted text-xs tabular-nums">
                  {hh}:{mm}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
