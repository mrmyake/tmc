/**
 * JS-contract van de lokale Capacitor-plugin rond de Akiles Mobile SDK
 * (workstream E2, spec-akiles-access.md en discovery-akiles-app-toegang.md).
 *
 * Bewust minimaal: een sessie starten met een member token, de deuren
 * opvragen en een deur openen via Bluetooth. Online-modus staat uit,
 * conform de permission rules in src/lib/access/sync-core.ts (online:
 * false); NFC card emulation is E4.
 *
 * Het token wordt in de plugin nergens opgeslagen en komt nergens in logs
 * of events. De app geeft het bij initialize() mee; de SDK zelf bewaart
 * daarna zijn eigen sessiecache op het toestel (gadgetlijst, sleutels),
 * zoals Akiles documenteert. Bewaren van het rij-id en het opnieuw
 * koppelen is E3.
 */

export interface AkilesGadgetAction {
  id: string;
  name: string;
}

export interface AkilesGadget {
  /** Akiles gadget-id (gad_...). */
  id: string;
  name: string;
  /** Acties die de member op dit gadget mag uitvoeren; "open" is normaal de eerste. */
  actions: AkilesGadgetAction[];
}

/**
 * Foutcodes van deze plugin. Elke afwijzing (Promise reject) draagt `code`
 * uit deze lijst, een `message` en optioneel `data` met de ruwe SDK-code
 * (`sdkCode`) en, bij DENIED_BY_AKILES, de reden (`reason`: MEMBER_ENDED,
 * MEMBER_NOT_STARTED, OUT_OF_SCHEDULE, ORGANIZATION_DISABLED, OTHER,
 * SESSION_NOT_GRANTED).
 */
export type AkilesErrorCode =
  /** Geen sessie op dit toestel: initialize() is nog niet (geslaagd) aangeroepen. */
  | "NO_SESSION"
  /** Het meegegeven token is ongeldig, ingetrokken, of de member bestaat niet meer. */
  | "INVALID_TOKEN"
  /** Bluetooth-permissie geweigerd (data.permanent: true als de gebruiker het definitief heeft afgewezen). */
  | "BLUETOOTH_PERMISSION_DENIED"
  /** Bluetooth staat uit op het toestel. */
  | "BLUETOOTH_OFF"
  /** Geen Akiles-device binnen Bluetooth-bereik, of de verbinding viel weg (timeout). */
  | "OUT_OF_RANGE"
  /** Akiles weigert de actie: member verlopen, buiten schedule, toestel niet vrijgegeven. Zie data.reason. */
  | "DENIED_BY_AKILES"
  /** Geannuleerd. */
  | "CANCELLED"
  /** Niet beschikbaar op dit platform (web, te oude Android-versie, geen Bluetooth-hardware). */
  | "NOT_AVAILABLE"
  /** Alles wat de SDK verder meldt; data.sdkCode bevat de ruwe code. */
  | "UNKNOWN";

export interface AkilesErrorData {
  sdkCode?: string;
  reason?: string;
  permanent?: boolean;
  description?: string;
}

/** Vorm van een afgewezen Promise uit deze plugin (Capacitor zet code, message en data op het Error-object). */
export interface AkilesError extends Error {
  code: AkilesErrorCode;
  data?: AkilesErrorData;
}

export function isAkilesError(err: unknown): err is AkilesError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    AKILES_ERROR_CODES.has((err as { code: string }).code)
  );
}

export const AKILES_ERROR_CODES: ReadonlySet<string> = new Set<AkilesErrorCode>([
  "NO_SESSION",
  "INVALID_TOKEN",
  "BLUETOOTH_PERMISSION_DENIED",
  "BLUETOOTH_OFF",
  "OUT_OF_RANGE",
  "DENIED_BY_AKILES",
  "CANCELLED",
  "NOT_AVAILABLE",
  "UNKNOWN",
]);

/** Voortgang van open(): de Bluetooth-fasen van de SDK, voor een statusregel in de UI (E3). */
export type AkilesOpenStatus =
  | "SCANNING"
  | "CONNECTING"
  | "SYNCING_DEVICE"
  | "SYNCING_SERVER"
  | "EXECUTING_ACTION";

export interface AkilesPlugin {
  /**
   * Start een sessie met een Akiles member token (uit issueMyAccessDeviceToken,
   * src/lib/actions/access-devices.ts). Bestaande sessies op het toestel
   * worden eerst verwijderd, zodat er precies een sessie per toestel is.
   * Vereist internet: de SDK valideert het token bij Akiles en cachet de
   * sessiedata daarna lokaal.
   *
   * Fouten: INVALID_TOKEN, NOT_AVAILABLE, UNKNOWN.
   */
  initialize(options: { token: string }): Promise<{ sessionId: string }>;

  /** De sessie op dit toestel, of null als initialize() nog niet is aangeroepen. */
  getSession(): Promise<{ sessionId: string | null }>;

  /**
   * Ververst de gecachte sessiedata (permissies, gadgetlijst). Vereist
   * internet; zonder internet blijft de vorige cache bruikbaar. Advies van
   * Akiles: bij elke app-open of bij het openen van het deurscherm.
   *
   * Fouten: NO_SESSION, INVALID_TOKEN (sessie ingetrokken), UNKNOWN.
   */
  refresh(): Promise<void>;

  /** Verwijdert alle sessies op dit toestel. Werkt offline. Voor uitloggen (E1, device-cleanup). */
  clearSession(): Promise<void>;

  /**
   * Deuren (gadgets) waar de member iets mee mag, uit de lokale cache.
   *
   * Fouten: NO_SESSION, INVALID_TOKEN, UNKNOWN.
   */
  getGadgets(): Promise<{ gadgets: AkilesGadget[] }>;

  /**
   * Opent een deur via Bluetooth. Zonder actionId de eerste actie van het
   * gadget. De SDK vraagt zelf de Bluetooth-permissie als die nog niet is
   * gegeven (Android: de plugin doet dat via Capacitor). Internet wordt
   * bewust niet als methode gebruikt.
   *
   * Fouten: NO_SESSION, INVALID_TOKEN, BLUETOOTH_PERMISSION_DENIED,
   * BLUETOOTH_OFF, OUT_OF_RANGE, DENIED_BY_AKILES, CANCELLED, NOT_AVAILABLE,
   * UNKNOWN.
   */
  open(options: { gadgetId: string; actionId?: string }): Promise<{ method: "bluetooth" }>;

  /** Voortgangsevents tijdens open(). */
  addListener(
    eventName: "openStatus",
    listener: (event: { status: AkilesOpenStatus; percent?: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}
