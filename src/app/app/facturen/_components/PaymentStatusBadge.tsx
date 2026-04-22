export type PaymentStatus =
  | "open"
  | "pending"
  | "authorized"
  | "paid"
  | "canceled"
  | "expired"
  | "failed"
  | "refunded";

interface PaymentStatusBadgeProps {
  status: PaymentStatus | string;
}

const STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; tone: "success" | "muted" | "danger" | "neutral" }
> = {
  paid: { label: "Betaald", tone: "success" },
  refunded: { label: "Teruggestort", tone: "muted" },
  pending: { label: "In behandeling", tone: "muted" },
  authorized: { label: "In behandeling", tone: "muted" },
  open: { label: "In behandeling", tone: "muted" },
  failed: { label: "Mislukt", tone: "danger" },
  expired: { label: "Verlopen", tone: "danger" },
  canceled: { label: "Geannuleerd", tone: "neutral" },
};

const TONE_CLASS: Record<"success" | "muted" | "danger" | "neutral", string> = {
  success: "text-[color:var(--success)]",
  muted: "text-text-muted",
  danger: "text-[color:var(--danger)]",
  neutral: "text-[color:var(--stone-600)]",
};

const TONE_DOT: Record<"success" | "muted" | "danger" | "neutral", string> = {
  success: "bg-[color:var(--success)]",
  muted: "bg-text-muted",
  danger: "bg-[color:var(--danger)]",
  neutral: "bg-[color:var(--stone-600)]",
};

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const config =
    STATUS_CONFIG[status as PaymentStatus] ?? {
      label: status,
      tone: "neutral" as const,
    };
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] ${TONE_CLASS[config.tone]}`}
      aria-label={config.label}
    >
      <span
        aria-hidden
        className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[config.tone]}`}
      />
      {config.label}
    </span>
  );
}
