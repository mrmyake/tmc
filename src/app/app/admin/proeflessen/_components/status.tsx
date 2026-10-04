import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import {
  TRIAL_REQUEST_STATUS_LABEL,
  type TrialRequestStatus,
} from "@/lib/trial-requests/status";

const STATUS_TONE: Record<TrialRequestStatus, ChipTone> = {
  new: "accent",
  contacted: "warning",
  booked: "success",
  lost: "muted",
};

export function StatusChip({ status }: { status: TrialRequestStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{TRIAL_REQUEST_STATUS_LABEL[status]}</Chip>;
}
