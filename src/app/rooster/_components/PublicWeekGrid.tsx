import {
  PublicSessionCard,
  type PublicSessionCardData,
} from "./PublicSessionCard";

export interface PublicDay {
  isoDate: string;
  weekdayShort: string;
  dayNumber: number;
  monthShort: string;
  sessions: PublicSessionCardData[];
}

interface PublicWeekGridProps {
  days: PublicDay[];
}

export function PublicWeekGrid({ days }: PublicWeekGridProps) {
  return (
    <>
      {/* Mobile: stacked per day */}
      <div className="md:hidden flex flex-col gap-10">
        {days.map((day) => (
          <section key={day.isoDate}>
            <header className="flex items-baseline gap-4 mb-4 sticky top-20 bg-bg/80 backdrop-blur-sm py-2 z-10">
              <span className="tmc-eyebrow">
                {day.weekdayShort} {day.dayNumber} {day.monthShort}
              </span>
              <span
                aria-hidden
                className="flex-1 h-px bg-[color:var(--ink-500)]/50"
              />
            </header>
            {day.sessions.length === 0 ? (
              <p className="py-6 text-text-muted text-sm text-center">
                Geen sessies.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {day.sessions.map((s) => (
                  <PublicSessionCard key={s.id} session={s} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Desktop: 7-col week grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-3">
          {days.map((day) => (
            <div key={day.isoDate} className="flex flex-col gap-3">
              <header className="pb-3 border-b border-[color:var(--ink-500)]/50">
                <span className="tmc-eyebrow text-text-muted">
                  {day.weekdayShort}
                </span>
                <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.02em] mt-1">
                  {day.dayNumber}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mt-1">
                  {day.monthShort}
                </p>
              </header>
              {day.sessions.length === 0 ? (
                <p className="text-text-muted/60 text-xs text-center py-6">
                  —
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {day.sessions.map((s) => (
                    <PublicSessionCard key={s.id} session={s} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
