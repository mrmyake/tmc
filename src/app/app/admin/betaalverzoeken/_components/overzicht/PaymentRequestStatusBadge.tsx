import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { PaymentRequestDisplayStatus } from "@/lib/admin/payment-requests-query";

// COPY: confirm met Marlon
const CONFIG: Record<PaymentRequestDisplayStatus, { label: string; tone: ChipTone }> = {
  wacht_op_betaling: { label: "Wacht op betaling", tone: "accent" },
  betaald: { label: "Betaald", tone: "success" },
  betaald_geblokkeerd: { label: "Betaald, geblokkeerd", tone: "warning" },
  verlopen: { label: "Verlopen", tone: "muted" },
  geannuleerd: { label: "Geannuleerd", tone: "muted" },
};

interface PaymentRequestStatusBadgeProps {
  status: PaymentRequestDisplayStatus;
}

/**
 * status='paid' (betaald_geblokkeerd) is geld-binnen-maar-niet-geactiveerd:
 * bewust een aparte, waarschuwende badge in plaats van gewoon "Betaald" (zie
 * discovery §1 — activate_order zet dit alleen bij duplicate_membership of
 * product_not_supported, altijd actie-vereisend voor Marlon).
 */
export function PaymentRequestStatusBadge({ status }: PaymentRequestStatusBadgeProps) {
  const cfg = CONFIG[status];
  return <Chip tone={cfg.tone}>{cfg.label}</Chip>;
}
