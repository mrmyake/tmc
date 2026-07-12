import { Button } from "@/components/ui/Button";

interface DashboardSchemaProps {
  title: string;
  nextWorkoutLabel: string;
  nextWorkoutExerciseCount: number;
  lastLoggedText: string | null;
}

export function DashboardSchema({
  title,
  nextWorkoutLabel,
  nextWorkoutExerciseCount,
  lastLoggedText,
}: DashboardSchemaProps) {
  return (
    <section className="mb-14">
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Jouw schema
      </h2>
      <div className="bg-bg-elevated p-8">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-[1.1] tracking-[-0.02em] mb-4">
          {title}
        </p>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          Volgende workout: <span className="text-text">{nextWorkoutLabel}</span>
          <br />
          {nextWorkoutExerciseCount} oefeningen
          {lastLoggedText ? ` · laatst gelogd ${lastLoggedText}` : ""}
        </p>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <Button href="/app/schema">Open schema</Button>
      </div>
    </section>
  );
}
