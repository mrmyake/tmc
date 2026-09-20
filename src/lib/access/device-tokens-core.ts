import {
  isAkilesNotFound,
  type AccessCredentialsRow,
  type AkilesApi,
  type DevicePlatform,
  type DeviceTokenRow,
  type SyncDeps,
} from "./types";

/**
 * Levenscyclus van per-device Akiles member tokens (spec-akiles-access.md,
 * workstream E1; discovery-akiles-app-toegang.md sectie 5). Zelfde opzet
 * als sync-core.ts: geen server-only imports, geen directe DB- of
 * netwerkcalls, alles via SyncDeps, zodat scripts/access/ dit met fakes
 * doorloopt. De wiring staat in device-tokens.ts.
 *
 * Het model in een alinea. Een Akiles member token heeft geen eigen
 * vervaldatum, geen device-veld en geen sessie-object; geldigheid volgt
 * volledig uit member.ends_at, de groepsassociatie en het schedule. Het
 * rollende venster van zeven dagen dekt de tokens dus automatisch
 * fail-closed. De keerzijde: een token dat NIET bij Akiles verwijderd is,
 * herleeft zodra de member weer toegang krijgt. Daarom is intrekken hier
 * altijd een Akiles-DELETE, en is "lokaal vergeten" nooit genoeg.
 *
 * Invarianten:
 *  - De tokenwaarde verschijnt uitsluitend in het antwoord van
 *    issueDeviceTokenCore; nooit in de DB, nooit in een event, nooit in
 *    een logregel.
 *  - Uitgifte alleen voor een profiel met een Akiles-member, een groep en
 *    een einddatum in de toekomst (de toestand die de sync bijhoudt).
 *  - Intrekken faalt niet richting de aanroeper: lukt de Akiles-call niet,
 *    dan staat revoke_requested_at en probeert de nachtelijke sync het
 *    opnieuw (retryPendingRevocationsCore). Een 404 bij Akiles telt als
 *    geslaagd: het token is dan al weg.
 *  - Zonder Akiles-client (niet geconfigureerd) raakt geen enkel pad de DB.
 */

export type IssueDeviceTokenResult =
  | { ok: true; row: DeviceTokenRow; token: string }
  | {
      ok: false;
      reason: "not_configured" | "no_credentials" | "no_access" | "akiles_error" | "db_error";
    };

export type RevokeDeviceTokenResult =
  | { ok: true; outcome: "revoked" | "deferred" | "already_revoked" }
  | { ok: false; reason: "not_configured" | "not_found" };

export const DEVICE_LABEL_MAX_LENGTH = 100;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function accessIsOpen(cred: AccessCredentialsRow | null, now: Date): cred is AccessCredentialsRow {
  return Boolean(
    cred &&
      cred.akiles_member_id &&
      cred.access_group &&
      cred.access_ends_at &&
      new Date(cred.access_ends_at) > now,
  );
}

export function normalizeDeviceLabel(label: string | null | undefined): string | null {
  const trimmed = (label ?? "").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, DEVICE_LABEL_MAX_LENGTH) : null;
}

/**
 * Verwijdert een token bij Akiles. true als het weg is (ook als het er al
 * niet meer was), false als de call om een andere reden faalde. Gedeeld
 * met de sync (revokeInAkiles) zodat beide paden dezelfde 404-tolerantie
 * hebben.
 */
