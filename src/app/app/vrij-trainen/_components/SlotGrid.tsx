"use client";

import {
  amsterdamClock,
  quarterLabel,
  trainerPresentInHour,
  type HourRow,
  type QuarterCell,
} from "@/lib/member/vrij-trainen-slots";

interface Presence {
  name: string;
  weekdays: readonly number[];
  windows: ReadonlyArray<{ from: string; to: string }>;
}

/**
 * Raster per uur: links het uur (plus de trainer als die het hele uur
 * aanwezig is), rechts vier kwartierknoppen. Alleen boekbare starts zijn
 * aanklikbaar. De gekozen start is champagne gevuld, de rest van het slot
 * champagne omrand.
 */
export function SlotGrid({
  rows,
  weekday,
  presence,
  selectedStartMs,
  slotQuarterMs,
  onSelect,
}: {
  rows: HourRow[];
  weekday: number;
  presence: Presence;
  selectedStartMs: number | null;
  slotQuarterMs: ReadonlySet<number>;
  onSelect: (cell: QuarterCell) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={`${row.hourLabel}-${i}`} className="grid grid-cols-[3.25rem_1fr] items-center gap-2">
          <div className="flex flex-col">
            <span className="text-sm text-text tabular-nums">{row.hourLabel}</span>
            {trainerPresentInHour(weekday, row.hour, presence) && (
              // COPY: confirm met Marlon
              <span className="text-[10px] uppercase tracking-[0.12em] text-accent">{presence.name}</span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {row.cells.map((cell, idx) =>
              cell ? (
                <QuarterButton
                  key={cell.quarterStart}
                  cell={cell}
                  isStart={cell.startMs === selectedStartMs}
                  inSlot={slotQuarterMs.has(cell.startMs)}
                  onSelect={onSelect}
                />
              ) : (
                <span key={`empty-${idx}`} aria-hidden />
              ),
            )}
          </div>
        </div>
      ))}
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
      className={`flex flex-col items-center justify-center rounded border py-2 transition-colors duration-200 ${tone} ${
        cell.bookable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className="text-sm tabular-nums leading-tight">{time}</span>
      <span className={`text-[10px] leading-tight ${labelTone}`}>{label}</span>
    </button>
  );
}
