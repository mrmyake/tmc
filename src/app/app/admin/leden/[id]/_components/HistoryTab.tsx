import Link from "next/link";
import {
  listLoggedExercisesForMember,
  loadExerciseHistory,
} from "@/lib/admin/training-history-query";
import { ProgressionBarChart } from "@/components/ui/ProgressionBarChart";
import { formatShortDate } from "@/lib/format-date";

interface Props {
  profileId: string;
  selectedExerciseId?: string;
}

/**
 * Tab "Historie" op de member-detailpagina: log-historie en een simpele
 * progressielijn per oefening (spec-trainingsprotocol.md PR 5). Query-time
 * aggregatie, geen materialized views nodig op dit volume.
 */
export async function HistoryTab({ profileId, selectedExerciseId }: Props) {
  const exercises = await listLoggedExercisesForMember(profileId);

  if (exercises.length === 0) {
    return (
      // COPY: confirm met Marlon
      <p className="text-text-muted text-sm">
        Nog geen afgeronde workouts gelogd door dit lid.
      </p>
    );
  }

  const activeExerciseId =
    (selectedExerciseId &&
      exercises.some((e) => e.exerciseId === selectedExerciseId) &&
      selectedExerciseId) ||
    exercises[0].exerciseId;

  const sessions = await loadExerciseHistory(profileId, activeExerciseId);

  const chartPoints = sessions.map((s) => ({
    label: formatShortDate(new Date(s.startedAt)),
    value: s.topWeightKg,
  }));

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        {exercises.map((ex) => (
          <Link
            key={ex.exerciseId}
            href={`?tab=historie&exercise=${ex.exerciseId}`}
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
        <p className="text-text-muted text-sm">
          Nog geen historie voor deze oefening.
        </p>
      ) : (
        <>
          <section className="mb-10 bg-bg-elevated p-6 border border-[color:var(--ink-500)]">
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow block mb-4">
              Topgewicht per sessie
            </span>
            <ProgressionBarChart points={chartPoints} unit="kg" />
          </section>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ink-500)]/60 text-left">
                  {/* COPY: confirm met Marlon (kolomkoppen) */}
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Datum</th>
                  <th scope="col" className="py-2 pr-4 tmc-eyebrow font-normal">Sets</th>
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
                      </td>
                      <td className="py-3 pr-4 text-text-muted">
                        {s.sets
                          .map((set) => `${set.weightKg} kg × ${set.reps}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
