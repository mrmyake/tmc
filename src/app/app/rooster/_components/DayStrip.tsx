"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  parseIsoDateToAmsterdamMidnight,
  amsterdamParts,
} from "@/lib/format-date";
import {
  trackScheduleDayView,
  trackSchedulePaginateForward,
} from "@/lib/analytics";

export interface DayStripDay {
  /** yyyy-mm-dd in Amsterdam tijd */
  iso: string;
  /** sessies met ten minste één open plek */
  openCount: number;
  /** totaal gepubliceerde sessies */
  totalCount: number;
}

interface DayStripProps {
  /** Alle 7 dagen van het huidige window (iso yyyy-mm-dd). */
  days: DayStripDay[];
  /** Geselecteerde dag iso (één van `days`). */
  selectedIso: string;
  /** yyyy-mm-dd van vandaag (server-gegeven, Amsterdam). */
  todayIso: string;
  /** Window-start iso, voor URL-building. Pas opnemen als != vandaag. */
  fromIso: string;
  /** Actief pillar-filter (of null). */
  pillarFilter: string | null;
  /**
   * Link naar volgende 7-daagse window, of null als we al aan het eind
   * van de gepubliceerde sessies zitten.
   */
  nextHref: string | null;
}

/**
 * Bouw de URL voor dag-klik. Client-side duplicate van `buildHref`
 * in page.tsx. We kunnen de server-versie niet als prop doorgeven
 * (functies mogen niet over de RSC-boundary) — vandaar hier opnieuw.
 */
function buildDayHref(
  fromIso: string,
  todayIso: string,
  iso: string,
  pillarFilter: string | null,
): string {
  const qs = new URLSearchParams();
  if (fromIso !== todayIso) qs.set("from", fromIso);
  qs.set("dag", iso);
  if (pillarFilter) qs.set("pijler", pillarFilter);
  const query = qs.toString();
  return query ? `/app/rooster?${query}` : "/app/rooster";
}

export function DayStrip({
  days,
  selectedIso,
  todayIso,
  fromIso,
  pillarFilter,
  nextHref,
}: DayStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Fire `schedule_day_view` bij eerste render + bij selectie-wijziging.
  useEffect(() => {
    const todayMs = parseIsoDateToAmsterdamMidnight(todayIso)?.getTime();
    const selMs = parseIsoDateToAmsterdamMidnight(selectedIso)?.getTime();
    if (!todayMs || !selMs) return;
    const daysAhead = Math.round((selMs - todayMs) / 86_400_000);
    trackScheduleDayView(daysAhead);
  }, [selectedIso, todayIso]);

  // Pijltjestoetsen: schakel links/rechts tussen dagen.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const index = days.findIndex((d) => d.iso === selectedIso);
    if (index === -1) return;
    const next =
      e.key === "ArrowLeft"
        ? Math.max(0, index - 1)
        : Math.min(days.length - 1, index + 1);
    if (next === index) return;
    e.preventDefault();
    const target = stripRef.current?.querySelector<HTMLAnchorElement>(
      `[data-iso="${days[next].iso}"]`,
    );
    target?.click();
  }

  return (
    <section aria-labelledby="day-strip-title" className="mb-10">
      <h2 id="day-strip-title" className="sr-only">
        Kies een dag
      </h2>
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Dagen"
        onKeyDown={onKeyDown}
        className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-7 sm:gap-3 -mx-6 px-6 sm:mx-0 sm:px-0 scroll-smooth snap-x snap-mandatory sm:snap-none"
      >
        {days.map((d) => {
          const selected = d.iso === selectedIso;
          const dateObj = parseIsoDateToAmsterdamMidnight(d.iso);
          const parts = dateObj
            ? amsterdamParts(dateObj)
            : null;
          const weekdayShort = parts ? DAY_SHORT_NL[parts.weekday] : "";
          const monthShort = parts
            ? MONTH_SHORT_NL[parts.month - 1]
            : "";
          const dayLabel = labelForDay(d.iso, todayIso, weekdayShort);
          const hasOpen = d.openCount > 0;

          return (
            <Link
              key={d.iso}
              href={buildDayHref(fromIso, todayIso, d.iso, pillarFilter)}
              scroll={false}
              role="tab"
              aria-selected={selected}
              aria-current={selected ? "date" : undefined}
              data-iso={d.iso}
              className={`snap-start shrink-0 sm:shrink min-w-[88px] sm:min-w-0 flex flex-col items-start gap-1.5 px-4 py-4 border transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                selected
                  ? "border-accent bg-bg-elevated text-text"
                  : "border-[color:var(--ink-500)]/50 text-text-muted hover:border-accent/60 hover:text-text"
              }`}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.2em]">
                {dayLabel}
              </span>
              <span
                className={`font-[family-name:var(--font-playfair)] text-3xl leading-none tracking-[-0.02em] ${
                  selected ? "text-text" : "text-text"
                }`}
              >
                {parts?.day ?? "–"}
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                {monthShort}
              </span>
              <span
                aria-hidden
                className={`mt-1 h-1 w-1 rounded-full ${
                  hasOpen
                    ? "bg-accent"
                    : d.totalCount > 0
                      ? "bg-text-muted/40"
                      : "bg-transparent"
                }`}
              />
              <span className="sr-only">
                {d.totalCount === 0
                  ? "Geen lessen"
                  : `${d.openCount} van ${d.totalCount} lessen met open plekken`}
              </span>
            </Link>
          );
        })}
      </div>

      {nextHref && (
        <div className="mt-6 flex justify-end">
          <Link
            href={nextHref}
            scroll={false}
            onClick={() => trackSchedulePaginateForward(nextHref)}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 hover:text-accent"
          >
            Volgende 7 dagen
            <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

function labelForDay(
  iso: string,
  todayIso: string,
  weekdayShort: string,
): string {
  if (iso === todayIso) return "Vandaag";
  const today = parseIsoDateToAmsterdamMidnight(todayIso);
  const day = parseIsoDateToAmsterdamMidnight(iso);
  if (today && day) {
    const diff = Math.round(
      (day.getTime() - today.getTime()) / 86_400_000,
    );
    if (diff === 1) return "Morgen";
  }
  return weekdayShort;
}
