import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { getAkilesClient } from "@/lib/akiles";
import { ACCESS_CONFIG_ID } from "./constants";
import { syncAllCore, syncOneCore } from "./sync-core";
import type {
  AccessConfigRow,
  AccessCredentialsRow,
  AccessDb,
  AccessProfile,
  ProfileSyncResult,
  SyncAllResult,
  SyncDeps,
} from "./types";

/**
 * Wiring van de Akiles-sync op de echte service-role-client. Twee
 * ingangen, een implementatie (sync-core.ts):
 *
 *  - syncMembershipAccess(profileId): direct na order.activated (Mollie-
 *    webhook) en voor een hard-delete (deleteMember), zodat een nieuw lid
 *    niet tot de nacht wacht en een verwijderd lid meteen dicht gaat.
 *  - syncAllAccess(): de nachtelijke cron, tevens de bewaker van het
 *    rollende venster van zeven dagen.
 *
 * Beide throwen nooit richting de aanroeper.
 */

const MEMBERSHIP_COLUMNS =
  "status, extended_access, cancellation_effective_date, pause_effective_date";

function buildDb(admin: SupabaseClient): AccessDb {
  return {
    async getConfig() {
      const { data, error } = await admin
        .from("access_config")
        .select(
          "lockdown, schedule_standard_id, schedule_extended_id, schedule_closed_id, schedule_staff_id, group_standard_id, group_extended_id, group_staff_id",
        )
        .eq("id", ACCESS_CONFIG_ID)
        .maybeSingle();
      if (error) throw new Error(`access_config lezen: ${error.message}`);
      return (data as AccessConfigRow | null) ?? null;
    },
    async saveConfig(patch) {
      const { error } = await admin
        .from("access_config")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", ACCESS_CONFIG_ID);
      if (error) throw new Error(`access_config schrijven: ${error.message}`);
    },
    async getOpeningHours() {
      const { data, error } = await admin
        .from("opening_hours")
        .select("weekday, is_closed, opens_at, closes_at");
      if (error) throw new Error(`opening_hours lezen: ${error.message}`);
      return data ?? [];
    },
    async getProfile(profileId) {
      const { data, error } = await admin
        .from("profiles")
        .select(`id, first_name, last_name, role, is_test, memberships(${MEMBERSHIP_COLUMNS})`)
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw new Error(`profile lezen: ${error.message}`);
      if (!data) return null;
      const row = data as unknown as AccessProfile & {
        memberships: AccessProfile["memberships"] | null;
      };
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
        is_test: Boolean(row.is_test),
        memberships: row.memberships ?? [],
      };
    },
    async listSyncCandidateProfileIds() {
      const [staff, members, creds] = await Promise.all([
        admin.from("profiles").select("id").in("role", ["trainer", "admin"]),
        admin.from("memberships").select("profile_id"),
        admin.from("access_credentials").select("profile_id"),
      ]);
      for (const res of [staff, members, creds]) {
        if (res.error) throw new Error(`kandidaten lezen: ${res.error.message}`);
      }
      const ids = new Set<string>();
      for (const r of staff.data ?? []) ids.add((r as { id: string }).id);
      for (const r of members.data ?? []) ids.add((r as { profile_id: string }).profile_id);
      for (const r of creds.data ?? []) ids.add((r as { profile_id: string }).profile_id);
      return [...ids].sort();
    },
    async getCredentials(profileId) {
      const { data, error } = await admin
        .from("access_credentials")
        .select(
          "profile_id, akiles_member_id, akiles_pin_id, akiles_magic_link_id, access_group, access_ends_at, last_synced_at, last_error",
        )
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw new Error(`access_credentials lezen: ${error.message}`);
      return (data as AccessCredentialsRow | null) ?? null;
    },
    async upsertCredentials(row) {
      const { error } = await admin
        .from("access_credentials")
        .upsert(
          { ...row, updated_at: new Date().toISOString() },
          { onConflict: "profile_id" },
        );
      if (error) throw new Error(`access_credentials schrijven: ${error.message}`);
    },
  };
}

function buildDeps(): SyncDeps {
  return {
    db: buildDb(createAdminClient()),
    akiles: getAkilesClient(),
    emit: (event) =>
      emitEvent({
        type: event.type,
        actorType: "system",
        subjectType: "profile",
        subjectId: event.subjectId,
        payload: event.payload,
      }),
    now: () => new Date(),
    log: {
      info: (message, meta) => console.info(message, meta ?? ""),
      error: (message, meta) => console.error(message, meta ?? ""),
    },
  };
}

export async function syncMembershipAccess(
  profileId: string,
): Promise<ProfileSyncResult> {
  try {
    return await syncOneCore(buildDeps(), profileId);
  } catch (err) {
    console.error("[access-sync] syncMembershipAccess threw", profileId, err);
    return {
      profileId,
      ok: false,
      outcome: "noop",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function syncAllAccess(): Promise<SyncAllResult> {
  try {
    return await syncAllCore(buildDeps());
  } catch (err) {
    console.error("[access-sync] syncAllAccess threw", err);
    return {
      ok: false,
      skipped: false,
      processed: 0,
      failed: 0,
      failures: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
