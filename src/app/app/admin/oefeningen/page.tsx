import { listAllExercises } from "@/lib/admin/exercises-query";
import { ExercisesClient } from "./_components/ExercisesClient";

export const metadata = {
  title: "Admin · Oefeningen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminExercisesPage() {
  const rows = await listAllExercises();

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Oefeningen.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {rows.length} {rows.length === 1 ? "oefening" : "oefeningen"} totaal
        </p>
      </header>

      <ExercisesClient rows={rows} />
    </div>
  );
}
