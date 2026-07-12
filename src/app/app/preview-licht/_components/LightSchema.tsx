import Link from "next/link";
import type { DashboardSchemaTeaser } from "../../_lib/dashboard-data";

export function LightSchema({
  title,
  nextWorkoutLabel,
  exerciseCount,
  lastLoggedText,
}: DashboardSchemaTeaser) {
  return (
    <section>
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(14,12,11,0.40)] mb-4">
        Jouw schema
      </h2>
      <div className="bg-gradient-to-br from-white to-[#F4EFE6] border border-[rgba(14,12,11,0.10)] rounded-[14px] p-4">
        <p className="font-[family-name:var(--font-playfair)] font-medium text-[16px] text-[#0E0C0B] mb-2.5">
          {title}
        </p>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <p className="text-[12.5px] text-[rgba(14,12,11,0.60)] leading-[1.4]">
          Volgende workout:{" "}
          <b className="text-[#0E0C0B] font-semibold">{nextWorkoutLabel}</b>
          <br />
          {exerciseCount} oefeningen
          {lastLoggedText ? ` · laatst gelogd ${lastLoggedText}` : ""}
        </p>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <Link
          href="/app/schema"
          className="mt-3 inline-block rounded-[9px] bg-[#0E0C0B] text-[#F4EFE6] px-3.5 py-2.5 text-[12.5px] font-medium hover:bg-[#1a1714] transition-colors duration-300"
        >
          Open schema →
        </Link>
      </div>
    </section>
  );
}
