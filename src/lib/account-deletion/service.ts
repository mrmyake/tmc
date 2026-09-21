import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { getAkilesClient } from "@/lib/akiles";
import { isAkilesNotFound } from "@/lib/access/types";
import { syncMembershipAccess } from "@/lib/access/sync";
import { revokeAllDeviceTokens } from "@/lib/access/device-tokens";
import { cancelMollieSubscription, deleteMollieCustomer } from "@/lib/mollie";
import {
  findSubscriberIdByEmail,
  forgetSubscriber,
  setSubscriberUnsubscribed,
} from "@/lib/mailerlite";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { cancelMembershipCore } from "@/lib/admin/membership-lifecycle";
import AccountDeleted from "@/emails/account_deleted";
import { AUTH_BAN_DURATION, getDeletionConfig } from "./config";
import {
  cancelDeletionRequestCore,
  processDueDeletionsCore,
  requestDeletionCore,
  runPurgeCore,
} from "./core";
import type {
  AnonymiseResult,
  DeletionDeps,
  DeletionProfileSnapshot,
  DeletionRow,
  DeletionRowPatch,
  MembershipCancelOutcome,
  ProcessResult,
  PurgeResult,
  RequestDeletionFailure,
  RequestDeletionResult,
} from "./types";

// De cookie-client (src/lib/supabase/server.ts) en de service-role-client
// dragen verschillende schema-generics; hier telt alleen .rpc().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/**
 * Wiring van de accountverwijdering op de echte service-role-client, de
 * Akiles-client, Mollie, MailerLite, storage en MailerSend. De regels staan
 * in core.ts; dit bestand vertaalt alleen.
 *
 * Drie ingangen:
 *  - requestAccountDeletionForMember: vanuit de server action van het lid.
 *    De opzegging loopt via tmc.request_membership_cancellation op de
 *    cookie-client van het lid (auth.uid()-gebonden), nooit via de
 *    service-role.
 *  - requestAccountDeletionByAdmin: de admin-hardstop (deleteMember).
 *    Memberships per direct via cancelMembershipCore(hardStop), daarna
 *    meteen een purge-run; wat dan nog open staat pakt de cron op.
 *  - processDueAccountDeletions: de cron.
 *
 * Alle Supabase-fouten worden een throw met tabelnaam; de kern vangt ze
 * per stap en zet ze in last_error.
 */

