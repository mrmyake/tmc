import Link from "next/link";
import { ProgressionBarChart } from "@/components/ui/ProgressionBarChart";
import { formatShortDate } from "@/lib/format-date";
import type { ExerciseHistoryResult, ExerciseOption } from "@/lib/training-history/types";
import { SetList } from "./SetList";

interface ExerciseHistoryProps {
  options: ExerciseOption[];
  activeExerciseId: string;
  result: ExerciseHistoryResult;
  hrefFor: (exerciseId: string) => string;
}

/**
 * Weergave 2: per oefening, chips om te wisselen, een staafgrafiek
 * (topgewicht per sessie, of bij een bodyweight-oefening de meeste reps
 * per sessie) en een tabel met alle sets. Gedeeld tussen
 * /app/schema/geschiedenis, de admin-tab Historie en de
 * trainer-klantpagina.
 */
export function ExerciseHistory({
  options,
  activeExerciseId,
  result,
  hrefFor,
}: ExerciseHistoryProps) {
  const { isBodyweight, sessions } = result;
  const chartPoints = sessions.map((s) => ({
    label: formatShortDate(new Date(s.startedAt)),
    value: s.topValue,
  }));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        {options.map((ex) => (
          <Link
            key={ex.exerciseId}
            href={hrefFor(ex.exerciseId)}
            className={`px-3 py-2 text-xs font-medium border transition-colors ${
              ex.exerciseId === activeExerciseId
                ? "border-accent text-accent"
                : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {ex.name}
          </Link>
        ))}
      </div>

      {sessions.length === 0 ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm">Nog geen historie voor deze oefening.</p>
      ) : (
        <>
          <section className="mb-10 bg-bg-elevated p-6 border border-[color:var(--ink-500)]">
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow block mb-4">
              {isBodyweight ? "Meeste reps per sessie" : "Topgewicht per sessie"}
            </span>
            <ProgressionBarChart points={chartPoints} unit={isBodyweight ? "reps" : "kg"} />
          </section>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ink-500)]/60 text-left">
                  {/* COPY: confirm met Marlon (kolomkoppen) */}
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">
                    Datum
                  </th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">
                    Sets
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions
                  .slice()
                  .reverse()
                  .map((s) => (
                    <tr key={s.sessionId} className="border-b border-[color:var(--ink-500)]/30">
                      <td className="py-3 pr-4 text-text whitespace-nowrap">
                        {formatShortDate(new Date(s.startedAt))}
                        {s.isArchivedVersion && (
                          <span
                            className="inline-block ml-2 text-[10px] uppercase tracking-[0.12em] text-text-muted border border-[color:var(--ink-500)] rounded-full px-1.5 py-0.5 align-middle"
                          >
                            v{s.programVersion}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-text-muted">
                        <SetList sets={s.sets} isBodyweight={isBodyweight} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted/80 text-xs mt-3">
            Zwaarste set vetgedrukt. v = gelogd tegen een eerdere schemaversie.
          </p>
        </>
      )}
    </div>
  );
}
