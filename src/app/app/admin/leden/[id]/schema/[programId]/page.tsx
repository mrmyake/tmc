import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadProgramDetail } from "@/lib/admin/training-programs-query";
import { listAllExercises } from "@/lib/admin/exercises-query";
import { ProgramBuilder } from "./_components/ProgramBuilder";

export const metadata = {
  title: "Admin · Trainingsschema | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProgramBuilderPage(props: {
  params: Promise<{ id: string; programId: string }>;
}) {
  const { id, programId } = await props.params;

  const [program, exercises] = await Promise.all([
    loadProgramDetail(programId),
    listAllExercises(),
  ]);

  if (!program || program.profileId !== id) notFound();

  const exerciseOptions = exercises
    .filter((e) => e.isActive)
    .map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="px-6 md:px-10 lg:px-12 pt-8 pb-14">
      <Link
        href={`/app/admin/leden/${id}?tab=schema`}
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors mb-6"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        {/* COPY: confirm met Marlon */}
        Terug naar {program.memberName || "lid"}
      </Link>

      <ProgramBuilder program={program} exerciseOptions={exerciseOptions} />
    </div>
  );
}
