"use client";

import {
  amsterdamClock,
  quarterLabel,
  type QuarterCell,
} from "@/lib/member/vrij-trainen-slots";

interface Presence {
  name: string;
  weekdays: readonly number[];
  windows: ReadonlyArray<{ from: string; to: string }>;
}

/**
 * Starttijden als raster: 3 kolommen op mobiel, 4 op tablet, 6 op desktop
 * (spec-rooster-vrij-trainen.md). Alleen boekbare starts zijn aanklikbaar. De
 * gekozen start is champagne gevuld, de rest van het slot champagne omrand.
 * Staat de trainer die dag in de studio, dan staat dat onder het raster.
 */
export function SlotGrid({
  cells,
  weekday,
  presence,
  selectedStartMs,
  slotQuarterMs,
  onSelect,
}: {
  cells: QuarterCell[];
  weekday: number;
  presence: Presence;
  selectedStartMs: number | null;
  slotQuarterMs: ReadonlySet<number>;
  onSelect: (cell: QuarterCell) => void;
}) {
  const present = presence.weekdays.includes(weekday);
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-4 lg:grid-cols-6">
        {cells.map((cell) => (
          <QuarterButton
            key={cell.quarterStart}
            cell={cell}
            isStart={cell.startMs === selectedStartMs}
            inSlot={slotQuarterMs.has(cell.startMs)}
            onSelect={onSelect}
          />
        ))}
      </div>
      {present && presence.windows.length > 0 && (
        <p className="mt-4 text-xs text-text-muted">
          {/* COPY: confirm met Marlon */}
          {presence.name} is er van{" "}
          {presence.windows.map((w) => `${w.from} tot ${w.to}`).join(" en van ")}.
        </p>
      )}
    </div>
  );
}

function QuarterButton({
  cell,
  isStart,
  inSlot,
  onSelect,
}: {
  cell: QuarterCell;
  isStart: boolean;
  inSlot: boolean;
  onSelect: (cell: QuarterCell) => void;
}) {
  const time = amsterdamClock(cell.startMs);
  const label = quarterLabel(cell);

  let tone: string;
  if (isStart) {
    tone = "bg-accent border-accent text-bg";
  } else if (inSlot) {
    tone = "border-accent bg-bg-elevated text-text";
  } else if (cell.state === "blocked") {
    tone = "border-dashed border-[color:var(--stone-600)] bg-transparent text-[color:var(--stone-500)]";
  } else if (cell.bookable) {
    tone = "border-[color:var(--ink-500)]/60 bg-bg-elevated text-text hover:border-text-muted";
  } else {
    tone = "border-transparent bg-bg-elevated/40 text-[color:var(--stone-600)]";
  }

  const labelTone = isStart
    ? "text-bg"
    : cell.state === "few"
      ? "text-accent"
      : "text-text-muted";

  return (
    <button
      type="button"
      disabled={!cell.bookable}
      aria-pressed={isStart}
      aria-label={`${time}, ${label}`}
      onClick={() => onSelect(cell)}
      className={`flex flex-col items-center justify-center rounded border min-h-11 py-2 transition-colors duration-200 ${tone} ${
        cell.bookable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className="text-sm tabular-nums leading-tight">{time}</span>
      <span className={`text-[10px] leading-tight ${labelTone}`}>{label}</span>
    </button>
  );
}
