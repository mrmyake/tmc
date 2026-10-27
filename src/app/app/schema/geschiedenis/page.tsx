import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { loadHistoryRows, loadCompletedSessions } from "@/lib/training-history/query";
import {
  buildExerciseHistory,
  buildExerciseOptions,
  buildWorkoutSessions,
} from "@/lib/training-history/aggregate";
import { ExerciseHistory } from "@/components/training-history/ExerciseHistory";
import { WorkoutHistory } from "@/components/training-history/WorkoutHistory";
import { ViewSwitch, type HistoryView } from "@/components/training-history/ViewSwitch";

export const metadata = {
  title: "Voortgang | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function isHistoryView(v: string | undefined): v is HistoryView {
  return v === "oefening" || v === "workout";
}

export default async function GeschiedenisPage(props: {
  searchParams: Promise<{ view?: string; exercise?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { view: viewParam, exercise: exerciseParam } = await props.searchParams;
  const view: HistoryView = isHistoryView(viewParam) ? viewParam : "oefening";

  const [rows, sessions] = await Promise.all([
    loadHistoryRows(supabase),
    loadCompletedSessions(supabase),
  ]);

  const options = buildExerciseOptions(rows);
  // Een afgeronde sessie zonder gelogde sets telt mee: zie discovery FASE A
  // (afronden zonder loggen komt in productie voor). Alleen als er
  // helemaal niets afgerond is, tonen we de lege staat voor de hele pagina.
  const hasAnyHistory = sessions.length > 0;

  const activeExerciseId =
    (exerciseParam && options.some((o) => o.exerciseId === exerciseParam) && exerciseParam) ||
    options[0]?.exerciseId;

  function hrefForView(v: HistoryView): string {
    const params = new URLSearchParams({ view: v });
    if (v === "oefening" && activeExerciseId) params.set("exercise", activeExerciseId);
    return `/app/schema/geschiedenis?${params.toString()}`;
  }
  function hrefForExercise(exerciseId: string): string {
    return `/app/schema/geschiedenis?view=oefening&exercise=${exerciseId}`;
  }

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-12">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Voortgang
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
          {/* COPY: confirm met Marlon */}
          Jouw historie.
        </h1>
      </header>

      {!hasAnyHistory ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm">
          Nog geen afgeronde workouts gelogd. Rond een workout af om hier je
          voortgang te zien.
        </p>
      ) : (
        <>
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
        </>
      )}
    </Container>
  );
}
