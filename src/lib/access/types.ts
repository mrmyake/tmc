import type { ScheduleWeekday } from "./schedule";
import type { AccessMembershipRow } from "./desired-state";

/**
 * Smalle contracten voor de Akiles-sync, zodat sync-core.ts met fakes te
 * testen is (zelfde aanpak als src/lib/orders/payment-link-core.ts).
 * De echte implementaties: src/lib/akiles.ts (AkilesApi) en
 * src/lib/access/sync.ts (AccessDb via de service-role-client).
 */

// ---------------------------------------------------------------------------
// Akiles API (openapi.yaml, github.com/akiles/openapi-specs)
// ---------------------------------------------------------------------------

export interface AkilesAccessMethods {
  online: boolean;
  bluetooth: boolean;
  mobile_nfc: boolean;
  pin: boolean;
  card: boolean;
}

/** Schema `member_group_permission_rule`. Zonder site_id/gadget_id matcht de regel alle gadgets. */
export interface AkilesPermissionRule {
  schedule_id?: string;
  access_methods?: AkilesAccessMethods;
  site_id?: string;
  gadget_id?: string;
}

export interface AkilesIdOnly {
  id: string;
}

export interface AkilesGroupAssociation {
  id: string;
  member_group_id: string;
  is_deleted?: boolean;
}

/** Schema `member_token` (zonder de waarde). Geen expires_at: geldigheid volgt uit de member. */
export interface AkilesMemberToken {
  id: string;
  is_deleted?: boolean;
}

/**
 * Alleen de calls die de sync, de reveal en de device-tokens nodig hebben.
 * De create-PIN-call geeft bewust alleen het id terug: de gegenereerde
 * waarde komt in de response mee maar wordt door de wrapper weggegooid,
 * zodat het syncpad hem nooit in handen krijgt. Onthullen kan uitsluitend
 * via revealPin.
 *
 * createMemberToken is de uitzondering op "alleen ids": de tokenwaarde is
 * precies wat het toestel een keer nodig heeft (device-tokens-core.ts). De
 * sync roept die call nooit aan; hij kent alleen list en delete.
 */
export interface AkilesApi {
  createSchedule(body: { name: string; weekdays: ScheduleWeekday[] }): Promise<AkilesIdOnly>;
  editSchedule(
    scheduleId: string,
    body: { name: string; weekdays: ScheduleWeekday[] },
  ): Promise<AkilesIdOnly>;

  createMemberGroup(body: {
    name: string;
    permissions: AkilesPermissionRule[];
  }): Promise<AkilesIdOnly>;
  editMemberGroup(
    groupId: string,
    body: { name: string; permissions: AkilesPermissionRule[] },
  ): Promise<AkilesIdOnly>;

  createMember(body: {
    name: string;
    starts_at: string | null;
    ends_at: string | null;
    metadata: Record<string, string>;
  }): Promise<AkilesIdOnly>;
  editMember(
    memberId: string,
    body: { name?: string; ends_at?: string | null },
  ): Promise<AkilesIdOnly>;

  createPin(memberId: string, body: { length: number }): Promise<AkilesIdOnly>;
  deletePin(memberId: string, pinId: string): Promise<void>;
  revealPin(memberId: string, pinId: string): Promise<{ pin: string }>;

  createMagicLink(memberId: string): Promise<AkilesIdOnly>;
  revealMagicLink(memberId: string, magicLinkId: string): Promise<{ link: string }>;
  deleteMagicLink(memberId: string, magicLinkId: string): Promise<void>;

  /** DELETE /members/{id}: soft delete bij Akiles (is_deleted). Alleen na editMember(name = pseudoniem), want wij sturen de echte naam mee. */
  deleteMember(memberId: string): Promise<void>;

  listGroupAssociations(memberId: string): Promise<AkilesGroupAssociation[]>;
  createGroupAssociation(
    memberId: string,
    body: { member_group_id: string },
  ): Promise<AkilesIdOnly>;
  deleteGroupAssociation(memberId: string, associationId: string): Promise<void>;

  /** POST /members/{id}/tokens; antwoord member_token_revealed. De waarde gaat door naar het toestel, nergens anders heen. */
  createMemberToken(
    memberId: string,
    body: { metadata: Record<string, string> },
  ): Promise<{ id: string; token: string }>;
  listMemberTokens(memberId: string): Promise<AkilesMemberToken[]>;
  deleteMemberToken(memberId: string, tokenId: string): Promise<void>;
}

/** Foutvorm die sync-core herkent (404 = object in Akiles verdwenen, opnieuw aanmaken). */
export interface AkilesErrorLike {
  status?: number;
}

export function isAkilesNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as AkilesErrorLike).status === 404
  );
}

// ---------------------------------------------------------------------------
// TMC-kant (tmc.access_config, tmc.access_credentials)
// ---------------------------------------------------------------------------

export interface AccessConfigRow {
  lockdown: boolean;
  schedule_standard_id: string | null;
  schedule_extended_id: string | null;
  schedule_closed_id: string | null;
  schedule_staff_id: string | null;
  group_standard_id: string | null;
  group_extended_id: string | null;
  group_staff_id: string | null;
}

/** Config waarvan alle ids gevuld zijn; wat ensureAccessConfig oplevert. */
export interface ResolvedAccessConfig {
  lockdown: boolean;
  schedule_standard_id: string;
  schedule_extended_id: string;
  schedule_closed_id: string;
  schedule_staff_id: string;
  group_standard_id: string;
  group_extended_id: string;
  group_staff_id: string;
}

