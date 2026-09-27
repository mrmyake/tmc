/**
 * Kiosk-sessie en apparaatkoppeling (spec: fase-2-checkin-model.md, check-in
 * PR 2). Geen server-only imports: de client-componenten van het slotscherm
 * lezen hier ook uit.
 */

/** Lengte van de persoonlijke staf-PIN. Zelfde regel als set_staff_pin in de database (^[0-9]{4}$). */
export const KIOSK_PIN_LENGTH = 4;

export const KIOSK_DEVICE_COOKIE = "tmc_kiosk_device";
export const KIOSK_SESSION_COOKIE = "tmc_kiosk_session";

/** Sessie vervalt na tien minuten zonder door de gebruiker gestarte actie. */
export const KIOSK_IDLE_MS = 10 * 60_000;
/** Absolute bovengrens van een sessie, ongeacht activiteit. */
export const KIOSK_ABSOLUTE_MS = 12 * 60 * 60_000;
/** Apparaat-cookie: browsermaximum van 400 dagen. */
export const KIOSK_DEVICE_MAX_AGE_S = 400 * 24 * 60 * 60;
/** last_seen_at hooguit eens per vijf minuten bijwerken. */
export const KIOSK_DEVICE_TOUCH_MS = 5 * 60_000;
/** Client: achtergrondcontrole van de sessie (verlengt NIET). */
export const KIOSK_WATCH_MS = 60_000;

export const KIOSK_SECRET_ENV = "KIOSK_SESSION_SECRET";
