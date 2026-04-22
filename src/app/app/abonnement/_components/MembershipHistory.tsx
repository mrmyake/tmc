import { ChevronDown } from "lucide-react";
import { formatEuro } from "@/lib/crowdfunding-helpers";

export interface HistoryItem {
  id: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  pricePerCycleCents: number;
  billingCycleWeeks: number;
}

const STATUS_LABEL: Record<string, string> = {
  cancelled: "Beëindigd",
  expired: "Verlopen",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function MembershipHistory({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) return null;

  return (
    <details className="group border-t border-[color:var(--ink-500)]/60">
      <summary className="flex items-center justify-between py-6 cursor-pointer list-none">
        <span className="tmc-eyebrow">
          Historie · {items.length} {items.length === 1 ? "abbo" : "abbo's"}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={1.5}
          aria-hidden
          className="text-text-muted transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-open:rotate-180"
        />
      </summary>
      <ul className="border-t border-[color:var(--ink-500)]/60">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-[1fr_auto_auto] gap-6 py-5 border-b border-[color:var(--ink-500)]/60 items-baseline last:border-b-0"
          >
            <span className="font-[family-name:var(--font-playfair)] text-xl text-text leading-tight tracking-[-0.01em]">
              {item.planName}
            </span>
            <span className="text-text-muted text-xs">
              {formatDate(item.startDate)} – {formatDate(item.endDate)}
            </span>
            <span className="text-text-muted text-xs">
              {formatEuro(Math.round(item.pricePerCycleCents / 100))} /{" "}
              {item.billingCycleWeeks}wk ·{" "}
              {STATUS_LABEL[item.status] ?? item.status}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
