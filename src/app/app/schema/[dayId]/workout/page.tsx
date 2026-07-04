import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  loadDayForMember,
  loadLoggedSetsForSession,
  loadOpenSessionForDay,
  loadPreviousSetLogs,
  type LoggedSet,
} from "@/lib/member/workout-query";
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

  const [loggedSets, previousSetsMap] = await Promise.all([
    openSession ? loadLoggedSetsForSession(openSession.id) : Promise.resolve<LoggedSet[]>([]),
    loadPreviousSetLogs(
      day.exercises.map((e) => e.id),
      openSession?.id ?? "",
    ),
  ]);

  const previousSets: Record<string, LoggedSet[]> = {};
  for (const [exerciseId, sets] of previousSetsMap) {
    previousSets[exerciseId] = sets;
  }

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <WorkoutSessionClient
        day={day}
        initialSessionId={openSession?.id ?? null}
        initialLoggedSets={loggedSets}
        previousSets={previousSets}
      />
    </Container>
  );
}
