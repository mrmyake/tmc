/**
 * Kern van het opruimpad bij uitloggen (E1, spec-akiles-access.md), zonder
 * server-only imports en zonder directe DB- of netwerkcalls, zodat
 * scripts/access/device-cleanup.test.mts dit met fakes doorloopt. De
 * wiring staat in device-cleanup.ts.
 *
 * Twee regels, beide server-side en op basis van de geauthenticeerde
 * sessie (zelfde patroon als de RLS-schrijfpoort uit PR #179: nooit
 * vertrouwen op wat de client over een credential meestuurt):
 *
 *  1. Eigenaarschap. Het token-id en het pushtoken uit het formulier
 *     worden VOOR elke Akiles-call opgezocht en vergeleken met het profiel
 *     van de sessie. Hoort een waarde bij een ander profiel, bestaat hij
 *     niet, of heeft hij een onmogelijke vorm, dan wordt met die waarde
 *     niets ingetrokken en gaat de poging persistent naar tmc.events
 *     (access.device_cleanup_rejected).
 *
 *  2. Geen stille no-op. Kan het toestel niet geidentificeerd worden
 *     (veld leeg, ontbrekend, afgewezen), dan worden ALLE open
 *     device-tokens van het profiel ingetrokken en alle pushtokens
 *     verwijderd. Een deurcredential die blijft staan op een toestel dat
 *     net is uitgelogd is erger dan een lid dat op een ander toestel
 *     opnieuw moet koppelen; de app koppelt bij de volgende start opnieuw
 *     (E3) en PushNotificationRegister registreert bij elke start opnieuw.
 *     Dit geldt ook voor een uitlog op web: de server kan web en app niet
 *     betrouwbaar onderscheiden zonder opnieuw op de client te vertrouwen,
 *     en een web-uitlog wordt zo tevens de noodknop voor een kwijtgeraakte
 *     telefoon zolang het ledenscherm (E3) er nog niet is.
 *
 * Throwt nooit richting de aanroeper: uitloggen mag niet blokkeren op
 * Akiles of op de DB.
 */

export interface DeviceCleanupInput {
  pushToken?: string | null;
  accessDeviceTokenId?: string | null;
}

export type FieldOutcome = "revoked" | "deferred" | "revoked_all" | "removed" | "removed_all" | "nothing_open";

export type RejectionReason = "foreign" | "unknown" | "invalid";

export interface DeviceCleanupResult {
  accessDeviceToken: FieldOutcome;
  pushToken: FieldOutcome;
  /** Afgewezen velden, al persistent gelogd. */
  rejected: Array<{ field: "access_device_token_id" | "push_token"; reason: RejectionReason }>;
}

