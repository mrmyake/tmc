import {
  TONE_DOT_CLASS,
  TONE_TEXT_CLASS,
  type ChipTone,
} from "@/lib/tone";

export interface ChipProps {
  tone?: ChipTone;
  children: React.ReactNode;
  /** Optional leading dot (default true). */
  dot?: boolean;
  /** Optional icon rendered before the label (replaces dot if present). */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Generic status/eyebrow chip primitive. Renders as an inline-flex with
 * uppercase-tracked label + optional dot or icon. Consumers layer a
 * `<Chip tone="...">` into badge components (PlanBadge,
 * MembershipStatusBadge, HoursStatusPill) so the look stays uniform.
 */
export function Chip({
  tone = "muted",
  children,
  dot = true,
  icon,
  className = "",
}: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] ${TONE_TEXT_CLASS[tone]} ${className}`}
    >
      {icon ? (
        <span aria-hidden className="inline-flex items-center">
          {icon}
        </span>
      ) : (
        dot && (
          <span
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full ${TONE_DOT_CLASS[tone]}`}
          />
        )
      )}
      {children}
    </span>
  );
}
