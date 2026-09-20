import "server-only";
import { revokeDeviceToken } from "@/lib/access/device-tokens";
import { unregisterPushToken } from "@/lib/member/push-actions";

/**
 * Het ene opruimpad bij uitloggen (E1, spec-akiles-access.md): verwijdert
 * het pushtoken van dit toestel uit tmc.device_push_tokens en trekt het
 * Akiles member token van dit toestel in, bij Akiles zelf en niet alleen
 * lokaal. Aangeroepen vanuit signOut() VOOR supabase.auth.signOut(): daarna
 * is er geen sessie meer om mee te autoriseren.
 *
 * Waarom bij Akiles: een member token heeft geen eigen vervaldatum en
 * herleeft zodra de member weer toegang krijgt. Lokaal vergeten is dus
 * nooit genoeg (discovery-akiles-app-toegang.md sectie 5.4).
 *
 * De twee ids komen als verborgen velden uit het uitlogformulier
 * (DeviceSignOutFields, gevuld uit localStorage door de native app). Op
 * web ontbreken ze en gebeurt er niets. Een id dat niet bij dit profiel
 * hoort (toestel gedeeld, oude sleutel) is een no-op: revokeDeviceToken
 * zoekt op profiel plus id, unregisterPushToken op profiel plus token.
 *
 * Throwt nooit: uitloggen mag niet blokkeren op Akiles of op de DB.
 */

export interface DeviceCleanupInput {
  pushToken?: string | null;
  accessDeviceTokenId?: string | null;
}

export interface DeviceCleanupResult {
  pushToken: "removed" | "skipped";
  accessDeviceToken: "revoked" | "deferred" | "skipped";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cleanupDeviceOnSignOut(
  profileId: string,
  input: DeviceCleanupInput,
): Promise<DeviceCleanupResult> {
  const result: DeviceCleanupResult = { pushToken: "skipped", accessDeviceToken: "skipped" };

  const pushToken = (input.pushToken ?? "").trim();
  if (pushToken) {
    try {
      await unregisterPushToken(pushToken);
      result.pushToken = "removed";
    } catch (err) {
      console.error("[device-cleanup] pushtoken verwijderen mislukt", profileId, err);
    }
  }

  const tokenId = (input.accessDeviceTokenId ?? "").trim();
  if (tokenId && UUID_RE.test(tokenId)) {
    const revoke = await revokeDeviceToken(profileId, tokenId, "logout");
    if (revoke.ok && revoke.outcome === "deferred") result.accessDeviceToken = "deferred";
    else if (revoke.ok) result.accessDeviceToken = "revoked";
  }

  return result;
}
