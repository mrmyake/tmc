/**
 * Fijne, champagne-kleurige streepjes als "calibratie/meet"-motief. Eerste
 * gebruik op /12-weken-programma, tussen de hero en de thesis-strip (zie
 * mockup `.ticks`). Puur decoratieve hairline divider, geen interactie of
 * animatie nodig, dus geen prefers-reduced-motion zorgen hier.
 */
export function CalibrationTicks() {
  return (
    <div
      aria-hidden="true"
      className="h-[22px] w-full opacity-50"
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, var(--champagne) 0 1px, transparent 1px 15px)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        maskImage:
          "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
      }}
    />
  );
}
