import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import { SIGNUP_STATUS_LABEL, type SignupStatus } from "@/lib/email-signups/status";

const STATUS_TONE: Record<SignupStatus, ChipTone> = {
  active: "success",
  unsubscribed: "muted",
  unconfirmed: "warning",
  bounced: "danger",
  junk: "danger",
};

export function SignupStatusChip({ status }: { status: SignupStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{SIGNUP_STATUS_LABEL[status]}</Chip>;
}

export function SourceChip({ label }: { label: string }) {
  return (
    <Chip tone="muted" dot={false}>
      {label}
    </Chip>
  );
}
