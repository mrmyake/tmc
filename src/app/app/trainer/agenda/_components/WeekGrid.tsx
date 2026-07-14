"use client";

import { GRID_END_HOUR, GRID_HEIGHT_PX, GRID_START_HOUR, type AgendaDay } from "./types";
import { SessionBlock } from "./SessionBlock";

interface WeekGridProps {
  days: AgendaDay[];
  onSelect: (sessionId: string) => void;
  /**
   * PT-agenda C4-vervolg: klik op een leeg moment in de dagkolom. Geeft
   * de dag en het aangeklikte tijdstip terug (gesnapt op 15 minuten).
   * Optioneel zodat WeekGrid ook zonder deze prop bruikbaar blijft.
   */
  onSlotClick?: (isoDate: string, hour: number, minute: number) => void;
}

function hourLabel(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

const SLOT_SNAP_MIN = 15;

/**
 * PT-agenda PR D: tijdas-grid, gedeeld door de dag- en weekweergave
 * (werkt voor elk aantal dagen). Zelfde CSS-grid-positionering als
 * AdminWeekGrid (src/app/app/admin/rooster) — 1 minuut = 1 pixel.
 */
export function WeekGrid({ days, onSelect, onSlotClick }: WeekGridProps) {
  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) hours.push(h);
  const columns = `64px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div
      role="grid"
      aria-label="PT-agenda"
      className="bg-bg-elevated border border-[color:var(--ink-500)]"
    >
      <div
        className="grid border-b border-[color:var(--ink-500)]"
        style={{ gridTemplateColumns: columns }}
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

      <div
        className="relative grid"
        style={{ gridTemplateColumns: columns, height: `${GRID_HEIGHT_PX}px` }}
      >
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

        {days.map((d) => (
          <div
            key={d.isoDate}
            onClick={(e) => {
              if (!onSlotClick) return;
              // e.currentTarget is altijd deze kolom-div (niet het
              // aangeklikte kind), dus de rect klopt ongeacht waar in de
              // kolom geklikt is. SessionBlock stopt propagatie zelf, dus
              // deze handler vuurt uitsluitend bij een klik op leeg gebied.
              const rect = e.currentTarget.getBoundingClientRect();
              const offsetMin = e.clientY - rect.top;
              const snapped = Math.round(offsetMin / SLOT_SNAP_MIN) * SLOT_SNAP_MIN;
              const maxMin = (GRID_END_HOUR - GRID_START_HOUR) * 60 - SLOT_SNAP_MIN;
              const clamped = Math.min(Math.max(snapped, 0), maxMin);
              const hour = GRID_START_HOUR + Math.floor(clamped / 60);
              const minute = clamped % 60;
              onSlotClick(d.isoDate, hour, minute);
            }}
            className={`group relative border-r border-[color:var(--ink-500)] last:border-r-0 ${
              onSlotClick ? "cursor-pointer" : ""
            } ${d.isToday ? "bg-accent/[0.02]" : ""}`}
          >
            {/* Vrije-slot-affordance: klik op leeg gebied opent het
                boek-paneel met de aangeklikte tijd voor-ingevuld (C4-
                vervolg). Ligt achter de sessieblokken, dus zichtbaar in de
                vrije gaten. */}
            <div
              aria-hidden
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            >
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted/50">
                {/* COPY: confirm met Marlon */}
                Vrij
              </span>
            </div>

            {hours.map((h) => (
              <div
                key={h}
                aria-hidden
                style={{ top: `${(h - GRID_START_HOUR) * 60}px` }}
                className="absolute left-0 right-0 border-t border-[color:var(--ink-500)]/40"
              />
            ))}
            {d.sessions.map((s) => (
              <SessionBlock key={s.id} session={s} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
