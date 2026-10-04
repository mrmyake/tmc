/**
 * Gedeelde constanten voor proefles-aanvragen (tmc.trial_requests). Geen
 * "server-only": de toolbar en de status-chip in de admin-cockpit zijn
 * client-componenten en importeren dit ook.
 */

export const TRIAL_REQUEST_STATUSES = ["new", "contacted", "booked", "lost"] as const;
export type TrialRequestStatus = (typeof TRIAL_REQUEST_STATUSES)[number];

export function isTrialRequestStatus(value: unknown): value is TrialRequestStatus {
  return (
    typeof value === "string" &&
    (TRIAL_REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

// COPY: confirm met Marlon
export const TRIAL_REQUEST_STATUS_LABEL: Record<TrialRequestStatus, string> = {
  new: "Nieuw",
  contacted: "Benaderd",
  booked: "Geboekt",
  lost: "Afgevallen",
};

/** Zelfde grens als de route voor het berichtveld. */
export const TRIAL_REQUEST_NOTES_MAX = 2000;

// COPY: confirm met Marlon
const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: "Beginner",
  gemiddeld: "Gemiddeld",
  gevorderd: "Gevorderd",
};

/** Leesbaar label voor de ervaring; een onbekende waarde wordt letterlijk getoond. */
export function experienceLabel(value: string | null): string | null {
  if (!value) return null;
  return EXPERIENCE_LABEL[value] ?? value;
}
