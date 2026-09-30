"use client";

import { amsterdamClock } from "@/lib/member/vrij-trainen-slots";

/**
 * Boekknop met samenvatting. "bar" is de vaste voet onderaan (boven de
 * tabbalk op mobiel en tablet), "panel" de "Jouw tijd"-blok in het sticky
 * zijpaneel op desktop. Zonder gekozen starttijd is de knop uitgeschakeld.
 */
export function SlotFooter({
  summary,
  selection,
  pending,
  onBook,
  layout = "bar",
}: {
  summary: string;
  selection: { startMs: number; endMs: number } | null;
  pending: boolean;
  onBook: () => void;
  layout?: "bar" | "panel";
}) {
  const label = pending
    ? // COPY: confirm met Marlon
      "Bezig met boeken"
    : selection
      ? // COPY: confirm met Marlon
        `Boek ${amsterdamClock(selection.startMs)} tot ${amsterdamClock(selection.endMs)}`
      : // COPY: confirm met Marlon
        "Kies een starttijd";

  const button = (
    <button
      type="button"
      disabled={!selection || pending}
      onClick={onBook}
      className="min-h-11 w-full rounded px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] bg-accent text-bg border border-accent transition-opacity duration-300 disabled:opacity-40 disabled:cursor-default cursor-pointer"
    >
      {label}
    </button>
  );

  if (layout === "panel") {
    return (
      <div>
        <span className="tmc-eyebrow block mb-3">
          {/* COPY: confirm met Marlon */}
          Jouw tijd
        </span>
        <p className="mb-4 font-[family-name:var(--font-playfair)] text-2xl leading-tight text-text">
          {selection
            ? `${amsterdamClock(selection.startMs)} tot ${amsterdamClock(selection.endMs)}`
            : // COPY: confirm met Marlon
              "Nog niet gekozen"}
        </p>
        {button}
      </div>
    );
  }

  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-30 mt-8">
      <div className="rounded-lg border border-[color:var(--ink-500)]/60 bg-bg-elevated/95 backdrop-blur-sm p-3 flex flex-col gap-3">
        <span className="text-sm text-text-muted leading-snug">{summary}</span>
        {button}
      </div>
    </div>
  );
}
