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
  DeviceTokenRow,
  ProfileSyncResult,
  SyncAllResult,
  SyncDeps,
  SyncOptions,
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
  "plan_type, status, extended_access, cancellation_effective_date, pause_effective_date";

/** PostgREST kapt een select standaard op 1000 rijen af; daarom in pagina's. */
const PAGE_SIZE = 1000;

async function selectAllPaged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} lezen: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

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
      // Verwijderverzoek waarvan de sluiting gestart of gedaan is: deur dicht
      // ongeacht de membership (desired-state). Een verzoek dat nog op de
      // einddatum wacht (freeze pending) laat de deur open.
      const { data: open, error: openErr } = await admin
        .from("account_deletions")
        .select("id")
        .eq("profile_id", profileId)
        .in("status", ["requested", "in_progress", "blocked"])
        .neq("step_status->>freeze", "pending")
        .limit(1);
      if (openErr) throw new Error(`account_deletions lezen: ${openErr.message}`);
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
        is_test: Boolean(row.is_test),
        memberships: row.memberships ?? [],
        deletion_frozen: (open ?? []).length > 0,
      };
    },
    async listSyncCandidateProfileIds() {
      const [staff, members, creds] = await Promise.all([
        selectAllPaged<{ id: string }>(
          (from, to) =>
            admin
              .from("profiles")
              .select("id")
              .in("role", ["trainer", "admin"])
              .order("id")
              .range(from, to),
          "staf-profielen",
        ),
        selectAllPaged<{ profile_id: string }>(
          (from, to) =>
            admin.from("memberships").select("profile_id").order("id").range(from, to),
          "memberships",
        ),
        selectAllPaged<{ profile_id: string; last_synced_at: string | null }>(
          (from, to) =>
            admin
              .from("access_credentials")
              .select("profile_id, last_synced_at")
              .order("profile_id")
              .range(from, to),
          "access_credentials",
        ),
      ]);
      // Nooit gesynct eerst (geen credentials-rij of last_synced_at null),
      // daarna oplopend op last_synced_at; zie AccessDb.listSyncCandidateProfileIds.
      const lastSynced = new Map<string, string | null>();
      for (const r of creds) lastSynced.set(r.profile_id, r.last_synced_at);
      const ids = new Set<string>();
      for (const r of staff) ids.add(r.id);
      for (const r of members) ids.add(r.profile_id);
      for (const r of creds) ids.add(r.profile_id);
      return [...ids].sort((a, b) => {
        const sa = lastSynced.get(a) ?? "";
        const sb = lastSynced.get(b) ?? "";
        return sa < sb ? -1 : sa > sb ? 1 : a < b ? -1 : a > b ? 1 : 0;
      });
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

    // Device-tokens (tmc.access_device_tokens, E1). Alleen ids; de
    // tokenwaarde komt hier nooit langs.
    async insertDeviceToken(row) {
      const { data, error } = await admin
        .from("access_device_tokens")
        .insert(row)
        .select(DEVICE_TOKEN_COLUMNS)
        .single();
      if (error) throw new Error(`access_device_tokens schrijven: ${error.message}`);
      return data as unknown as DeviceTokenRow;
    },
    async getDeviceToken(profileId, id) {
      const { data, error } = await admin
        .from("access_device_tokens")
        .select(DEVICE_TOKEN_COLUMNS)
        .eq("id", id)
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw new Error(`access_device_tokens lezen: ${error.message}`);
      return (data as unknown as DeviceTokenRow | null) ?? null;
    },
    async listOpenDeviceTokens(profileId) {
      const { data, error } = await admin
        .from("access_device_tokens")
        .select(DEVICE_TOKEN_COLUMNS)
        .eq("profile_id", profileId)
        .is("revoked_at", null)
        .order("issued_at");
      if (error) throw new Error(`access_device_tokens lezen: ${error.message}`);
      return (data ?? []) as unknown as DeviceTokenRow[];
    },
    async listPendingDeviceTokenRevocations() {
      return selectAllPaged<DeviceTokenRow>(
        (from, to) =>
          admin
            .from("access_device_tokens")
            .select(DEVICE_TOKEN_COLUMNS)
            .is("revoked_at", null)
            .not("revoke_requested_at", "is", null)
            .order("revoke_requested_at")
            .range(from, to),
        "access_device_tokens (wachtrij)",
      );
    },
    async updateDeviceToken(id, patch) {
      const { error } = await admin
        .from("access_device_tokens")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`access_device_tokens bijwerken: ${error.message}`);
    },
  };
}

const DEVICE_TOKEN_COLUMNS =
  "id, profile_id, akiles_member_id, akiles_token_id, platform, device_label, issued_at, last_seen_at, revoked_at, revoke_requested_at, last_error";

/** Gedeeld met device-tokens.ts: dezelfde DB, dezelfde Akiles-client, dezelfde events. */
export async function buildDeps(): Promise<SyncDeps> {
  return {
    db: buildDb(createAdminClient()),
    akiles: await getAkilesClient(),
    // emitEvent geeft sinds PR #193 een boolean terug; de sync-kern verwacht
    // void en negeert het resultaat bewust (emitEvent logt zelf).
    emit: async (event) => {
      await emitEvent({
        type: event.type,
        actorType: "system",
        subjectType: "profile",
        subjectId: event.subjectId,
        payload: event.payload,
      });
    },
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
    return await syncOneCore(await buildDeps(), profileId);
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

export async function syncAllAccess(options: SyncOptions = {}): Promise<SyncAllResult> {
  try {
    return await syncAllCore(await buildDeps(), options);
  } catch (err) {
    console.error("[access-sync] syncAllAccess threw", err);
    return {
      ok: false,
      notConfigured: false,
      processed: 0,
      skipped: 0,
      remaining: 0,
      failed: 0,
      failures: [],
      tokenRevocationsRetried: 0,
      tokenRevocationsFailed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
