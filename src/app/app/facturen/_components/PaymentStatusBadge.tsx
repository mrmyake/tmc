// "refunded" bestaat hier bewust niet meer als statuswaarde: sinds Mollie
// API v2 laat een restitutie payment.status ongemoeid (blijft "paid"), dus
// dat label werd nooit getoond (spec-facturatie.md 4.8). De restitutiestand
// woont in payments.refunded_amount_cents en komt binnen als een losse
// prop, niet als status.
export type PaymentStatus =
  | "open"
  | "pending"
  | "authorized"
  | "paid"
  | "canceled"
  | "expired"
  | "failed";

interface PaymentStatusBadgeProps {
  status: PaymentStatus | string;
  /** > 0 toont "Teruggestort" naast (niet in plaats van) de statusbadge. */
  refundedAmountCents?: number;
}

const STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; tone: "success" | "muted" | "danger" | "neutral" }
> = {
  paid: { label: "Betaald", tone: "success" },
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

function Dot({
  tone,
  label,
}: {
  tone: "success" | "muted" | "danger" | "neutral";
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] ${TONE_CLASS[tone]}`}
      aria-label={label}
    >
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {label}
    </span>
  );
}

export function PaymentStatusBadge({
  status,
  refundedAmountCents,
}: PaymentStatusBadgeProps) {
  const config =
    STATUS_CONFIG[status as PaymentStatus] ?? {
      label: status,
      tone: "neutral" as const,
    };

  // Restitutie staat los van status (een paid-payment kan gerestitueerd
  // zijn en blijft "paid", zie 4.8): naast de statusbadge, niet erin op.
  const isRefunded = (refundedAmountCents ?? 0) > 0;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Dot tone={config.tone} label={config.label} />
      {isRefunded && <Dot tone="muted" label="Teruggestort" />}
    </span>
  );
}
