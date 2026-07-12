import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { amsterdamParts, formatTime, MONTH_SHORT_NL } from "@/lib/format-date";

interface DashboardNextClassProps {
  session: {
    startAt: Date;
    endAt: Date;
    className: string;
    trainerName: string;
  } | null;
}

export function DashboardNextClass({ session }: DashboardNextClassProps) {
  return (
    <section className="mb-14">
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Eerstvolgende
      </h2>

      {!session ? (
        <div className="bg-bg-elevated p-8 md:p-10">
          <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.1] tracking-[-0.02em] mb-3">
            {/* COPY: akkoord Marlon 2026-07-12 */}
            Nog geen les gepland
          </h3>
          <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-md">
            {/* COPY: akkoord Marlon 2026-07-12 */}
            Je hebt nog niks staan. Plan je volgende sessie in het rooster.
          </p>
          {/* COPY: akkoord Marlon 2026-07-12 */}
          <Button href="/app/rooster">Naar het rooster</Button>
        </div>
      ) : (
        <Link
          href="/app/boekingen"
          className="flex items-center gap-5 bg-bg-elevated p-6 md:p-7 hover:bg-bg-elevated/70 transition-colors duration-300"
        >
          <div className="shrink-0 w-14 h-14 bg-bg flex flex-col items-center justify-center">
            <span className="font-[family-name:var(--font-playfair)] text-lg text-text leading-none">
              {amsterdamParts(session.startAt).day}
            </span>
            <span className="text-[10px] uppercase tracking-[0.1em] text-text-muted mt-1">
              {MONTH_SHORT_NL[amsterdamParts(session.startAt).month - 1]}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-text font-medium text-base truncate">
              {session.className}
            </p>
            {/* COPY: akkoord Marlon 2026-07-12 */}
            <p className="text-text-muted text-sm mt-1">
              {formatTime(session.startAt)} tot {formatTime(session.endAt)} ·
              met {session.trainerName} · Studio
            </p>
          </div>
        </Link>
      )}
    </section>
  );
}
