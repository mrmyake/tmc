import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekNavigatorProps {
  isoWeek: number;
  isoYear: number;
  prevHref: string;
  nextHref: string;
  isCurrentWeek: boolean;
  todayHref: string;
}

export function WeekNavigator({
  isoWeek,
  isoYear,
  prevHref,
  nextHref,
  isCurrentWeek,
  todayHref,
}: WeekNavigatorProps) {
  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
      <div>
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Week {isoWeek} · {isoYear}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          {isCurrentWeek ? "Deze week." : `Week ${isoWeek}.`}
        </h1>
      </div>
      <nav
        aria-label="Weeknavigatie"
        className="flex items-center gap-2"
      >
        <Link
          href={prevHref}
          aria-label="Vorige week"
          className="group inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
          Vorige
        </Link>
        {!isCurrentWeek && (
          <Link
            href={todayHref}
            className="group inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
          >
            Vandaag
          </Link>
        )}
        <Link
          href={nextHref}
          aria-label="Volgende week"
          className="group inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
        >
          Volgende
          <ChevronRight size={14} strokeWidth={1.5} />
        </Link>
      </nav>
    </header>
  );
}
