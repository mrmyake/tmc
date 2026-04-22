import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  delta?: { direction: "up" | "down" | "flat"; label: string };
}

export function KpiCard({ label, value, hint, delta }: KpiCardProps) {
  const deltaColor =
    delta?.direction === "up"
      ? "text-accent"
      : delta?.direction === "down"
        ? "text-text-muted"
        : "text-text-muted";

  return (
    <article className="bg-bg-elevated p-6 md:p-7 flex flex-col gap-3">
      <span className="tmc-eyebrow">{label}</span>
      <p className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-none tracking-[-0.02em]">
        {value}
      </p>
      <div className="flex items-baseline gap-2 text-xs text-text-muted">
        {delta && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.16em] ${deltaColor}`}
          >
            {delta.direction === "up" && (
              <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />
            )}
            {delta.direction === "down" && (
              <ArrowDownRight size={12} strokeWidth={1.5} aria-hidden />
            )}
            {delta.label}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </article>
  );
}
