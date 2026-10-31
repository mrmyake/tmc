import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  loadDayForMember,
  loadLoggedSetsForSession,
  loadOpenSessionForDay,
  type LoggedSet,
} from "@/lib/member/workout-query";
import { loadHistoryRows } from "@/lib/training-history/query";
import { buildPreviousLogsByExercise } from "@/lib/training-history/aggregate";
import { buildGhostSets, daysBetweenAmsterdam } from "@/lib/member/workout-ghost";
import {
  WorkoutSessionClient,
  type ExerciseGhosts,
  type PreviousSessionInfo,
} from "./_components/WorkoutSessionClient";

export const metadata = {
  title: "Workout | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WorkoutPage(props: {
  params: Promise<{ dayId: string }>;
}) {
  const { dayId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const day = await loadDayForMember(dayId);
  if (!day) notFound();

  const openSession = await loadOpenSessionForDay(dayId);

  const [loggedSets, historyRows] = await Promise.all([
    openSession ? loadLoggedSetsForSession(openSession.id) : Promise.resolve<LoggedSet[]>([]),
    loadHistoryRows(supabase),
  ]);

  // "Vorige keer" matcht op exercise_id (niet program_exercise_id): de
  // referentie blijft zo staan als Marlon het schema dupliceert naar een
  // nieuwe versie. tmc.set_log_history bevat sinds 20261031120000 alleen
  // afgevinkte sets, dus een ghost value komt altijd uit een echt gedane
  // set. Zonder historie: startgewicht van de coach en reps_min.
  const previousByExercise = buildPreviousLogsByExercise(historyRows);
  const ghostsByExercise: Record<string, ExerciseGhosts> = {};
  let latestPrevious: string | null = null;
  for (const ex of day.exercises) {
    const prev = previousByExercise.get(ex.exerciseId);
    ghostsByExercise[ex.id] = {
      ghosts: buildGhostSets(
        {
          sets: ex.sets,
          repsMin: ex.repsMin,
          startWeightKg: ex.startWeightKg,
          equipment: ex.equipment,
        },
        prev?.sets ?? null,
      ),
      previous: prev
        ? {
            startedAt: prev.startedAt,
            programVersion: prev.programVersion,
            isArchivedVersion: prev.isArchivedVersion,
          }
        : null,
    };
    if (prev && (!latestPrevious || prev.startedAt > latestPrevious)) {
      latestPrevious = prev.startedAt;
    }
  }

  // Dagen geleden hier op de server berekend (force-dynamic), zodat de
  // client bij hydration dezelfde tekst toont.
  const previousSession: PreviousSessionInfo | null = latestPrevious
    ? {
        startedAt: latestPrevious,
        daysAgo: daysBetweenAmsterdam(new Date(latestPrevious), new Date()),
      }
    : null;

  return (
    <Container className="py-10 md:py-20 max-w-3xl">
      <WorkoutSessionClient
        day={day}
        initialSessionId={openSession?.id ?? null}
        initialLoggedSets={loggedSets}
        ghostsByExercise={ghostsByExercise}
        previousSession={previousSession}
      />
    </Container>
  );
}
