/**
 * Gedeelde constanten voor de status van proefboekingen
 * (tmc.trial_bookings.status). Geen "server-only": de chips in de
 * admin-cockpit en de inwisselingentabel van proefcodes zijn
 * client-componenten en importeren dit ook.
 *
 * Let op: no_show staat in de check-constraint maar wordt nergens gezet
 * (geen cron, geen UI); het label blijft voor de volledigheid.
 */

export const TRIAL_BOOKING_STATUSES = [
  "pending",
  "paid",
  "attended",
  "no_show",
  "cancelled",
] as const;
export type TrialBookingStatus = (typeof TRIAL_BOOKING_STATUSES)[number];

export function isTrialBookingStatus(value: unknown): value is TrialBookingStatus {
  return (
    typeof value === "string" &&
    (TRIAL_BOOKING_STATUSES as readonly string[]).includes(value)
  );
}

// COPY: confirm met Marlon
export const TRIAL_BOOKING_STATUS_LABEL: Record<TrialBookingStatus, string> = {
  pending: "In behandeling",
  paid: "Bevestigd",
  attended: "Aanwezig",
  no_show: "Niet gekomen",
  cancelled: "Geannuleerd",
};

/** Label voor een status uit de database; een onbekende waarde wordt letterlijk getoond. */
export function trialBookingStatusLabel(status: string): string {
  return isTrialBookingStatus(status) ? TRIAL_BOOKING_STATUS_LABEL[status] : status;
}
