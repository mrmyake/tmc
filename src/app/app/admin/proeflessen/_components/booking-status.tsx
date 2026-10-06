import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import {
  TRIAL_BOOKING_STATUS_LABEL,
  type TrialBookingStatus,
} from "@/lib/trial-bookings/status";

const STATUS_TONE: Record<TrialBookingStatus, ChipTone> = {
  pending: "warning",
  paid: "accent",
  attended: "success",
  no_show: "danger",
  cancelled: "muted",
};

export function BookingStatusChip({ status }: { status: TrialBookingStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{TRIAL_BOOKING_STATUS_LABEL[status]}</Chip>;
}

/** "Code" (gratis via proefcode) of "Betaald" (drop-in via Mollie). */
export function BookingKindChip({ viaCode }: { viaCode: boolean }) {
  // COPY: confirm met Marlon
  return (
    <Chip tone="muted" dot={false}>
      {viaCode ? "Code" : "Betaald"}
    </Chip>
  );
}
