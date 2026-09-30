"use client";

import { Fragment } from "react";
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
 * Starttijden per uur: een kopregel over de volle rasterbreedte met het uur
 * (en "Marlon aanwezig" als zij dat hele uur in de studio is), daaronder de
 * kwartieren in een raster van 3 kolommen op mobiel, 4 op tablet en 6 op
 * desktop (spec-rooster-vrij-trainen.md). Alleen boekbare starts zijn
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
    <div className="grid grid-cols-3 gap-1.5 md:grid-cols-4 lg:grid-cols-6">
      {rows.map((row, i) => (
        <Fragment key={`${row.hourLabel}-${i}`}>
          <div className="col-span-full flex items-baseline justify-between pt-3 first:pt-0">
            <span className="text-xs tabular-nums text-text-muted">{row.hourLabel}</span>
            {trainerPresentInHour(weekday, row.hour, presence) && (
              <span className="text-[10px] uppercase tracking-[0.12em] text-accent">
                {/* COPY: confirm met Marlon */}
                {presence.name} aanwezig
              </span>
            )}
          </div>
          {row.cells.map((cell) =>
            cell ? (
              <QuarterButton
                key={cell.quarterStart}
                cell={cell}
                isStart={cell.startMs === selectedStartMs}
                inSlot={slotQuarterMs.has(cell.startMs)}
                onSelect={onSelect}
              />
            ) : null,
          )}
        </Fragment>
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
      className={`flex flex-col items-center justify-center rounded border min-h-11 py-2 transition-colors duration-200 ${tone} ${
        cell.bookable ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className="text-sm tabular-nums leading-tight">{time}</span>
      <span className={`text-[10px] leading-tight ${labelTone}`}>{label}</span>
    </button>
  );
}
