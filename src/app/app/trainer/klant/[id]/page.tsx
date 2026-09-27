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
import { DayScheduleCard } from "@/app/app/schema/_components/DayScheduleCard";

export const metadata = {
  title: "Klant | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * PT-agenda C4: smalle read-only klantweergave voor trainers, het
 * link-doel van de klantnaam in de agenda. Vergrendelde
 * zichtbaarheidsregel: naam + contact + trainingsschema, niet meer.
 * Ledenbeheer (boekingen, facturen, health, notities, mutaties) blijft
 * op /app/admin/leden en is hier bewust afwezig. Een trainer komt er
 * alleen voor eigen klanten in (minstens een PT-boeking op een eigen
 * sessie); een admin mag elk profiel zien, maar de agenda linkt admins
 * naar het ledenbeheer, niet hierheen. fix/trainer-pt-scope: een trainer
 * zonder PT gaat naar de trainer-home, ook via een directe URL.
 */
export default async function TrainerKlantPage(props: {
  params: Promise<{ id: string }>;
}) {
  const scope = await resolveTrainerScope();
  if (!scope.ok) redirect("/app");
  if (!scope.isPtTrainer) redirect(TRAINER_HOME);

  const { id } = await props.params;

  if (!scope.isAdmin) {
    if (!scope.ownTrainerId) redirect("/app");
    if (!(await trainerHasClient(scope.ownTrainerId, id))) {
      redirect("/app/trainer/agenda");
    }
  }

  const [profile, program] = await Promise.all([
    loadTrainerClientProfile(id),
    loadActiveProgramForProfile(id),
  ]);
  if (!profile) redirect("/app/trainer/agenda");

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
    </Container>
  );
}
