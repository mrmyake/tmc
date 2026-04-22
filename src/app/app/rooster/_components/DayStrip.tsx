import Link from "next/link";

interface Day {
  date: Date;
  sessionsCount: number;
  isoDate: string;
}

interface DayStripProps {
  days: Day[];
  selectedIsoDate: string;
  buildHref: (isoDate: string) => string;
}

const DAY_ABBREV = ["zo", "ma", "di", "wo", "do", "vr", "za"];

export function DayStrip({ days, selectedIsoDate, buildHref }: DayStripProps) {
  return (
    <nav
      aria-label="Dagselectie"
      className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 md:mx-0 md:px-0"
    >
      {days.map((day) => {
        const isSelected = day.isoDate === selectedIsoDate;
        return (
          <Link
            key={day.isoDate}
            href={buildHref(day.isoDate)}
            scroll={false}
            aria-current={isSelected ? "date" : undefined}
            className={`flex-shrink-0 w-16 flex flex-col items-center gap-1 py-4 border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
              isSelected
                ? "border-accent bg-accent/10 text-text"
                : "border-transparent bg-bg-elevated text-text-muted hover:text-text"
            }`}
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.2em]">
              {DAY_ABBREV[day.date.getDay()]}
            </span>
            <span
              className={`font-[family-name:var(--font-playfair)] text-2xl leading-none ${
                isSelected ? "text-accent" : ""
              }`}
            >
              {day.date.getDate()}
            </span>
            <span
              aria-hidden
              className={`mt-1 w-1 h-1 rounded-full ${
                day.sessionsCount > 0
                  ? isSelected
                    ? "bg-accent"
                    : "bg-text-muted/60"
                  : "bg-transparent"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
