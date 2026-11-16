import type { ProgrammaIntakeRow } from "@/lib/admin/programma-intakes-query";
import { IntakeCard } from "./IntakeCard";

export function IntakesList({ rows }: { rows: ProgrammaIntakeRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Geen intakes
        </span>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          {/* COPY: confirm met Marlon */}
          Geen intake-aanvragen gevonden bij deze filter.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
      {rows.map((row) => (
        <IntakeCard key={row.id} row={row} />
      ))}
    </ul>
  );
}