const OPEN_STATUSES = ["requested", "in_progress", "blocked"];
const LIVE_MEMBERSHIP_STATUSES = [
  "pending",
  "active",
  "paused",
  "cancellation_requested",
  "payment_failed",
];
const DELETION_COLUMNS =
  "id, profile_id, member_code, status, requested_via, reason, is_test, requested_at, purge_after, completed_at, cancelled_at, email_at_request, akiles_member_id, mollie_customer_id, mollie_subscription_ids, mailerlite_subscriber_id, step_status, last_error, attempts, last_attempt_at";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildDb(admin: SupabaseClient): DeletionDeps["db"] {
  return {
    async getProfileSnapshot(profileId): Promise<DeletionProfileSnapshot | null> {
      const { data, error } = await admin
        .from("profiles")
        .select(
          "id, member_code, email, role, is_test, first_name, mollie_customer_id, memberships(id, status, mollie_customer_id, mollie_subscription_id, commit_end_date, cancellation_effective_date, billing_cycle_weeks), access_credentials(akiles_member_id, akiles_magic_link_id)",
        )
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw new Error(`profiles lezen: ${error.message}`);
      if (!data) return null;
      const row = data as unknown as Omit<DeletionProfileSnapshot, "akiles_member_id" | "akiles_magic_link_id" | "memberships"> & {
        memberships: DeletionProfileSnapshot["memberships"] | null;
        access_credentials:
          | { akiles_member_id: string | null; akiles_magic_link_id: string | null }
          | Array<{ akiles_member_id: string | null; akiles_magic_link_id: string | null }>
          | null;
      };
      const cred = one(row.access_credentials);
      return {
        id: row.id,
        member_code: row.member_code,
        email: row.email,
        role: row.role,
        is_test: Boolean(row.is_test),
        first_name: row.first_name,
        mollie_customer_id: row.mollie_customer_id ?? null,
        akiles_member_id: cred?.akiles_member_id ?? null,
        akiles_magic_link_id: cred?.akiles_magic_link_id ?? null,
        memberships: row.memberships ?? [],
      };
    },
    async findOpenDeletion(profileId) {
      const { data, error } = await admin
        .from("account_deletions")
        .select(DELETION_COLUMNS)
        .eq("profile_id", profileId)
        .in("status", OPEN_STATUSES)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`account_deletions lezen: ${error.message}`);
      return (data as unknown as DeletionRow | null) ?? null;
    },
    async insertDeletion(row) {
      const { data, error } = await admin
        .from("account_deletions")
        .insert(row)
        .select(DELETION_COLUMNS)
        .single();
      if (error) throw new Error(`account_deletions schrijven: ${error.message}`);
      return data as unknown as DeletionRow;
    },
    async getDeletion(id) {
      const { data, error } = await admin
        .from("account_deletions")
        .select(DELETION_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`account_deletions lezen: ${error.message}`);
      return (data as unknown as DeletionRow | null) ?? null;
    },
    async updateDeletion(id, patch: DeletionRowPatch) {
      const { data, error } = await admin
        .from("account_deletions")
        .update(patch)
        .eq("id", id)
        .select(DELETION_COLUMNS)
        .single();
      if (error) throw new Error(`account_deletions bijwerken: ${error.message}`);
      return data as unknown as DeletionRow;
    },
    async listDueDeletions(nowIso) {
      const { data, error } = await admin
        .from("account_deletions")
        .select(DELETION_COLUMNS)
        .in("status", OPEN_STATUSES)
        .lte("purge_after", nowIso)
        .order("purge_after")
        .limit(50);
      if (error) throw new Error(`account_deletions lezen: ${error.message}`);
      return (data ?? []) as unknown as DeletionRow[];
    },
    async listCustomerRetentionDue(beforeIso) {
      const { data, error } = await admin
        .from("account_deletions")
        .select(DELETION_COLUMNS)
        .eq("status", "completed")
        .not("mollie_customer_id", "is", null)
        .lte("completed_at", beforeIso)
        .order("completed_at")
        .limit(50);
      if (error) throw new Error(`account_deletions lezen: ${error.message}`);
      return (data ?? []) as unknown as DeletionRow[];
    },

    async listLiveMemberships(profileId) {
      const { data, error } = await admin
        .from("memberships")
        .select(
          "id, status, mollie_customer_id, mollie_subscription_id, commit_end_date, cancellation_effective_date, billing_cycle_weeks",
        )
        .eq("profile_id", profileId)
        .in("status", LIVE_MEMBERSHIP_STATUSES);
      if (error) throw new Error(`memberships lezen: ${error.message}`);
      return (data ?? []) as unknown as DeletionProfileSnapshot["memberships"];
    },
    async cancelFutureBookings(profileId, todayIso, reason) {
      const { data, error } = await admin
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq("profile_id", profileId)
        .in("status", ["booked", "waitlisted"])
        .gte("session_date", todayIso)
        .select("id");
      if (error) throw new Error(`bookings annuleren: ${error.message}`);
      return (data ?? []).length;
    },
    async removeWaitlistEntries(profileId) {
      const { data, error } = await admin
        .from("waitlist_entries")
        .delete()
        .eq("profile_id", profileId)
        .select("id");
      if (error) throw new Error(`waitlist_entries verwijderen: ${error.message}`);
      return (data ?? []).length;
    },
    async cancelFuturePtBookings(profileId, nowIso, reason) {
      const { data, error } = await admin
        .from("pt_bookings")
        .select("id, pt_session:pt_sessions!pt_session_id(start_at)")
        .eq("profile_id", profileId)
        .in("status", ["pending", "booked"]);
      if (error) throw new Error(`pt_bookings lezen: ${error.message}`);
      const ids = (data ?? [])
        .filter((b) => {
          const session = one(b.pt_session as { start_at: string } | { start_at: string }[] | null);
          return session?.start_at && session.start_at >= nowIso;
        })
        .map((b) => b.id as string);
      if (ids.length === 0) return 0;
      const { error: upErr } = await admin
        .from("pt_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .in("id", ids);
      if (upErr) throw new Error(`pt_bookings annuleren (${reason}): ${upErr.message}`);
      return ids.length;
    },
    async cancelFutureGuestBookings(profileId, nowIso) {
      const { data, error } = await admin
        .from("guest_bookings")
        .select("id, session:class_sessions!session_id(start_at)")
        .eq("booked_by", profileId)
        .eq("status", "booked");
      if (error) throw new Error(`guest_bookings lezen: ${error.message}`);
      const ids = (data ?? [])
        .filter((b) => {
          const session = one(b.session as { start_at: string } | { start_at: string }[] | null);
          return session?.start_at && session.start_at >= nowIso;
        })
        .map((b) => b.id as string);
      if (ids.length === 0) return 0;
      const { error: upErr } = await admin
        .from("guest_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .in("id", ids);
      if (upErr) throw new Error(`guest_bookings annuleren: ${upErr.message}`);
      return ids.length;
    },
    async removePushTokens(profileId) {
      const { data, error } = await admin
        .from("device_push_tokens")
        .delete()
        .eq("profile_id", profileId)
        .select("id");
      if (error) throw new Error(`device_push_tokens verwijderen: ${error.message}`);
      return (data ?? []).length;
    },
    async setMarketingOptOut(profileId) {
      const { error } = await admin
        .from("profiles")
        .update({ marketing_opt_in: false })
        .eq("id", profileId);
      if (error) throw new Error(`profiles marketing_opt_in: ${error.message}`);
    },
    async hasOpenDeviceTokens(profileId) {
      const { data, error } = await admin
        .from("access_device_tokens")
        .select("id")
        .eq("profile_id", profileId)
        .is("revoked_at", null)
        .limit(1);
      if (error) throw new Error(`access_device_tokens lezen: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async hasFinancialHistory(profileId) {
      const [orders, invoices] = await Promise.all([
        admin.from("orders").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
        admin.from("invoices").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
      ]);
      if (orders.error) throw new Error(`orders tellen: ${orders.error.message}`);
      if (invoices.error) throw new Error(`invoices tellen: ${invoices.error.message}`);
      return (orders.count ?? 0) > 0 || (invoices.count ?? 0) > 0;
    },
    async latestInvoiceDate(profileId) {
      const { data, error } = await admin
        .from("invoices")
        .select("issued_at, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`invoices lezen: ${error.message}`);
      if (!data) return null;
      const row = data as { issued_at: string | null; created_at: string };
      return (row.issued_at ?? row.created_at).slice(0, 10);
    },
    async removeAvatar(profileId) {
      const bucket = admin.storage.from("tmc-avatars");
      const { data: files, error } = await bucket.list(profileId);
      if (error) throw new Error(`tmc-avatars lezen: ${error.message}`);
      if (!files || files.length === 0) return;
      const { error: rmErr } = await bucket.remove(files.map((f) => `${profileId}/${f.name}`));
      if (rmErr) throw new Error(`tmc-avatars verwijderen: ${rmErr.message}`);
    },
    async anonymiseProfile(profileId): Promise<AnonymiseResult> {
      const { data, error } = await admin.rpc("anonymise_profile", { p_profile_id: profileId });
      if (error) throw new Error(`anonymise_profile: ${error.message}`);
      return data as AnonymiseResult;
    },
    async hardDeleteAuthUser(profileId) {
      const { error } = await admin.auth.admin.deleteUser(profileId);
      if (error) throw new Error(`auth deleteUser: ${error.message}`);
    },
    async banAuthUser(profileId) {
      const { error } = await admin.auth.admin.updateUserById(profileId, {
        ban_duration: AUTH_BAN_DURATION,
      });
      if (error) throw new Error(`auth ban: ${error.message}`);
    },
    async unbanAuthUser(profileId) {
      const { error } = await admin.auth.admin.updateUserById(profileId, { ban_duration: "none" });
      if (error) throw new Error(`auth unban: ${error.message}`);
    },
  };
}

function buildDeps(
  admin: SupabaseClient,
  cancelMembership: DeletionDeps["cancelMembership"],
): DeletionDeps {
  return {
    db: buildDb(admin),
    cancelMembership,
    mollie: {
      cancelSubscription: (isTest, customerId, subscriptionId) =>
        cancelMollieSubscription(isTest ? "test" : "live", customerId, subscriptionId),
      deleteCustomer: (isTest, customerId) =>
        deleteMollieCustomer(isTest ? "test" : "live", customerId),
    },
    akiles: {
      syncAccess: async (profileId) => {
        const r = await syncMembershipAccess(profileId);
        return { ok: r.ok, error: r.error };
      },
      revokeAllDeviceTokens: (profileId, reason) => revokeAllDeviceTokens(profileId, reason),
      async deleteMember(profileId, akilesMemberId, pseudonym) {
        const akiles = await getAkilesClient();
        if (!akiles) return null;
        const { data: cred } = await admin
          .from("access_credentials")
          .select("akiles_magic_link_id")
          .eq("profile_id", profileId)
          .maybeSingle();
        const magicLinkId = (cred as { akiles_magic_link_id: string | null } | null)?.akiles_magic_link_id ?? null;
        try {
          // Naam eerst op een pseudoniem: Akiles bewaart de naam in zijn
          // eventhistorie, ook na een delete.
          await akiles.editMember(akilesMemberId, { name: pseudonym });
          if (magicLinkId) {
            try {
              await akiles.deleteMagicLink(akilesMemberId, magicLinkId);
            } catch (err) {
              if (!isAkilesNotFound(err)) throw err;
            }
          }
          await akiles.deleteMember(akilesMemberId);
        } catch (err) {
          if (!isAkilesNotFound(err)) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        // Lokale ids los: er is bij Akiles niets meer om naar te wijzen.
        const { error } = await admin
          .from("access_credentials")
          .update({
            akiles_member_id: null,
            akiles_pin_id: null,
            akiles_magic_link_id: null,
            access_group: null,
            updated_at: new Date().toISOString(),
          })
          .eq("profile_id", profileId);
        if (error) return { ok: false, error: `access_credentials: ${error.message}` };
        return { ok: true };
      },
    },
    mailerlite: {
      findSubscriberId: (email) => findSubscriberIdByEmail(email),
      forget: (id) => forgetSubscriber(id),
      unsubscribe: async (email) => (await setSubscriberUnsubscribed(email)) !== null,
    },
    sendClosingMail: (email) =>
      sendEmail({
        to: email,
        // COPY: confirm met Marlon
        subject: "Je account bij The Movement Club is verwijderd",
        react: AccountDeleted({ siteUrl: siteUrl() }),
      }),
    emit: async (event) => {
      await emitEvent({
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        subjectType: "profile",
        subjectId: event.profileId,
        payload: event.payload,
      });
    },
    notify: async (title, message) => {
      await sendNotification(title, message, "wastebasket");
    },
    now: () => new Date(),
    log: {
      info: (message, meta) => console.info(message, meta ?? ""),
      error: (message, meta) => console.error(message, meta ?? ""),
    },
  };
}

/** Opzegging als het lid zelf: de RPC controleert eigenaarschap op auth.uid(). */
function memberCancel(userClient: AnyClient): DeletionDeps["cancelMembership"] {
  return async (membershipId): Promise<MembershipCancelOutcome> => {
    const { data, error } = await userClient
      .rpc("request_membership_cancellation", { p_membership_id: membershipId })
      .select("cancellation_effective_date")
      .maybeSingle();
    if (error) return { ok: false, reason: error.message };
    return {
      ok: true,
      effectiveDate: (data as { cancellation_effective_date?: string | null } | null)
        ?.cancellation_effective_date ?? null,
    };
  };
}

/** Admin-hardstop: Mollie eerst, dan admin_cancel_membership met p_hard_stop. */
const adminCancel: DeletionDeps["cancelMembership"] = async (membershipId) => {
  const r = await cancelMembershipCore({
    membershipId,
    reason: "account_deletion",
    hardStop: true,
  });
  if (!r.ok) return { ok: false, reason: r.reason ?? r.message };
  return { ok: true, effectiveDate: r.effectiveDate ?? null };
};

export async function requestAccountDeletionForMember(
  profileId: string,
  reason: string | null,
  userClient: AnyClient,
): Promise<RequestDeletionResult> {
  const deps = buildDeps(createAdminClient(), memberCancel(userClient));
  return requestDeletionCore(deps, getDeletionConfig(), {
    profileId,
    requestedVia: "member_app",
    reason,
    actorType: "member",
    actorId: profileId,
  });
}

export async function requestAccountDeletionByAdmin(
  profileId: string,
  reason: string,
  adminUserId: string,
): Promise<{ ok: true; row: DeletionRow; purge: PurgeResult } | RequestDeletionFailure> {
  const deps = buildDeps(createAdminClient(), adminCancel);
  const config = getDeletionConfig();
  const requested = await requestDeletionCore(deps, config, {
    profileId,
    requestedVia: "admin",
    reason,
    actorType: "admin",
    actorId: adminUserId,
    hardStop: true,
  });
  if (!requested.ok) return requested;
  // Hardstop: niet op de cron wachten. Wat hier nog open blijft (Akiles
  // onbereikbaar, mail mislukt) herkanst de cron vannacht.
  const purge = await runPurgeCore(deps, config, requested.row);
  return { ok: true, row: purge.row, purge };
}

export async function processDueAccountDeletions(options: {
  deadlineMs: number;
}): Promise<ProcessResult> {
  // Vanuit de cron is er geen lid of admin; een membership die hier nog
  // niet op cancellation_requested staat wordt door de kern als blocked
  // gemeld, nooit stil geflipt.
  const deps = buildDeps(createAdminClient(), async () => ({
    ok: false,
    reason: "geen opzegpad vanuit de cron",
  }));
  return processDueDeletionsCore(deps, getDeletionConfig(), options);
}

export async function cancelAccountDeletionRequest(
  deletionId: string,
  actor: { actorType: "member" | "admin"; actorId: string | null },
) {
  const deps = buildDeps(createAdminClient(), async () => ({
    ok: false,
    reason: "niet van toepassing",
  }));
  return cancelDeletionRequestCore(deps, deletionId, actor);
}
