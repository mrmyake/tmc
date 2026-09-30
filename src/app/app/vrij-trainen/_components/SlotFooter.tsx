"use client";

import { amsterdamClock } from "@/lib/member/vrij-trainen-slots";

/**
 * Vaste voet onderaan, boven de tabbalk op mobiel: samenvatting van dag en
 * duur plus de boekknop. Zonder gekozen starttijd is de knop uitgeschakeld.
 */
export function SlotFooter({
  summary,
  selection,
  pending,
  onBook,
}: {
  summary: string;
  selection: { startMs: number; endMs: number } | null;
  pending: boolean;
  onBook: () => void;
}) {
  const label = pending
    ? // COPY: confirm met Marlon
      "Bezig met boeken"
    : selection
      ? // COPY: confirm met Marlon
        `Boek ${amsterdamClock(selection.startMs)} tot ${amsterdamClock(selection.endMs)}`
      : // COPY: confirm met Marlon
        "Kies een starttijd";

  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-30 mt-8">
      <div className="rounded-lg border border-[color:var(--ink-500)]/60 bg-bg-elevated/95 backdrop-blur-sm p-3 flex items-center gap-3">
        <span className="flex-1 text-sm text-text-muted leading-snug">{summary}</span>
        <button
          type="button"
          disabled={!selection || pending}
          onClick={onBook}
          className="rounded px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] bg-accent text-bg border border-accent transition-opacity duration-300 disabled:opacity-40 disabled:cursor-default cursor-pointer"
        >
          {label}
        </button>
      </div>
    </div>
  );
}
