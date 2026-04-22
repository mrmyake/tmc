import type { MemberStatus } from "@/lib/admin/members-query";

const CONFIG: Record<
  MemberStatus,
  { label: string; tone: "success" | "muted" | "warning" | "danger" }
> = {
  active: { label: "Actief", tone: "success" },
  paused: { label: "Gepauzeerd", tone: "muted" },
  cancellation_requested: { label: "Opzegverzoek", tone: "warning" },
  cancelled: { label: "Opgezegd", tone: "muted" },
  expired: { label: "Verlopen", tone: "muted" },
  payment_failed: { label: "Betaling gefaald", tone: "danger" },
  pending: { label: "In afwachting", tone: "muted" },
  none: { label: "Geen abbo", tone: "muted" },
};

const TONE_CLASS: Record<"success" | "muted" | "warning" | "danger", string> =
  {
    success: "text-[color:var(--success)]",
    muted: "text-text-muted",
    warning: "text-[color:var(--warning)]",
    danger: "text-[color:var(--danger)]",
  };

const DOT_CLASS: Record<"success" | "muted" | "warning" | "danger", string> = {
  success: "bg-[color:var(--success)]",
  muted: "bg-text-muted",
  warning: "bg-[color:var(--warning)]",
  danger: "bg-[color:var(--danger)]",
};

interface MembershipStatusBadgeProps {
  status: MemberStatus;
}

export function MembershipStatusBadge({ status }: MembershipStatusBadgeProps) {
  const cfg = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] ${TONE_CLASS[cfg.tone]}`}
    >
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[cfg.tone]}`} />
      {cfg.label}
    </span>
  );
}
