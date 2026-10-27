import { ChevronDown } from "lucide-react";
import { formatShortDate, durationMinutes } from "@/lib/format-date";
import type { WorkoutSession } from "@/lib/training-history/types";
import { SetList } from "./SetList";

interface WorkoutHistoryProps {
  sessions: WorkoutSession[];
}

/**
 * Weergave 3: per workout, inklapbare sessies met datum, dag en
 * schemaversie, oefeningen in slotvolgorde. Een sessie zonder gelogde
 * sets wordt getoond met "Geen sets gelogd", niet verborgen (zie de
 * discovery FASE A: afronden zonder loggen komt in productie voor).
 */
export function WorkoutHistory({ sessions }: WorkoutHistoryProps) {
  if (sessions.length === 0) {
    // COPY: confirm met Marlon
    return <p className="text-text-muted text-sm">Nog geen afgeronde workouts gelogd.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => {
        // COPY: confirm met Marlon
        const metaParts = [
          `Dag ${s.dayNumber}${s.dayLabel ? `: ${s.dayLabel}` : ""}, versie ${s.programVersion}`,
          s.exercises.length > 0
            ? `${s.exercises.length} ${s.exercises.length === 1 ? "oefening" : "oefeningen"}`
            : "Geen sets gelogd",
          `${durationMinutes(new Date(s.startedAt), new Date(s.completedAt))} min`,
        ];

        return (
          <details
            key={s.sessionId}
            className="border border-[color:var(--ink-500)] bg-bg-elevated group"
          >
            <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <div className="text-text font-medium">
                  {formatShortDate(new Date(s.startedAt))}
                </div>
                <div className="text-text-muted text-xs mt-0.5">{metaParts.join(" · ")}</div>
              </div>
              <ChevronDown
                size={18}
                strokeWidth={1.6}
                className="shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-180"
              />
            </summary>

            {s.exercises.length === 0 ? (
              // COPY: confirm met Marlon
              <div className="px-4 py-3.5 text-sm text-text-muted border-t border-[color:var(--ink-500)]/60">
                Deze workout is afgerond zonder gelogde sets.
              </div>
            ) : (
              <div className="px-4 pb-1 border-t border-[color:var(--ink-500)]/60">
                {s.exercises.map((ex) => (
                  <div
                    key={ex.programExerciseId}
                    className="py-3 border-b border-[color:var(--ink-500)]/30 last:border-b-0"
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-accent font-medium text-xs">{ex.slot}</span>
                      <span className="text-text text-sm font-medium">{ex.exerciseName}</span>
                    </div>
                    <div className="text-text-muted text-sm">
                      <SetList sets={ex.sets} isBodyweight={ex.isBodyweight} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </details>
        );
      })}
    </div>
  );
}
