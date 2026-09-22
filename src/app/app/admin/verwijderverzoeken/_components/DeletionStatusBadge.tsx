import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";

const STATUS_CONFIG: Record<string, { label: string; tone: ChipTone }> = {
  // COPY: confirm met Marlon
  requested: { label: "Aangevraagd", tone: "warning" },
  in_progress: { label: "Loopt", tone: "accent" },
  blocked: { label: "Vastgelopen", tone: "danger" },
  completed: { label: "Afgerond", tone: "success" },
  cancelled: { label: "Ingetrokken", tone: "muted" },
};

export function DeletionStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, tone: "muted" as ChipTone };
  return <Chip tone={cfg.tone}>{cfg.label}</Chip>;
}

const STEP_STATE_CONFIG: Record<string, { label: string; tone: ChipTone }> = {
  // COPY: confirm met Marlon
  pending: { label: "wacht", tone: "muted" },
  running: { label: "loopt", tone: "accent" },
  done: { label: "klaar", tone: "success" },
  failed: { label: "mislukt", tone: "danger" },
  skipped: { label: "overgeslagen", tone: "muted" },
  blocked: { label: "vastgelopen", tone: "danger" },
};

// COPY: confirm met Marlon
const STEP_LABEL: Record<string, string> = {
  freeze: "Sluiting",
  mollie_subscription: "Mollie-abonnement",
  akiles: "Toegang (Akiles)",
  mailerlite: "MailerLite",
  push: "Push-tokens",
  profile: "Profiel",
  confirmation_mail: "Afsluitmail",
  mollie_customer: "Mollie-klant",
};

export function stepLabel(name: string): string {
  return STEP_LABEL[name] ?? name;
}

export function StepStateChip({ state }: { state: string | null }) {
  if (!state) return <Chip tone="muted">-</Chip>;
  const cfg = STEP_STATE_CONFIG[state] ?? { label: state, tone: "muted" as ChipTone };
  return <Chip tone={cfg.tone} dot={false}>{cfg.label}</Chip>;
}
