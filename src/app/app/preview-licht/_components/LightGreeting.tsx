import Link from "next/link";
import type { ResolvedStatusLine } from "../../_lib/dashboard";

// Kleuren letterlijk uit mockup-leden-overzicht.html (:root), niet uit de
// donkere /app-tokens. `danger` is de enige uitzondering: dat is het
// merk-brede semantische foutkleur uit docs/design-system/DESIGN-SYSTEM.md
// (#C47A6E, "dusty terracotta"), geen dark-mode-surface-token.
const TONE_COLOR: Record<ResolvedStatusLine["tone"], string> = {
  default: "text-[rgba(14,12,11,0.60)]",
  warning: "text-[#B9986A]",
  danger: "text-[#C47A6E]",
};

interface LightGreetingProps {
  salutation: string;
  firstName: string;
  initials: string;
  subline: string;
  planBadge: string | null;
  statusLine: ResolvedStatusLine | null;
}

export function LightGreeting({
  salutation,
  firstName,
  initials,
  subline,
  planBadge,
  statusLine,
}: LightGreetingProps) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-playfair)] font-medium text-4xl md:text-6xl text-[#0E0C0B] leading-[1.1] tracking-[-0.01em]">
          {/* COPY: akkoord Marlon 2026-07-12 */}
          {salutation}, {firstName}
        </h1>
        {/* COPY: akkoord Marlon 2026-07-12 */}
        <p className="mt-3 text-[rgba(14,12,11,0.60)] text-base">{subline}</p>

        {planBadge && (
          <span className="inline-flex items-center gap-2 mt-6 px-3 py-1.5 rounded-full bg-[#0E0C0B] text-[#F4EFE6] text-xs font-medium tracking-[0.02em]">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[#B9986A]" />
            {planBadge}
          </span>
        )}

        {statusLine && (
          <p className={`mt-3 text-xs ${TONE_COLOR[statusLine.tone]}`}>
            {statusLine.text}{" "}
            <Link
              href="/app/abonnement"
              className="text-[#0E0C0B] underline underline-offset-4 hover:text-[#B9986A] transition-colors duration-300"
            >
              {/* COPY: akkoord Marlon 2026-07-12 */}
              Bekijk lidmaatschap
            </Link>
          </p>
        )}
      </div>

      <div
        aria-hidden
        className="shrink-0 w-9 h-9 rounded-full bg-[#0E0C0B] text-[#F4EFE6] flex items-center justify-center font-medium text-[13px]"
      >
        {initials}
      </div>
    </header>
  );
}
