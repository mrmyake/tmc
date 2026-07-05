import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  listLoggedExercisesForSelf,
  loadOwnExerciseHistory,
} from "@/lib/member/training-history-query";
import { ProgressionBarChart } from "@/components/ui/ProgressionBarChart";
import { formatShortDate } from "@/lib/format-date";

export const metadata = {
  title: "Voortgang | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GeschiedenisPage(props: {
  searchParams: Promise<{ exercise?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { exercise: exerciseParam } = await props.searchParams;
  const exercises = await listLoggedExercisesForSelf();

  const activeExerciseId =
    (exerciseParam &&
      exercises.some((e) => e.exerciseId === exerciseParam) &&
      exerciseParam) ||
    exercises[0]?.exerciseId;

  const sessions = activeExerciseId
    ? await loadOwnExerciseHistory(activeExerciseId)
    : [];

  const chartPoints = sessions.map((s) => ({
    label: formatShortDate(new Date(s.startedAt)),
    value: s.topWeightKg,
  }));

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

      {exercises.length === 0 ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm">
          Nog geen afgeronde workouts gelogd. Rond een workout af om hier je
          voortgang te zien.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-8">
            {exercises.map((ex) => (
              <Link
                key={ex.exerciseId}
                href={`/app/schema/geschiedenis?exercise=${ex.exerciseId}`}
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
    </Container>
  );
}
