"use client";

import Link from "next/link";
import type { AgendaDay } from "./types";

interface MonthGridProps {
  days: AgendaDay[];
  dayHref: (isoDate: string) => string;
}

const WEEKDAY_HEADERS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

// COPY: confirm met Marlon
const KIND_INITIAL: Record<string, string> = {
  bookable: "PT",
  intake: "IN",
  block: "BL",
};

function chunkWeeks(days: AgendaDay[]): AgendaDay[][] {
  const weeks: AgendaDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/**
 * PT-agenda PR D: maandoverzicht, geen tijd-grid (dat is week/dag) maar
 * een klassieke kalendercel-layout. Een dagcel klikken opent de
 * dagweergave voor die datum; er is bewust geen los sessie-detail vanuit
 * deze weergave (dag/week bieden dat al volledig).
 */
export function MonthGrid({ days, dayHref }: MonthGridProps) {
  const weeks = chunkWeeks(days);

  return (
    <div className="bg-bg-elevated border border-[color:var(--ink-500)]">
      <div className="grid grid-cols-7 border-b border-[color:var(--ink-500)]">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="py-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted border-r border-[color:var(--ink-500)] last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div
          key={wi}
          className="grid grid-cols-7 border-b border-[color:var(--ink-500)] last:border-b-0"
        >
          {week.map((d) => (
            <Link
              key={d.isoDate}
              href={dayHref(d.isoDate)}
              className={`min-h-[110px] p-2 border-r border-[color:var(--ink-500)] last:border-r-0 flex flex-col gap-1 transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-bg ${
                d.isCurrentMonth ? "" : "opacity-40"
              } ${d.isToday ? "bg-accent/5" : ""}`}
            >
              <span
                className={`text-sm font-[family-name:var(--font-playfair)] ${
                  d.isToday ? "text-accent" : "text-text"
                }`}
              >
                {d.dayNumber}
              </span>
              <div className="flex flex-col gap-0.5">
                {d.sessions.slice(0, 3).map((s) => (
                  <span
                    key={s.id}
                    className={`text-[9px] leading-tight px-1 py-0.5 truncate border-l-2 ${
                      s.overlapping
                        ? "border-[color:var(--danger)] text-[color:var(--danger)]"
                        : s.kind === "intake"
                          ? "border-[color:var(--warning)] text-text-muted"
                          : s.kind === "block"
                            ? "border-[color:var(--stone-500)] text-text-muted"
                            : "border-accent text-text-muted"
                    } ${s.status === "cancelled" ? "opacity-50 line-through" : ""}`}
                  >
                    {s.startLabel} {KIND_INITIAL[s.kind] ?? ""}
                  </span>
                ))}
                {d.sessions.length > 3 && (
                  <span className="text-[9px] text-text-muted/70">
                    {/* COPY: confirm met Marlon */}+{d.sessions.length - 3} meer
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
