import { Button } from "@/components/ui/Button";
import type { DashboardSchemaTeaser } from "../_lib/dashboard-data";

export function DashboardSchema({
  title,
  nextWorkoutLabel,
  exerciseCount,
  lastLoggedText,
}: DashboardSchemaTeaser) {
  return (
    <section className="mb-10 md:mb-14">
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Jouw schema
      </h2>
      <div className="bg-bg-elevated rounded-lg p-8">
        <p className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-[1.1] tracking-[-0.02em] mb-4">
          {title}
        </p>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          Volgende workout: <span className="text-text">{nextWorkoutLabel}</span>
          <br />
          {exerciseCount} oefeningen
          {lastLoggedText ? ` · laatst gelogd ${lastLoggedText}` : ""}
        </p>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <Button href="/app/schema">Open schema</Button>
      </div>
    </section>
  );
}