export async function deleteTokenInAkiles(
  akiles: AkilesApi,
  memberId: string,
  tokenId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await akiles.deleteMemberToken(memberId, tokenId);
    return { ok: true };
  } catch (err) {
    if (isAkilesNotFound(err)) return { ok: true };
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Uitgifte
// ---------------------------------------------------------------------------

export async function issueDeviceTokenCore(
  deps: SyncDeps,
  input: { profileId: string; platform: DevicePlatform; deviceLabel?: string | null },
): Promise<IssueDeviceTokenResult> {
  if (!deps.akiles) return { ok: false, reason: "not_configured" };
  const now = deps.now();

  const cred = await deps.db.getCredentials(input.profileId);
  if (!cred?.akiles_member_id) return { ok: false, reason: "no_credentials" };
  if (!accessIsOpen(cred, now)) return { ok: false, reason: "no_access" };
  const memberId = cred.akiles_member_id;
  const deviceLabel = normalizeDeviceLabel(input.deviceLabel);

  let created: { id: string; token: string };
  try {
    created = await deps.akiles.createMemberToken(memberId, {
      // Geen e-mail of naam: het Akiles-paneel toont de member al; dit is
      // alleen om een token aan een toestel te kunnen koppelen.
      metadata: {
        source: "tmc",
        profile_id: input.profileId,
        platform: input.platform,
        ...(deviceLabel ? { device_label: deviceLabel } : {}),
      },
    });
  } catch (err) {
    deps.log.error("[access-device-tokens] token aanmaken bij Akiles mislukt", {
      profileId: input.profileId,
      error: errorMessage(err),
    });
    return { ok: false, reason: "akiles_error" };
  }

  let row: DeviceTokenRow;
  try {
    row = await deps.db.insertDeviceToken({
      profile_id: input.profileId,
      akiles_member_id: memberId,
      akiles_token_id: created.id,
      platform: input.platform,
      device_label: deviceLabel,
    });
  } catch (err) {
    // Geen rij, dan ook geen token: anders bestaat er bij Akiles een token
    // dat wij niet kennen en dus nooit meer intrekken. Best effort; faalt
    // ook dit, dan vangt de reconciliatie van de sync het later op.
    deps.log.error("[access-device-tokens] rij wegschrijven mislukt, token wordt teruggedraaid", {
      profileId: input.profileId,
      error: errorMessage(err),
    });
    const undo = await deleteTokenInAkiles(deps.akiles, memberId, created.id);
    if (!undo.ok) {
      deps.log.error("[access-device-tokens] terugdraaien bij Akiles mislukt", {
        profileId: input.profileId,
        tokenId: created.id,
        error: undo.error,
      });
    }
    return { ok: false, reason: "db_error" };
  }

  await deps.emit({
    type: "access.device_token_issued",
    subjectId: input.profileId,
    payload: {
      profile_id: input.profileId,
      device_token_id: row.id,
      akiles_token_id: created.id,
      platform: input.platform,
    },
  });

  return { ok: true, row, token: created.token };
}

// ---------------------------------------------------------------------------
// Intrekken
// ---------------------------------------------------------------------------

/**
 * Trekt een token in dat bij het profiel hoort. De aanroeper (server action
 * of logout) geeft het rij-id door; het Akiles-id blijft server-side.
 */
export async function revokeDeviceTokenCore(
  deps: SyncDeps,
  input: { profileId: string; id: string; reason: string },
): Promise<RevokeDeviceTokenResult> {
  if (!deps.akiles) return { ok: false, reason: "not_configured" };
  const row = await deps.db.getDeviceToken(input.profileId, input.id);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.revoked_at) return { ok: true, outcome: "already_revoked" };

  const nowIso = deps.now().toISOString();
  const result = await deleteTokenInAkiles(deps.akiles, row.akiles_member_id, row.akiles_token_id);
  if (result.ok) {
    await deps.db.updateDeviceToken(row.id, { revoked_at: nowIso, last_error: null });
    await deps.emit({
      type: "access.device_token_revoked",
      subjectId: input.profileId,
      payload: {
        profile_id: input.profileId,
        device_token_id: row.id,
        akiles_token_id: row.akiles_token_id,
        reason: input.reason,
        deferred: false,
      },
    });
    return { ok: true, outcome: "revoked" };
  }

  // Akiles onbereikbaar: markeren en de nachtelijke sync laten herkansen.
  // Bewust ok: een logout mag niet blokkeren op Akiles.
  deps.log.error("[access-device-tokens] intrekken bij Akiles mislukt; in de wachtrij", {
    profileId: input.profileId,
    deviceTokenId: row.id,
    error: result.error,
  });
  await deps.db.updateDeviceToken(row.id, {
    revoke_requested_at: row.revoke_requested_at ?? nowIso,
    last_error: result.error.slice(0, 500),
  });
  await deps.emit({
    type: "access.device_token_revoked",
    subjectId: input.profileId,
    payload: {
      profile_id: input.profileId,
      device_token_id: row.id,
      akiles_token_id: row.akiles_token_id,
      reason: input.reason,
      deferred: true,
    },
  });
  return { ok: true, outcome: "deferred" };
}