export interface DeviceCleanupDeps {
  /** Rij op id, ongeacht profiel (service-role); null als hij niet bestaat. */
  findDeviceToken(id: string): Promise<{ profile_id: string; revoked_at: string | null } | null>;
  /** Rij op tokenwaarde, ongeacht profiel; null als hij niet bestaat. */
  findPushToken(token: string): Promise<{ profile_id: string } | null>;
  revokeDeviceToken(
    profileId: string,
    id: string,
    reason: string,
  ): Promise<{ ok: true; outcome: "revoked" | "deferred" | "already_revoked" } | { ok: false }>;
  revokeAllDeviceTokens(profileId: string, reason: string): Promise<{ revoked: number; deferred: number }>;
  removePushToken(profileId: string, token: string): Promise<void>;
  removeAllPushTokens(profileId: string): Promise<number>;
  emitRejected(profileId: string, payload: Record<string, unknown>): Promise<void>;
  log: { error(message: string, meta?: Record<string, unknown>): void };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** FCM-registratietokens zijn lang en bevatten geen witruimte; alles daarbuiten is geen token. */
const PUSH_TOKEN_RE = /^[A-Za-z0-9_\-:.]{20,4096}$/;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Identified<T> = { status: "identified"; value: T } | { status: "absent" } | { status: "rejected"; reason: RejectionReason; extra?: Record<string, unknown> };

async function identifyAccessToken(
  deps: DeviceCleanupDeps,
  profileId: string,
  raw: string | null | undefined,
): Promise<Identified<string>> {
  const id = (raw ?? "").trim();
  if (!id) return { status: "absent" };
  if (!UUID_RE.test(id)) return { status: "rejected", reason: "invalid" };
  const row = await deps.findDeviceToken(id);
  if (!row) return { status: "rejected", reason: "unknown", extra: { supplied_id: id } };
  if (row.profile_id !== profileId) {
    return {
      status: "rejected",
      reason: "foreign",
      extra: { supplied_id: id, owner_profile_id: row.profile_id },
    };
  }
  return { status: "identified", value: id };
}

async function identifyPushToken(
  deps: DeviceCleanupDeps,
  profileId: string,
  raw: string | null | undefined,
): Promise<Identified<string>> {
  const token = (raw ?? "").trim();
  if (!token) return { status: "absent" };
  if (!PUSH_TOKEN_RE.test(token)) return { status: "rejected", reason: "invalid" };
  const row = await deps.findPushToken(token);
  // De tokenwaarde zelf gaat nooit in een event: hij is een credential van
  // (mogelijk) een ander profiel. Alleen de eigenaar, als die er is.
  if (!row) return { status: "rejected", reason: "unknown" };
  if (row.profile_id !== profileId) {
    return { status: "rejected", reason: "foreign", extra: { owner_profile_id: row.profile_id } };
  }
  return { status: "identified", value: token };
}

export async function cleanupDeviceOnSignOutCore(
  deps: DeviceCleanupDeps,
  profileId: string,
  input: DeviceCleanupInput,
): Promise<DeviceCleanupResult> {
  const result: DeviceCleanupResult = {
    accessDeviceToken: "nothing_open",
    pushToken: "nothing_open",
    rejected: [],
  };

  // 1. Eigenaarschap, voor elke Akiles-call. Een lookup-fout telt als
  //    "niet geidentificeerd", nooit als "eigenaar".
  let access: Identified<string>;
  let push: Identified<string>;
  try {
    access = await identifyAccessToken(deps, profileId, input.accessDeviceTokenId);
  } catch (err) {
    deps.log.error("[device-cleanup] token-id opzoeken mislukt", { profileId, error: errorMessage(err) });
    access = { status: "absent" };
  }
  try {
    push = await identifyPushToken(deps, profileId, input.pushToken);
  } catch (err) {
    deps.log.error("[device-cleanup] pushtoken opzoeken mislukt", { profileId, error: errorMessage(err) });
    push = { status: "absent" };
  }

  for (const [field, outcome] of [
    ["access_device_token_id", access],
    ["push_token", push],
  ] as const) {
    if (outcome.status !== "rejected") continue;
    result.rejected.push({ field, reason: outcome.reason });
    try {
      await deps.emitRejected(profileId, {
        profile_id: profileId,
        field,
        reason: outcome.reason,
        ...(outcome.extra ?? {}),
      });
    } catch (err) {
      deps.log.error("[device-cleanup] afwijzing loggen mislukt", { profileId, field, error: errorMessage(err) });
    }
  }

  // 2. Device-token: het eigen token, anders alles van het profiel.
  try {
    if (access.status === "identified") {
      const revoke = await deps.revokeDeviceToken(profileId, access.value, "logout");
      if (revoke.ok && revoke.outcome === "deferred") result.accessDeviceToken = "deferred";
      else if (revoke.ok && revoke.outcome === "revoked") result.accessDeviceToken = "revoked";
      else result.accessDeviceToken = "nothing_open";
    } else {
      const all = await deps.revokeAllDeviceTokens(profileId, "logout_unidentified_device");
      result.accessDeviceToken = all.revoked + all.deferred > 0 ? "revoked_all" : "nothing_open";
    }
  } catch (err) {
    deps.log.error("[device-cleanup] device-token intrekken mislukt", { profileId, error: errorMessage(err) });
  }

  // 3. Pushtoken: het eigen token, anders alle van het profiel.
  try {
    if (push.status === "identified") {
      await deps.removePushToken(profileId, push.value);
      result.pushToken = "removed";
    } else {
      const removed = await deps.removeAllPushTokens(profileId);
      result.pushToken = removed > 0 ? "removed_all" : "nothing_open";
    }
  } catch (err) {
    deps.log.error("[device-cleanup] pushtoken verwijderen mislukt", { profileId, error: errorMessage(err) });
  }

  return result;
}
