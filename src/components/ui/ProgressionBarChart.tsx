export interface ProgressionPoint {
  label: string;
  value: number;
}

interface ProgressionBarChartProps {
  points: ProgressionPoint[];
  /** Eenheid achter de waarde in de aria-label, bv. "kg". */
  unit: string;
}

/** Simpele progressielijn (gewicht over tijd), zelfde hand-rolled bar-stijl als BezettingBarChart. */
export function ProgressionBarChart({ points, unit }: ProgressionBarChartProps) {
  const maxValue = Math.max(...points.map((p) => p.value), 1);

  return (
    <div role="figure" aria-label="Progressie over tijd" className="flex flex-col gap-4">
      {/* Inline height i.p.v. h-40: die utility class loste in deze geneste
          flex-kolom niet op naar een gebruikte hoogte, waardoor de
          percentage-hoogtes van de balken eronder altijd op 0 uitkwamen. */}
      <div className="flex items-end gap-3" style={{ height: "10rem" }}>
        {points.map((p, i) => {
          const heightPct = Math.max(4, (p.value / maxValue) * 100);
          return (
            <div
              key={`${p.label}-${i}`}
              className="flex-1 flex flex-col items-stretch gap-2 h-full justify-end"
            >
              <div className="relative w-full flex flex-col justify-end" style={{ height: "100%" }}>
                <div
                  aria-label={`${p.label}: ${p.value} ${unit}`}
                  style={{ height: `${heightPct}%` }}
                  className="w-full bg-accent"
                />
              </div>
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted text-center truncate">
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
