interface ProgrammaEyebrowProps {
  children: React.ReactNode;
  /** Centered eyebrows (intake CTA) drop the leading tick, per mockup's
   * `.intake .eyebrow::before{display:none}`. */
  center?: boolean;
  className?: string;
}

/**
 * Eyebrow label with the mockup's small leading champagne tick
 * (`.eyebrow::before`), reused across every section on /12-weken-programma.
 * Built on the site-wide `.tmc-eyebrow`/`.tmc-eyebrow--accent` utilities
 * rather than a one-off style.
 */
export function ProgrammaEyebrow({
  children,
  center = false,
  className = "",
}: ProgrammaEyebrowProps) {
  return (
    <span
      className={`tmc-eyebrow tmc-eyebrow--accent inline-flex items-center gap-3 ${
        center ? "justify-center" : ""
      } ${className}`}
    >
      {!center && (
        <span aria-hidden className="w-6 h-px bg-accent flex-none" />
      )}
      {children}
    </span>
  );
}
