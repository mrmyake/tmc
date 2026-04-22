"use client";

import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  type AdminDay,
} from "./types";
import { AdminSessionBlock } from "./AdminSessionBlock";

interface AdminWeekGridProps {
  days: AdminDay[];
  onSelect: (sessionId: string) => void;
}

function hourLabel(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

export function AdminWeekGrid({ days, onSelect }: AdminWeekGridProps) {
  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) hours.push(h);

  return (
    <div
      role="grid"
      aria-label="Week rooster"
      className="bg-bg-elevated border border-[color:var(--ink-500)]"
    >
      {/* Day headers */}
      <div
        className="grid border-b border-[color:var(--ink-500)]"
        style={{ gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))" }}
      >
        <div aria-hidden className="border-r border-[color:var(--ink-500)]" />
        {days.map((d) => (
          <div
            key={d.isoDate}
            className={`py-4 px-3 text-center border-r border-[color:var(--ink-500)] last:border-r-0 ${
              d.isToday ? "bg-accent/5" : ""
            }`}
          >
            <div className="tmc-eyebrow mb-1">{d.weekdayShort}</div>
            <div
              className={`font-[family-name:var(--font-playfair)] text-2xl leading-none ${
                d.isToday ? "text-accent" : "text-text"
              }`}
            >
              {d.dayNumber}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted mt-1">
              {d.monthShort}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: "64px repeat(7, minmax(0, 1fr))",
          height: `${GRID_HEIGHT_PX}px`,
        }}
      >
        {/* Hour labels column */}
        <div className="relative border-r border-[color:var(--ink-500)]">
          {hours.map((h) => (
            <div
              key={h}
              style={{ top: `${(h - GRID_START_HOUR) * 60}px` }}
              className="absolute left-0 right-0 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted -translate-y-2"
            >
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d) => (
          <div
            key={d.isoDate}
            className={`relative border-r border-[color:var(--ink-500)] last:border-r-0 ${
              d.isToday ? "bg-accent/[0.02]" : ""
            }`}
          >
            {/* Hour grid lines */}
            {hours.map((h) => (
              <div
                key={h}
                aria-hidden
                style={{ top: `${(h - GRID_START_HOUR) * 60}px` }}
                className="absolute left-0 right-0 border-t border-[color:var(--ink-500)]/40"
              />
            ))}
            {/* Sessions */}
            {d.sessions.map((s) => (
              <AdminSessionBlock key={s.id} session={s} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
