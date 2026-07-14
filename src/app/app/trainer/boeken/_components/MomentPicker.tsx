"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getPtBusy, type PtBusyBlock } from "@/lib/admin/pt-busy-actions";
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
} from "@/app/app/trainer/agenda/_components/types";
import { snapOffsetMinutesToTime } from "@/lib/scheduling/slot-grid";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import {
  addDaysIsoAmsterdam,
  amsterdamParts,
  DAY_SHORT_NL,
  formatWeekdayDate,
  MONTH_SHORT_NL,
  parseIsoDateToAmsterdamMidnight,
  todayIsoAmsterdam,
} from "@/lib/format-date";

interface MomentPickerProps {
  trainerId: string;
  dateIso: string;
  time: string;
  /** Duur van de nieuwe sessie in minuten, voor de botsing-waarschuwing. */
  durationMin: number;
  onPick: (dateIso: string, time: string) => void;
}

// Compacter dan de volle agenda (1 minuut = 1 pixel): dit is een
// ingebed prik-hulpje in een formulier, geen volwaardige dagweergave.
const PX_PER_MIN = 0.55;
const TIMELINE_HEIGHT_PX = Math.round(
  (GRID_END_HOUR - GRID_START_HOUR) * 60 * PX_PER_MIN,
);

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function mondayOfIso(iso: string): string {
  const d =
    parseIsoDateToAmsterdamMidnight(iso) ??
    parseIsoDateToAmsterdamMidnight(todayIsoAmsterdam())!;
  const p = amsterdamParts(d);
  const isoWeekday = p.weekday === 0 ? 7 : p.weekday; // 1=ma .. 7=zo
  return addDaysIsoAmsterdam(iso, -(isoWeekday - 1));
}

function dayLabel(iso: string): { weekday: string; day: number; month: string } {
  const d = parseIsoDateToAmsterdamMidnight(iso) ?? new Date();
  const p = amsterdamParts(d);
  return {
    weekday: DAY_SHORT_NL[p.weekday],
    day: p.day,
    month: MONTH_SHORT_NL[p.month - 1],
  };
}

function dayWindowUtc(dayIso: string): { start: Date; end: Date } {
  const [y, m, d] = dayIso.split("-").map(Number);
  return {
    start: zonedWallClockToUtc(y, m, d, GRID_START_HOUR, 0),
    end: zonedWallClockToUtc(y, m, d, GRID_END_HOUR, 0),
  };
}

function overlapsBusy(
  dayIso: string,
  time: string,
  durationMin: number,
  busyForDay: PtBusyBlock[],
): boolean {
  const [y, m, d] = dayIso.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const start = zonedWallClockToUtc(y, m, d, h, min).getTime();
  const end = start + durationMin * 60_000;
  return busyForDay.some((b) => {
    const bs = new Date(b.blockedFrom).getTime();
    const be = new Date(b.blockedUntil).getTime();
    return start < be && bs < end;
  });
}

/**
 * PT-agenda PR H: vervangt de handmatige datum/tijd-invoer in
 * LosseSessieForm en IntakeForm door een ingebedde week-kalender op
 * get_pt_busy — dezelfde bron en dezelfde 15-min-snap-klik-wiskunde
 * (`snapOffsetMinutesToTime`) als de kalender-klik in de agenda (PR F).
 * Geen nieuwe RPC's: één get_pt_busy-call per getoonde week, hergebruikt
 * over alle 7 dag-tabs. Bezette tijden (incl. omkleedtijd) zijn
 * herkenbaar maar NIET hard-geblokkeerd voor een klik — dat zou de
 * bestaande override-flow (pt_overlap/pt_no_turnaround, ongewijzigd)
 * regressen, want die liet je altijd al bewust een botsend moment
 * intikken en daarna overrulen.
 */
