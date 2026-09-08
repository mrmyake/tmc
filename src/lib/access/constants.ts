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

/**
 * Drempel voor het opschuiven van het rollende venster. De sync belt Akiles
 * pas als de opgeslagen einddatum minder dan dit aantal dagen vooruit ligt.
 * Met een venster van 7 dagen en een nachtelijke cron: na een verversing
 * staat er 7 dagen; de nachten erna 6, 5 en 4 (geen call), bij 3 wordt
 * ververst. Elk lid houdt dus na elke run minstens 3 dagen speling, genoeg
 * om twee gemiste nachten te overleven, en het aantal Akiles-calls voor
 * het venster daalt tot ongeveer een op de vier nachten per lid.
 */
export const ROLLING_REFRESH_THRESHOLD_DAYS = 4;

/**
 * Tijdsbudget van een volledige sync-run in milliseconden. Vercel Fluid
 * Compute geeft een route standaard 300 s; we stoppen ruim daarvoor tussen
 * twee profielen in, rapporteren de rest en laten die aan de volgende run.
 */
export const SYNC_TIME_BUDGET_MS = 240_000;

/** Vaste id van de single-row tmc.access_config (geseed in de migratie). */
export const ACCESS_CONFIG_ID = "a0000000-0000-4000-8000-000000000001";

/** Vaste id van de single-row tmc.akiles_oauth_token (geseed leeg in de migratie). */
export const AKILES_TOKEN_ID = "a0000000-0000-4000-8000-000000000002";

/**
 * OAuth 2.0 authorization_code bij Akiles (auth.akiles.app). Er is geen
 * client_credentials-flow en geen kleinere scope dan full_read_write; de
 * scope offline levert het refresh token dat de sync nodig heeft.
 */
export const AKILES_OAUTH_AUTHORIZE_URL = "https://auth.akiles.app/oauth2/auth";
export const AKILES_OAUTH_TOKEN_URL = "https://auth.akiles.app/oauth2/token";
export const AKILES_OAUTH_SCOPE = "full_read_write offline";
/**
 * Een OAuth-applicatie voor alle omgevingen, dus een vaste productie-URL.
 * Moet exact zo geregistreerd staan in het Akiles Developer Center; de
 * eenmalige autorisatie kan daardoor alleen op productie worden afgerond.
 */
export const AKILES_OAUTH_REDIRECT_URI =
  "https://www.themovementclub.nl/api/akiles/oauth/callback";

/** Access token geldt als "nog goed" zolang er meer dan dit resteert. */
export const ACCESS_TOKEN_MIN_REMAINING_MS = 10 * 60_000;
/** Lease op de refresh-claim; een gecrashte verversing wordt hierna overgenomen. */
export const REFRESH_CLAIM_LEASE_MS = 30_000;

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