/**
 * Trekt alle open device-tokens van een profiel in, rij voor rij via
 * revokeDeviceTokenCore, dus met dezelfde wachtrij bij een falende
 * Akiles-call. Voor het uitlogpad als het toestel niet te identificeren
 * is (device-cleanup-core.ts): een deurcredential die blijft staan is
 * erger dan een lid dat op een ander toestel opnieuw moet koppelen.
 * Niet voor de sync: die gebruikt revokeAllMemberTokensCore met de lijst
 * bij Akiles als bron en faalt luid.
 */
export async function revokeAllDeviceTokensCore(
  deps: SyncDeps,
  input: { profileId: string; reason: string },
): Promise<{ revoked: number; deferred: number; notConfigured: boolean }> {
  if (!deps.akiles) return { revoked: 0, deferred: 0, notConfigured: true };
  const open = await deps.db.listOpenDeviceTokens(input.profileId);
  let revoked = 0;
  let deferred = 0;
  for (const row of open) {
    const result = await revokeDeviceTokenCore(deps, {
      profileId: input.profileId,
      id: row.id,
      reason: input.reason,
    });
    if (result.ok && result.outcome === "revoked") revoked++;
    else if (result.ok && result.outcome === "deferred") deferred++;
  }
  return { revoked, deferred, notConfigured: false };
}

/**
 * Trekt alle open tokens van een member in. Aangeroepen door de sync bij
 * intrekking van de toegang (revokeInAkiles). Bron van waarheid is de
 * lijst bij Akiles, zodat ook een token dat buiten ons om is aangemaakt
 * (Akiles-paneel, oude rij) meegaat; onze rijen worden daarna bijgewerkt.
 * Gooit alleen bij een echte Akiles-fout, zodat het profiel in last_error
 * landt en de volgende run het opnieuw probeert.
 */
export async function revokeAllMemberTokensCore(
  deps: SyncDeps,
  akiles: AkilesApi,
  profileId: string,
  memberId: string,
  reason: string,
): Promise<number> {
  const nowIso = deps.now().toISOString();
  let remote: string[] = [];
  try {
    remote = (await akiles.listMemberTokens(memberId))
      .filter((t) => !t.is_deleted)
      .map((t) => t.id);
  } catch (err) {
    // Member al weg in Akiles: tokens bestaan dan ook niet meer.
    if (!isAkilesNotFound(err)) throw err;
  }
  const open = await deps.db.listOpenDeviceTokens(profileId);
  const toDelete = new Set<string>([
    ...remote,
    ...open.filter((r) => r.akiles_member_id === memberId).map((r) => r.akiles_token_id),
  ]);

  let revoked = 0;
  for (const tokenId of toDelete) {
    const result = await deleteTokenInAkiles(akiles, memberId, tokenId);
    if (!result.ok) throw new Error(`member token ${tokenId} intrekken: ${result.error}`);
    revoked++;
  }

  for (const row of open) {
    await deps.db.updateDeviceToken(row.id, { revoked_at: nowIso, last_error: null });
    await deps.emit({
      type: "access.device_token_revoked",
      subjectId: profileId,
      payload: {
        profile_id: profileId,
        device_token_id: row.id,
        akiles_token_id: row.akiles_token_id,
        reason,
        deferred: false,
      },
    });
  }
  return revoked;
}

/**
 * Nachtelijke herkansing van intrekkingen die eerder bij Akiles faalden.
 * Draait VOOR de profielloop in syncAllCore: het gaat om weinig rijen en
 * om een beveiligingsactie die niet door het tijdsbudget verdrongen mag
 * worden.
 */
export async function retryPendingRevocationsCore(
  deps: SyncDeps,
  akiles: AkilesApi,
): Promise<{ retried: number; failed: number }> {
  const pending = await deps.db.listPendingDeviceTokenRevocations();
  let retried = 0;
  let failed = 0;
  for (const row of pending) {
    const nowIso = deps.now().toISOString();
    const result = await deleteTokenInAkiles(akiles, row.akiles_member_id, row.akiles_token_id);
    if (result.ok) {
      await deps.db.updateDeviceToken(row.id, { revoked_at: nowIso, last_error: null });
      retried++;
      continue;
    }
    failed++;
    deps.log.error("[access-device-tokens] herkansing intrekken mislukt", {
      deviceTokenId: row.id,
      error: result.error,
    });
    await deps.db.updateDeviceToken(row.id, { last_error: result.error.slice(0, 500) });
  }
  return { retried, failed };
}
