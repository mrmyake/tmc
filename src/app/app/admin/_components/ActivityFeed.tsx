import { formatShortDateWithYear } from "@/lib/format-date";

export type ActivityTone = "positive" | "warning" | "neutral";

export interface ActivityItem {
  id: string;
  tone: ActivityTone;
  at: string;
  title: string;
  detail: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

function toneDot(tone: ActivityTone): string {
  if (tone === "positive") return "bg-[color:var(--success)]";
  if (tone === "warning") return "bg-[color:var(--danger)]";
  return "bg-text-muted";
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-text-muted text-sm">
        Nog geen recente activiteit.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.id}
          className="py-4 first:pt-0 last:pb-0 border-b border-[color:var(--ink-500)]/60 last:border-b-0 grid grid-cols-[10px_1fr] gap-3 items-start"
        >
          <span
            aria-hidden
            className={`mt-2 w-1.5 h-1.5 rounded-full ${toneDot(item.tone)}`}
          />
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-text text-sm leading-snug truncate">
                {item.title}
              </p>
              <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted whitespace-nowrap">
                {formatShortDateWithYear(new Date(item.at))}
              </span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              {item.detail}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
