/**
 * Gedeelde constanten voor intake-aanvragen van het 12 weken programma
 * (tmc.programma_intakes). Geen "server-only": de admin-componenten zijn
 * client-componenten en importeren dit ook.
 */

export const PROGRAMMA_INTAKE_STATUSES = ["new", "contacted", "booked", "lost"] as const;
export type ProgrammaIntakeStatus = (typeof PROGRAMMA_INTAKE_STATUSES)[number];

export function isProgrammaIntakeStatus(value: unknown): value is ProgrammaIntakeStatus {
  return (
    typeof value === "string" &&
    (PROGRAMMA_INTAKE_STATUSES as readonly string[]).includes(value)
  );
}

// COPY: confirm met Marlon
export const PROGRAMMA_INTAKE_STATUS_LABEL: Record<ProgrammaIntakeStatus, string> = {
  new: "Nieuw",
  contacted: "Benaderd",
  booked: "Geboekt",
  lost: "Afgevallen",
};

export const PROGRAMMA_INTAKE_NOTES_MAX = 2000;
