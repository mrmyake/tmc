import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { MemberStatus } from "@/lib/admin/members-query";

const CONFIG: Record<MemberStatus, { label: string; tone: ChipTone }> = {
  active: { label: "Actief", tone: "success" },
  paused: { label: "Gepauzeerd", tone: "muted" },
  cancellation_requested: { label: "Opzegverzoek", tone: "warning" },
  cancelled: { label: "Opgezegd", tone: "muted" },
  expired: { label: "Verlopen", tone: "muted" },
  payment_failed: { label: "Betaling gefaald", tone: "danger" },
  pending: { label: "In afwachting", tone: "muted" },
  none: { label: "Geen abbo", tone: "muted" },
};

interface MembershipStatusBadgeProps {
  status: MemberStatus;
}

export function MembershipStatusBadge({ status }: MembershipStatusBadgeProps) {
  const cfg = CONFIG[status];
  return <Chip tone={cfg.tone}>{cfg.label}</Chip>;
}
