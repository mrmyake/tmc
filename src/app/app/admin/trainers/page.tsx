import { listTrainers } from "@/lib/admin/trainer-query";
import { TrainersClient } from "./TrainersClient";

export const metadata = {
  title: "Admin · Trainers | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminTrainersPage() {
  const trainers = await listTrainers();

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Trainers.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {trainers.length} {trainers.length === 1 ? "trainer" : "trainers"}
        </p>
      </header>

      <TrainersClient trainers={trainers} />
    </div>
  );
}
