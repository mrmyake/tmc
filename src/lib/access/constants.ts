/**
 * Akiles toegangskoppeling: gedeelde constanten (spec-akiles-access.md).
 *
 * Geen imports: dit bestand wordt ook door de node:test-suite in
 * scripts/access/ ingelezen.
 */

/**
 * Het venster van verlengde toegang. Dit is de ENIGE bron voor 06:00 tot
 * 23:00; tmc.opening_hours bevat uitsluitend de reguliere openingstijden en
 * de schedule-generatie (schedule.ts) leest dit venster hiervandaan. De copy
 * op het dashboard ("06:00 tot 23:00") en het catalogus-kolomcommentaar
 * beschrijven hetzelfde venster; wijzigt het, dan hier eerst.
 */
export const EXTENDED_ACCESS_WINDOW = {
  opensAt: "06:00",
  closesAt: "23:00",
} as const;

/**
 * Rollend toegangsvenster in dagen. Zonder harde einddatum krijgt een lid in
 * Akiles ends_at = nu + dit venster, elke run opnieuw opgeschoven. Valt de
 * cron uit, dan sluit de deur vanzelf na dit aantal dagen (fail closed).
 */
export const ROLLING_ACCESS_WINDOW_DAYS = 7;

/** Vaste id van de single-row tmc.access_config (geseed in de migratie). */
export const ACCESS_CONFIG_ID = "a0000000-0000-4000-8000-000000000001";

/** Lengte van de door Akiles gegenereerde PIN. Nooit zelf een waarde aanleveren. */
export const ACCESS_PIN_LENGTH = 6;

export type AccessGroup = "standard" | "extended" | "staff";

/** Namen zoals ze in het Akiles-adminpaneel verschijnen. Puur voor herkenning. */
export const AKILES_OBJECT_NAMES = {
  scheduleStandard: "TMC standaard (openingstijden)",
  scheduleExtended: "TMC verlengde toegang (06:00-23:00)",
  scheduleClosed: "TMC gesloten (noodrem)",
  scheduleStaff: "TMC staf (24 uur)",
  groupStandard: "TMC leden standaard",
  groupExtended: "TMC leden verlengde toegang",
  groupStaff: "TMC staf",
} as const;
