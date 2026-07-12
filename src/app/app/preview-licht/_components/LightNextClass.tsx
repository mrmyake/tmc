import Link from "next/link";
import { amsterdamParts, formatTime, MONTH_SHORT_NL } from "@/lib/format-date";
import type { DashboardNextSession } from "../../_lib/dashboard-data";

interface LightNextClassProps {
  session: DashboardNextSession | null;
}

export function LightNextClass({ session }: LightNextClassProps) {
  return (
    <section>
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(14,12,11,0.40)] mb-4">
        Eerstvolgende
      </h2>

      {!session ? (
        <div className="bg-white border border-[rgba(14,12,11,0.10)] rounded-[14px] p-6 md:p-8">
          <h3 className="font-[family-name:var(--font-playfair)] font-medium text-2xl text-[#0E0C0B] leading-[1.15] mb-2">
            {/* COPY: akkoord Marlon 2026-07-12 */}
            Nog geen les gepland
          </h3>
          <p className="text-[rgba(14,12,11,0.60)] text-sm leading-relaxed mb-5 max-w-md">
            {/* COPY: akkoord Marlon 2026-07-12 */}
            Je hebt nog niks staan. Plan je volgende sessie in het rooster.
          </p>
          {/* COPY: akkoord Marlon 2026-07-12 */}
          <Link
            href="/app/rooster"
            className="inline-flex items-center justify-center rounded-[10px] bg-[#0E0C0B] text-[#F4EFE6] px-5 py-3 text-sm font-medium hover:bg-[#1a1714] transition-colors duration-300"
          >
            Naar het rooster
          </Link>
        </div>
      ) : (
        <Link
          href="/app/boekingen"
          className="flex items-center gap-4 bg-white border border-[rgba(14,12,11,0.10)] rounded-[14px] p-4 hover:border-[#B9986A]/60 transition-colors duration-300"
        >
          <div className="shrink-0 w-[52px] h-[52px] rounded-xl bg-[#EAE2D4] flex flex-col items-center justify-center">
            <span className="font-[family-name:var(--font-playfair)] font-semibold text-[19px] text-[#0E0C0B] leading-none">
              {amsterdamParts(session.startAt).day}
            </span>
            <span className="text-[10px] uppercase tracking-[0.08em] text-[rgba(14,12,11,0.60)] mt-0.5">
              {MONTH_SHORT_NL[amsterdamParts(session.startAt).month - 1]}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[#0E0C0B] font-semibold text-[15px] truncate">
              {session.className}
            </p>
            {/* COPY: akkoord Marlon 2026-07-12 */}
            <p className="text-[rgba(14,12,11,0.60)] text-[12.5px] mt-0.5">
              {formatTime(session.startAt)} - {formatTime(session.endAt)} · met{" "}
              {session.trainerName} · Studio
            </p>
          </div>
          <span aria-hidden className="text-[rgba(14,12,11,0.40)] text-lg">
            ›
          </span>
        </Link>
      )}
    </section>
  );
}