export interface AccessCredentialsRow {
  profile_id: string;
  akiles_member_id: string | null;
  akiles_pin_id: string | null;
  akiles_magic_link_id: string | null;
  access_group: string | null;
  /** ISO timestamptz. */
  access_ends_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface AccessProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_test: boolean;
  memberships: AccessMembershipRow[];
  /** Open rij in tmc.account_deletions waarvan de sluiting gestart of gedaan is (step_status.freeze niet pending): deur dicht, ongeacht de membership. */
  deletion_frozen?: boolean;
}

/** Rij in tmc.access_device_tokens (migratie 20260920000000). Nooit de tokenwaarde. */
export interface DeviceTokenRow {
  id: string;
  profile_id: string;
  akiles_member_id: string;
  akiles_token_id: string;
  platform: DevicePlatform;
  device_label: string | null;
  issued_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoke_requested_at: string | null;
  last_error: string | null;
}

export type DevicePlatform = "ios" | "android";

export type DeviceTokenPatch = Partial<
  Pick<DeviceTokenRow, "last_seen_at" | "revoked_at" | "revoke_requested_at" | "last_error">
>;

export interface AccessDb {
  getConfig(): Promise<AccessConfigRow | null>;
  saveConfig(patch: Partial<AccessConfigRow>): Promise<void>;
  getOpeningHours(): Promise<
    Array<{
      weekday: number;
      is_closed: boolean;
      opens_at: string | null;
      closes_at: string | null;
    }>
  >;
  /** null als het profiel niet (meer) bestaat. */
  getProfile(profileId: string): Promise<AccessProfile | null>;
  /**
   * Profielen die een sync verdienen: staf, iedereen met een membership-rij,
   * iedereen met credentials. Volgorde: nooit gesynct eerst, daarna oplopend
   * op last_synced_at, zodat een door het tijdsbudget afgebroken run de
   * volgende nacht niet steeds dezelfde staart overslaat.
   */
  listSyncCandidateProfileIds(): Promise<string[]>;
  getCredentials(profileId: string): Promise<AccessCredentialsRow | null>;
  upsertCredentials(
    row: Pick<AccessCredentialsRow, "profile_id"> & Partial<AccessCredentialsRow>,
  ): Promise<void>;

  // Device-tokens (tmc.access_device_tokens). Schrijven uitsluitend via
  // service-role; de rijen dragen alleen ids.
  insertDeviceToken(
    row: Pick<
      DeviceTokenRow,
      "profile_id" | "akiles_member_id" | "akiles_token_id" | "platform" | "device_label"
    >,
  ): Promise<DeviceTokenRow>;
  /** Rij op eigen id, alleen als hij bij het profiel hoort. */
  getDeviceToken(profileId: string, id: string): Promise<DeviceTokenRow | null>;
  /** Alle rijen van het profiel zonder revoked_at. */
  listOpenDeviceTokens(profileId: string): Promise<DeviceTokenRow[]>;
  /** Rijen met revoke_requested_at gevuld en revoked_at leeg, over alle profielen. */
  listPendingDeviceTokenRevocations(): Promise<DeviceTokenRow[]>;
  updateDeviceToken(id: string, patch: DeviceTokenPatch): Promise<void>;
}

export interface AccessEvent {
  type:
    | "access.granted"
    | "access.revoked"
    | "access.lockdown_enabled"
    | "access.lockdown_disabled"
    | "access.device_token_issued"
    | "access.device_token_revoked";
  subjectId: string | null;
  payload: Record<string, unknown>;
}

export interface SyncDeps {
  db: AccessDb;
  /** null zolang de OAuth-koppeling niet geconfigureerd is: de hele sync no-opt dan. */
  akiles: AkilesApi | null;
  emit(event: AccessEvent): Promise<void>;
  now(): Date;
  log: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

/** "skipped": diff-check zag geen afwijking, geen Akiles-call gedaan. */
export type ProfileSyncOutcome = "granted" | "revoked" | "updated" | "noop" | "skipped";

export interface ProfileSyncResult {
  profileId: string;
  ok: boolean;
  outcome: ProfileSyncOutcome;
  error?: string;
}

export interface SyncOptions {
  /** Volledige reconciliatie: diff-check overslaan en elk profiel naar Akiles schrijven. */
  force?: boolean;
  /** Epoch-ms; na dit moment start de run geen nieuw profiel meer. */
  deadlineMs?: number;
}

export interface SyncAllResult {
  ok: boolean;
  /** True als er geen API-key is en er dus niets is gedaan. */
  notConfigured: boolean;
  /** Profielen waarvoor Akiles is aangeroepen (of die zonder afwijking waren, zie skipped). */
  processed: number;
  /** Profielen die de diff-check zonder Akiles-call passeerden. */
  skipped: number;
  /** Profielen die door het tijdsbudget niet aan de beurt kwamen. */
  remaining: number;
  failed: number;
  failures: Array<{ profileId: string; error: string }>;
  /** Device-tokens waarvan een eerder mislukte intrekking deze run alsnog bij Akiles is doorgevoerd. */
  tokenRevocationsRetried: number;
  /** Device-tokens waarvan de intrekking opnieuw mislukte; blijven staan voor de volgende run. */
  tokenRevocationsFailed: number;
  error?: string;
}
