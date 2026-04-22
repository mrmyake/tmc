import { AlertTriangle } from "lucide-react";

/**
 * Read-only "let op, blessure" chip for the trainer attendance view.
 * Intentionally has no click-action and no detail surface — trainers
 * without admin rights only see the flag, not the intake text.
 */
// COPY: confirm with Marlon — tekst, en of specifieke trainers ooit
// toegang mogen krijgen tot de volledige injury-tekst (has_health_access).
export function InjuryFlag() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--warning)] border border-[color:var(--warning)]/40"
      aria-label="Dit lid heeft een blessure in het intake-formulier"
    >
      <AlertTriangle size={11} strokeWidth={1.8} aria-hidden />
      Blessure
    </span>
  );
}