export function MomentPicker({
  trainerId,
  dateIso,
  time,
  durationMin,
  onPick,
}: MomentPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [weekStartIso, setWeekStartIso] = useState(() => mondayOfIso(dateIso));
  const [activeDayIso, setActiveDayIso] = useState(dateIso);
  const [busy, setBusy] = useState<PtBusyBlock[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!trainerId) {
      setBusy([]);
      return;
    }
    const weekEndIso = addDaysIsoAmsterdam(weekStartIso, 7);
    const [y1, m1, d1] = weekStartIso.split("-").map(Number);
    const [y2, m2, d2] = weekEndIso.split("-").map(Number);
    const fromIso = zonedWallClockToUtc(y1, m1, d1, 0, 0).toISOString();
    const toIso = zonedWallClockToUtc(y2, m2, d2, 0, 0).toISOString();
    startTransition(async () => {
      const rows = await getPtBusy(trainerId, fromIso, toIso);
      setBusy(rows);
    });
  }, [trainerId, weekStartIso]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIsoAmsterdam(weekStartIso, i)),
    [weekStartIso],
  );

  const activeDayBusySegments = useMemo(() => {
    const { start: winStart, end: winEnd } = dayWindowUtc(activeDayIso);
    const segments: Array<{ topPx: number; heightPx: number; kind: string }> = [];
    for (const b of busy) {
      const bs = new Date(b.blockedFrom);
      const be = new Date(b.blockedUntil);
      const clippedStart = bs < winStart ? winStart : bs;
      const clippedEnd = be > winEnd ? winEnd : be;
      if (clippedEnd <= clippedStart) continue;
      const offsetMin = (clippedStart.getTime() - winStart.getTime()) / 60_000;
      const durMin = (clippedEnd.getTime() - clippedStart.getTime()) / 60_000;
      segments.push({
        topPx: offsetMin * PX_PER_MIN,
        heightPx: Math.max(2, durMin * PX_PER_MIN),
        kind: b.kind,
      });
    }
    return segments;
  }, [busy, activeDayIso]);

  // De botsing-hint is alleen betrouwbaar als de huidige keuze binnen de
  // getoonde week valt (anders is er geen data voor die dag opgehaald) —
  // bewust geen extra get_pt_busy-call om dat randgeval ook te dekken.
  const selectionInWeek = weekDays.includes(dateIso);
  const busyForSelectedDay = useMemo(() => {
    if (!selectionInWeek) return [];
    const { start: winStart, end: winEnd } = dayWindowUtc(dateIso);
    return busy.filter((b) => {
      const bs = new Date(b.blockedFrom);
      const be = new Date(b.blockedUntil);
      return bs < winEnd && be > winStart;
    });
  }, [busy, dateIso, selectionInWeek]);
  const hasCollision =
    selectionInWeek &&
    overlapsBusy(dateIso, time, durationMin, busyForSelectedDay);

  const selectedLabel = (() => {
    const d = parseIsoDateToAmsterdamMidnight(dateIso);
    return d ? `${formatWeekdayDate(d)}, ${time}` : time;
  })();

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetPx = e.clientY - rect.top;
    const { hour, minute } = snapOffsetMinutesToTime(
      offsetPx / PX_PER_MIN,
      GRID_START_HOUR,
      GRID_END_HOUR,
    );
    onPick(activeDayIso, `${pad2(hour)}:${pad2(minute)}`);
    setExpanded(false);
  }

  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) hours.push(h);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border border-[color:var(--ink-500)] bg-bg">
        <div>
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow block mb-1">Gekozen moment</span>
          <span className="text-text text-sm">{selectedLabel}</span>
          {hasCollision && (
            <p className="text-[color:var(--warning)] text-xs mt-1">
              {/* COPY: confirm met Marlon */}
              Let op: dit moment botst met een bestaande afspraak bij de
              gekozen duur.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveDayIso(dateIso);
            setWeekStartIso(mondayOfIso(dateIso));
            setExpanded((v) => !v);
          }}
          className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors cursor-pointer shrink-0"
        >
          {/* COPY: confirm met Marlon */}
          {expanded ? "Sluiten" : "Kies een moment"}
        </button>
      </div>

      {expanded && (
        <div className="border border-[color:var(--ink-500)] bg-bg-elevated p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setWeekStartIso((w) => addDaysIsoAmsterdam(w, -7))}
              className="px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] border border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Vorige week
            </button>
            <button
              type="button"
              onClick={() => setWeekStartIso(mondayOfIso(todayIsoAmsterdam()))}
              className="text-[10px] uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Vandaag
            </button>
            <button
              type="button"
              onClick={() => setWeekStartIso((w) => addDaysIsoAmsterdam(w, 7))}
              className="px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] border border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Volgende week
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Dag"
            className="grid grid-cols-7 gap-1 mb-4"
          >
            {weekDays.map((iso) => {
              const label = dayLabel(iso);
              const isActive = iso === activeDayIso;
              const isToday = iso === todayIsoAmsterdam();
              return (
                <button
                  key={iso}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveDayIso(iso)}
                  className={`flex flex-col items-center py-2 border text-xs transition-colors cursor-pointer ${
                    isActive
                      ? "bg-accent text-bg border-accent"
                      : "border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  <span className="uppercase tracking-[0.1em]">{label.weekday}</span>
                  <span
                    className={`font-medium ${isActive ? "" : isToday ? "text-accent" : ""}`}
                  >
                    {label.day}
                  </span>
                  <span className="uppercase tracking-[0.08em] text-[10px]">
                    {label.month}
                  </span>
                </button>
              );
            })}
          </div>

          {pending ? (
            // COPY: confirm met Marlon
            <p className="text-text-muted text-xs mb-2">
              Bezette tijden laden...
            </p>
          ) : (
            <>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-xs mb-2">
                Klik op een vrij moment. Bezet (incl. omkleedtijd) staat
                gearceerd.
              </p>
              <div
                onClick={handleTimelineClick}
                className="relative border border-[color:var(--ink-500)] cursor-pointer overflow-hidden"
                style={{ height: `${TIMELINE_HEIGHT_PX}px` }}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    aria-hidden
                    style={{ top: `${(h - GRID_START_HOUR) * 60 * PX_PER_MIN}px` }}
                    className="absolute left-0 right-0 border-t border-[color:var(--ink-500)]/40 flex items-start"
                  >
                    <span className="text-[9px] text-text-muted/70 px-1 -translate-y-1/2 bg-bg-elevated">
                      {pad2(h)}:00
                    </span>
                  </div>
                ))}
                {activeDayBusySegments.map((seg, i) => (
                  <div
                    key={i}
                    aria-hidden
                    style={{ top: `${seg.topPx}px`, height: `${seg.heightPx}px` }}
                    className="absolute left-8 right-1 bg-text-muted/20 border-l-2 border-[color:var(--stone-500)] pointer-events-none"
                  />
                ))}
                {activeDayIso === dateIso && (
                  <div
                    aria-hidden
                    style={{
                      top: `${(() => {
                        const [h, min] = time.split(":").map(Number);
                        return (h - GRID_START_HOUR) * 60 * PX_PER_MIN + min * PX_PER_MIN;
                      })()}px`,
                    }}
                    className="absolute left-0 right-0 border-t-2 border-accent pointer-events-none"
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
