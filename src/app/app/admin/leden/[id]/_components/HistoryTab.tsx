import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompletedSessions, loadHistoryRows } from "@/lib/training-history/query";
import {
  buildExerciseHistory,
  buildExerciseOptions,
  buildWorkoutSessions,
} from "@/lib/training-history/aggregate";
import { ExerciseHistory } from "@/components/training-history/ExerciseHistory";
import { WorkoutHistory } from "@/components/training-history/WorkoutHistory";
import { ViewSwitch, type HistoryView } from "@/components/training-history/ViewSwitch";

interface Props {
  profileId: string;
  view: HistoryView;
  selectedExerciseId?: string;
}

/**
 * Tab "Historie" op de member-detailpagina: dunne wrapper om de gedeelde
 * trainingshistorie-componenten (src/components/training-history/), de
 * zelfde als /app/schema/geschiedenis en de trainer-klantpagina. Admin
 * leest via de service-role-client met een expliciete profileId; de
 * policies op program_days/training_programs/program_exercises/exercises
 * gelden alleen voor de RLS-scoped client, maar service_role negeert RLS
 * sowieso.
 */
export async function HistoryTab({ profileId, view, selectedExerciseId }: Props) {
  const admin = createAdminClient();
  const [rows, sessions] = await Promise.all([
    loadHistoryRows(admin, profileId),
    loadCompletedSessions(admin, profileId),
  ]);

  const hasAnyHistory = sessions.length > 0;
  if (!hasAnyHistory) {
    // COPY: confirm met Marlon
    return (
      <p className="text-text-muted text-sm">
        Nog geen afgeronde workouts gelogd door dit lid.
      </p>
    );
  }

  const options = buildExerciseOptions(rows);
  const activeExerciseId =
    (selectedExerciseId &&
      options.some((o) => o.exerciseId === selectedExerciseId) &&
      selectedExerciseId) ||
    options[0]?.exerciseId;

  function hrefForView(v: HistoryView): string {
    const params = new URLSearchParams({ tab: "historie", historyView: v });
    if (v === "oefening" && activeExerciseId) params.set("exercise", activeExerciseId);
    return `?${params.toString()}`;
  }
  function hrefForExercise(exerciseId: string): string {
    return `?tab=historie&historyView=oefening&exercise=${exerciseId}`;
  }

  return (
    <div>
      <ViewSwitch active={view} hrefFor={hrefForView} />
      {view === "oefening" ? (
        activeExerciseId ? (
          <ExerciseHistory
            options={options}
            activeExerciseId={activeExerciseId}
            result={buildExerciseHistory(rows, activeExerciseId)}
            hrefFor={hrefForExercise}
          />
        ) : (
          // COPY: confirm met Marlon
          <p className="text-text-muted text-sm">
            Nog geen oefening gelogd in een afgeronde workout.
          </p>
        )
      ) : (
        <WorkoutHistory sessions={buildWorkoutSessions(sessions, rows)} />
      )}
    </div>
  );
}
