import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { revokeAllDeviceTokens, revokeDeviceToken } from "@/lib/access/device-tokens";
import { unregisterPushToken } from "@/lib/member/push-actions";
import {
  cleanupDeviceOnSignOutCore,
  type DeviceCleanupDeps,
  type DeviceCleanupInput,
  type DeviceCleanupResult,
} from "./device-cleanup-core";

export type { DeviceCleanupInput, DeviceCleanupResult } from "./device-cleanup-core";

/**
 * Wiring van het opruimpad bij uitloggen op de service-role-client. De
 * regels (eigenaarschap voor elke Akiles-call, geen stille no-op) staan in
 * device-cleanup-core.ts. Aangeroepen vanuit signOut() VOOR
 * supabase.auth.signOut(): daarna is er geen sessie meer.
 *
 * De lookups op eigenaarschap lopen bewust via de service-role: een
 * user-scoped query zou een vreemd token door RLS simpelweg niet zien en
 * we willen juist vastleggen dat het van een ander profiel was.
 */

function buildDeps(): DeviceCleanupDeps {
  const admin = createAdminClient();
  return {
    async findDeviceToken(id) {
      const { data, error } = await admin
        .from("access_device_tokens")
        .select("profile_id, revoked_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`access_device_tokens lezen: ${error.message}`);
      return (data as { profile_id: string; revoked_at: string | null } | null) ?? null;
    },
    async findPushToken(token) {
      const { data, error } = await admin
        .from("device_push_tokens")
        .select("profile_id")
        .eq("token", token)
        .maybeSingle();
      if (error) throw new Error(`device_push_tokens lezen: ${error.message}`);
      return (data as { profile_id: string } | null) ?? null;
    },
    revokeDeviceToken: (profileId, id, reason) => revokeDeviceToken(profileId, id, reason),
    revokeAllDeviceTokens: (profileId, reason) => revokeAllDeviceTokens(profileId, reason),
    // Eigen token: via de bestaande server action, die op profiel plus
    // token filtert onder RLS (tweede slot na de eigenaarschapscheck).
    removePushToken: (_profileId, token) => unregisterPushToken(token),
    async removeAllPushTokens(profileId) {
      const { data, error } = await admin
        .from("device_push_tokens")
        .delete()
        .eq("profile_id", profileId)
        .select("id");
      if (error) throw new Error(`device_push_tokens verwijderen: ${error.message}`);
      return (data ?? []).length;
    },
    async emitRejected(profileId, payload) {
      await emitEvent({
        type: "access.device_cleanup_rejected",
        actorType: "member",
        actorId: profileId,
        subjectType: "profile",
        subjectId: profileId,
        payload,
      });
    },
    log: {
      error: (message, meta) => console.error(message, meta ?? ""),
    },
  };
}

export async function cleanupDeviceOnSignOut(
  profileId: string,
  input: DeviceCleanupInput,
): Promise<DeviceCleanupResult> {
  try {
    return await cleanupDeviceOnSignOutCore(buildDeps(), profileId, input);
  } catch (err) {
    console.error(
      "[device-cleanup] cleanupDeviceOnSignOut threw",
      profileId,
      err instanceof Error ? err.message : String(err),
    );
    return { accessDeviceToken: "nothing_open", pushToken: "nothing_open", rejected: [] };
  }
}
