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
import type { PreviousExerciseLog } from "@/lib/training-history/types";
import { WorkoutSessionClient } from "./_components/WorkoutSessionClient";

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

  // Weergave 1 matcht op exercise_id (niet program_exercise_id): de
  // referentie blijft zo staan als Marlon het schema dupliceert naar een
  // nieuwe versie, zie training-history/aggregate.ts.
  const previousByExercise = buildPreviousLogsByExercise(historyRows);
  const previousLogs: Record<string, PreviousExerciseLog> = {};
  for (const ex of day.exercises) {
    const prev = previousByExercise.get(ex.exerciseId);
    if (prev) previousLogs[ex.id] = prev;
  }

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <WorkoutSessionClient
        day={day}
        initialSessionId={openSession?.id ?? null}
        initialLoggedSets={loggedSets}
        previousLogs={previousLogs}
      />
    </Container>
  );
}
