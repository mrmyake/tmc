import Link from "next/link";
import type { MemberProgramDayRow } from "@/lib/member/training-program-query";
import { tempoNotation, tempoPlainLanguage } from "@/lib/training-tempo";

interface Props {
  day: MemberProgramDayRow;
  /**
   * "Start workout" linkt naar de workout-logger van het ingelogde lid
   * zelf; de read-only trainer-klantweergave (C4) zet dit uit.
   */
  showWorkoutLink?: boolean;
}

export function DayScheduleCard({ day, showWorkoutLink = true }: Props) {
  return (
    <section className="border border-[color:var(--ink-500)] bg-bg-elevated">
      <header className="px-6 py-4 border-b border-[color:var(--ink-500)]/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow tmc-eyebrow--accent shrink-0">
            Dag {day.dayNumber}
          </span>
          {day.label && (
            <span className="text-text text-sm font-medium truncate">
              {day.label}
            </span>
          )}
        </div>
        {showWorkoutLink && day.exercises.length > 0 && (
          <Link
            href={`/app/schema/${day.id}/workout`}
            className="inline-flex items-center justify-center px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted hover:border-accent hover:text-accent transition-colors shrink-0"
          >
            {/* COPY: confirm met Marlon */}
            Start workout
          </Link>
        )}
      </header>

      <div className="px-6 py-5">
        {day.exercises.length === 0 ? (
          // COPY: confirm met Marlon
          <p className="text-text-muted text-sm">
            Nog geen oefeningen op deze dag.
          </p>
        ) : (
          <ul className="flex flex-col gap-6">
            {day.exercises.map((row) => (
              <li
                key={row.id}
                className="pb-6 border-b border-[color:var(--ink-500)]/30 last:border-b-0 last:pb-0"
              >
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-accent font-medium tabular-nums text-sm">
                    {row.slot}
                  </span>
                  <span className="text-text font-medium">
                    {row.exerciseName}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-muted">
                  {/* COPY: confirm met Marlon */}
                  <span>
                    {row.sets} x{" "}
                    {row.repsMin === row.repsMax
                      ? row.repsMin
                      : `${row.repsMin}-${row.repsMax}`}{" "}
                    reps
                  </span>
                  <span className="tabular-nums">
                    Tempo{" "}
                    {tempoNotation(
                      row.tempoEccentric,
                      row.tempoPauseBottom,
                      row.tempoConcentric,
                      row.tempoPauseTop,
                    )}
                  </span>
                  {/* COPY: confirm met Marlon */}
                  <span>Rust {row.restSeconds}s</span>
                </div>

                <p className="text-text-muted text-xs mt-1.5">
                  {tempoPlainLanguage(
                    row.tempoEccentric,
                    row.tempoPauseBottom,
                    row.tempoConcentric,
                    row.tempoPauseTop,
                  )}
                </p>

                {row.notes && (
                  <p className="text-text-muted text-sm mt-2 whitespace-pre-wrap">
                    {row.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
