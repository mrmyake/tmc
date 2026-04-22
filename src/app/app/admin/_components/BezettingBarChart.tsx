export interface BezettingDay {
  isoDate: string;
  label: string;
  booked: number;
  capacity: number;
}

interface BezettingBarChartProps {
  days: BezettingDay[];
}

export function BezettingBarChart({ days }: BezettingBarChartProps) {
  const maxCapacity = Math.max(...days.map((d) => d.capacity), 1);

  return (
    <div
      role="figure"
      aria-label="Bezetting per dag deze week"
      className="flex flex-col gap-4"
    >
      <div className="flex items-end gap-3 h-52">
        {days.map((d) => {
          const utilisation =
            d.capacity > 0 ? Math.min(1, d.booked / d.capacity) : 0;
          const heightPct = Math.max(4, (d.booked / maxCapacity) * 100);
          const label = `${d.label}: ${d.booked} van ${d.capacity} geboekt${
            d.capacity > 0
              ? ` (${Math.round(utilisation * 100)}%)`
              : ""
          }`;

          return (
            <div
              key={d.isoDate}
              className="flex-1 flex flex-col items-stretch gap-2 h-full justify-end"
            >
              <div
                className="relative w-full flex flex-col justify-end"
                style={{ height: "100%" }}
              >
                <div
                  aria-label={label}
                  style={{ height: `${heightPct}%` }}
                  className={`w-full ${
                    utilisation >= 0.85
                      ? "bg-accent"
                      : utilisation >= 0.5
                        ? "bg-accent/60"
                        : "bg-[color:var(--ink-600)]"
                  }`}
                />
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted text-center">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-text-muted">
        {days.reduce((s, d) => s + d.booked, 0)} boekingen op{" "}
        {days.reduce((s, d) => s + d.capacity, 0)} plekken deze week.
      </p>
    </div>
  );
}
