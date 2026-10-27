import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { TRAINER_HOME } from "@/lib/auth/safe-next";
import { resolveTrainerScope } from "@/lib/trainer/trainer-scope";
import {
  loadActiveProgramForProfile,
  loadTrainerClientProfile,
  trainerHasClient,
} from "@/lib/trainer/klant-query";
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
import { formatShortDate } from "@/lib/format-date";
import { DayScheduleCard } from "@/app/app/schema/_components/DayScheduleCard";

export const metadata = {
  title: "Klant | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function isHistoryView(v: string | undefined): v is HistoryView {
  return v === "oefening" || v === "workout";
}

/**
 * PT-agenda C4: smalle read-only klantweergave voor trainers, het
 * link-doel van de klantnaam in de agenda. Vergrendelde
 * zichtbaarheidsregel: naam + contact + trainingsschema + trainingshistorie
 * van een eigen klant, niet meer (verruimd t.o.v. de oorspronkelijke C4,
 * zie spec-trainingsprotocol.md). Ledenbeheer (boekingen, facturen,
 * health, notities, mutaties) blijft op /app/admin/leden en is hier
 * bewust afwezig. Een trainer komt er alleen voor eigen klanten in
 * (minstens een PT-boeking op een eigen sessie); een admin mag elk
 * profiel zien, maar de agenda linkt admins naar het ledenbeheer, niet
 * hierheen. fix/trainer-pt-scope: een trainer zonder PT gaat naar de
 * trainer-home, ook via een directe URL.
 */
export default async function TrainerKlantPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; exercise?: string }>;
}) {
  const scope = await resolveTrainerScope();
  if (!scope.ok) redirect("/app");
  if (!scope.isPtTrainer) redirect(TRAINER_HOME);

  const { id } = await props.params;
  const { view: viewParam, exercise: exerciseParam } = await props.searchParams;
  const view: HistoryView = isHistoryView(viewParam) ? viewParam : "oefening";

  if (!scope.isAdmin) {
    if (!scope.ownTrainerId) redirect("/app");
    if (!(await trainerHasClient(scope.ownTrainerId, id))) {
      redirect("/app/trainer/agenda");
    }
  }

  const admin = createAdminClient();
  const [profile, program, historyRows, historySessions] = await Promise.all([
    loadTrainerClientProfile(id),
    loadActiveProgramForProfile(id),
    loadHistoryRows(admin, id),
    loadCompletedSessions(admin, id),
  ]);
  if (!profile) redirect("/app/trainer/agenda");

  const hasAnyHistory = historySessions.length > 0;
  const historyOptions = buildExerciseOptions(historyRows);
  const activeExerciseId =
    (exerciseParam &&
      historyOptions.some((o) => o.exerciseId === exerciseParam) &&
      exerciseParam) ||
    historyOptions[0]?.exerciseId;

  function hrefForView(v: HistoryView): string {
    const params = new URLSearchParams({ view: v });
    if (v === "oefening" && activeExerciseId) params.set("exercise", activeExerciseId);
    return `/app/trainer/klant/${id}?${params.toString()}`;
  }
  function hrefForExercise(exerciseId: string): string {
    return `/app/trainer/klant/${id}?view=oefening&exercise=${exerciseId}`;
  }

  return (
    <Container className="py-10 md:py-14 max-w-3xl">
      <Link
        href="/app/trainer/agenda"
        className="inline-flex items-center text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors mb-8"
      >
        {/* COPY: confirm met Marlon */}
        &larr; Terug naar de agenda
      </Link>

      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          {/* COPY: confirm met Marlon */}
          Klant
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.02] tracking-[-0.02em] mb-4">
          {profile.firstName} {profile.lastName}
        </h1>
        <p className="text-text-muted text-sm">
          {[profile.email, profile.phone].filter(Boolean).join(" · ")}
        </p>
      </header>

      <section>
        <span className="tmc-eyebrow block mb-6">
          {/* COPY: confirm met Marlon */}
          Trainingsschema
        </span>

        {!program ? (
          <div className="py-12 text-center border-t border-[color:var(--ink-500)]/60">
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-sm">
              Deze klant heeft nog geen actief trainingsschema.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {(program.title || program.notes) && (
              <div>
                {program.title && (
                  <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-2">
                    {program.title}
                  </h2>
                )}
                {program.notes && (
                  <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
                    {program.notes}
                  </p>
                )}
              </div>
            )}
            {program.days.map((day) => (
              <DayScheduleCard key={day.id} day={day} showWorkoutLink={false} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-16">
        <span className="tmc-eyebrow block mb-2">
          {/* COPY: confirm met Marlon */}
          Historie
        </span>

        {!hasAnyHistory ? (
          // COPY: confirm met Marlon
          <p className="text-text-muted text-sm mt-4">
            Deze klant heeft nog geen afgeronde workout gelogd.
          </p>
        ) : (
          <>
            {/* COPY: confirm met Marlon */}
            <p className="text-text-muted text-sm mb-6">
              Laatste workout {formatShortDate(new Date(historySessions[0].startedAt))} ·{" "}
              {historySessions.length}{" "}
              {historySessions.length === 1 ? "afgeronde workout" : "afgeronde workouts"} sinds{" "}
              {formatShortDate(
                new Date(historySessions[historySessions.length - 1].startedAt),
              )}
            </p>
            <ViewSwitch active={view} hrefFor={hrefForView} />
            {view === "oefening" ? (
              activeExerciseId ? (
                <ExerciseHistory
                  options={historyOptions}
                  activeExerciseId={activeExerciseId}
                  result={buildExerciseHistory(historyRows, activeExerciseId)}
                  hrefFor={hrefForExercise}
                />
              ) : (
                // COPY: confirm met Marlon
                <p className="text-text-muted text-sm">
                  Nog geen oefening gelogd in een afgeronde workout.
                </p>
              )
            ) : (
              <WorkoutHistory sessions={buildWorkoutSessions(historySessions, historyRows)} />
            )}
          </>
        )}
      </section>
    </Container>
  );
}
