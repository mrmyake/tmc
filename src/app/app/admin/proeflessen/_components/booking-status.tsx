import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { TrialBookingSource } from "@/lib/opening-trial/rules";
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

/**
 * "Gratis" (openingsperiode), "Code" (gratis via proefcode) of "Betaald"
 * (drop-in via Mollie), naar trial_bookings.source.
 */
export function BookingKindChip({ source }: { source: TrialBookingSource }) {
  // COPY: confirm met Marlon
  const label = source === "opening" ? "Gratis" : source === "code" ? "Code" : "Betaald";
  return (
    <Chip tone="muted" dot={false}>
      {label}
    </Chip>
  );
}
