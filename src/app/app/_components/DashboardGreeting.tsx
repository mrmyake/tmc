import Link from "next/link";
import { formatDateLong } from "@/lib/format-date";
import type { StatusLineVariant } from "../_lib/dashboard";

function statusLineText(variant: StatusLineVariant): string {
  switch (variant.kind) {
    case "active_fixed":
      // COPY: akkoord Marlon 2026-07-12
      return `Actief · vaste periode tot ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`;
    case "active_rolling":
      // COPY: akkoord Marlon 2026-07-12
      return `Actief · per ${variant.cycleWeeks} weken opzegbaar`;
    case "pause_planned":
      // COPY: akkoord Marlon 2026-07-12
      return `Pauze gepland vanaf ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`;
    case "paused":
      // COPY: akkoord Marlon 2026-07-12
      return `Gepauzeerd sinds ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`;
    case "cancellation_planned":
      // COPY: akkoord Marlon 2026-07-12
      return `Je lidmaatschap loopt af op ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`;
    case "other":
      return variant.label;
  }
}

interface DashboardGreetingProps {
  salutation: string;
  firstName: string;
  initials: string;
  subline: string;
  planBadge: string | null;
  statusLine: StatusLineVariant | null;
}

export function DashboardGreeting({
  salutation,
  firstName,
  initials,
  subline,
  planBadge,
  statusLine,
}: DashboardGreetingProps) {
  return (
    <header className="mb-12 flex items-start justify-between gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.05] tracking-[-0.02em]">
          {/* COPY: akkoord Marlon 2026-07-12 */}
          {salutation}, {firstName}
        </h1>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <p className="mt-3 text-text-muted text-base">{subline}</p>

        {planBadge && (
          <span className="inline-flex items-center gap-2 mt-6 px-3 py-1.5 bg-text text-bg text-xs font-medium tracking-[0.02em]">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-accent" />
            {planBadge}
          </span>
        )}

        {statusLine && (
          <p className="mt-3 text-text-muted text-xs">
            {statusLineText(statusLine)}{" "}
            <Link
              href="/app/abonnement"
              className="text-text underline underline-offset-4 hover:text-accent transition-colors"
            >
              {/* COPY: akkoord Marlon 2026-07-12 */}
              Bekijk lidmaatschap
            </Link>
          </p>
        )}
      </div>

      <div
        aria-hidden
        className="shrink-0 w-11 h-11 rounded-full bg-accent text-bg flex items-center justify-center font-medium text-sm"
      >
        {initials}
      </div>
    </header>
  );
}
