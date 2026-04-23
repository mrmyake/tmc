interface PageSkeletonProps {
  /** Eyebrow pill above the title. */
  eyebrow?: string;
  /** Big Playfair title text. Optional — omit for routes without one. */
  title?: string;
  /** Number of block skeletons to render under the header. Default 4. */
  rows?: number;
  /**
   * Row height preset. `list` renders narrow row bars (for tables/lists);
   * `card` renders taller card-shaped bars (for grid/dashboard layouts).
   */
  variant?: "list" | "card";
}

/**
 * Shared page-level loading skeleton. Keeps the visible chrome (eyebrow +
 * title) stable while the content below shimmers. Kept deliberately
 * primitive — each route can drop this in as a one-liner loading.tsx and
 * only the content area pulses.
 */
export function PageSkeleton({
  eyebrow,
  title,
  rows = 4,
  variant = "list",
}: PageSkeletonProps) {
  const rowClass =
    variant === "card"
      ? "h-28 bg-bg-elevated border border-[color:var(--ink-500)]/40 animate-pulse"
      : "h-16 border-b border-[color:var(--ink-500)]/40 bg-bg-elevated/40 animate-pulse";
  const wrapperClass =
    variant === "card"
      ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-5"
      : "flex flex-col gap-0 border-t border-[color:var(--ink-500)]/60";

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      {(eyebrow || title) && (
        <header className="mb-12">
          {eyebrow && (
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
              {eyebrow}
            </span>
          )}
          {title && (
            <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
              {title}
            </h1>
          )}
        </header>
      )}

      <div
        aria-hidden
        className="h-14 bg-bg-elevated border border-[color:var(--ink-500)]/60 mb-8 animate-pulse"
      />

      <div className={wrapperClass} aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={rowClass} />
        ))}
      </div>
    </div>
  );
}
