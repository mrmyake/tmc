import Link from "next/link";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  parseIsoDateToAmsterdamMidnight,
} from "@/lib/format-date";
import type { StripDay } from "@/lib/member/vrij-trainen-query";

/**
 * Dagen vanaf vandaag (zeven per rij). Een dag zonder vrij-trainen-sessie is
 * uitgeschakeld, de gekozen dag krijgt een champagne rand en een dag met een
 * eigen boeking een champagne stip. Navigatie via ?weergave=vrij&dag=, zodat de server de
 * beschikbaarheid van die dag laadt.
 */
export function SlotDayStrip({
  days,
  selectedDate,
  hrefFor = (isoDate) => `/app/rooster?weergave=vrij&dag=${isoDate}`,
}: {
  days: StripDay[];
  selectedDate: string;
  /** Doel per dag; standaard het ledenrooster. De codeflow geeft zijn eigen pad. */
  hrefFor?: (isoDate: string) => string;
}) {
  return (
    <nav
      // COPY: confirm met Marlon
      aria-label="Kies een dag"
      className="grid grid-cols-7 gap-1.5"
    >
      {days.map((d) => {
        const parts = amsterdamParts(parseIsoDateToAmsterdamMidnight(d.isoDate)!);
        const selected = d.isoDate === selectedDate;
        const content = (
          <>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-muted">
              {DAY_SHORT_NL[parts.weekday]}
            </span>
            <span className="font-[family-name:var(--font-playfair)] text-xl leading-none">
              {parts.day}
            </span>
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${d.booked ? "bg-accent" : "bg-transparent"}`}
            />
          </>
        );
        const base =
          "flex flex-col items-center gap-1.5 rounded-lg border py-2.5 transition-colors duration-300";
        if (!d.hasSession) {
          return (
            <span
              key={d.isoDate}
              aria-disabled
              className={`${base} border-transparent bg-bg-elevated/40 text-[color:var(--stone-600)] cursor-default`}
            >
              {content}
            </span>
          );
        }
        return (
          <Link
            key={d.isoDate}
            href={hrefFor(d.isoDate)}
            scroll={false}
            aria-current={selected ? "date" : undefined}
            // COPY: confirm met Marlon
            aria-label={`${DAY_SHORT_NL[parts.weekday]} ${parts.day}${d.booked ? ", geboekt" : ""}`}
            className={`${base} bg-bg-elevated text-text ${
              selected
                ? "border-accent"
                : "border-[color:var(--ink-500)]/60 hover:border-text-muted"
            }`}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
