import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { STEP_NAMES, type StepName, type StepState } from "@/lib/account-deletion/types";

/**
 * Leesdeel voor de admin-lijst op /app/admin/verwijderverzoeken. Puur
 * lezen op de service-role-client, geen mutaties en geen aanraking van de
 * kern (src/lib/account-deletion/core.ts); alleen de types daarvandaan
 * (STEP_NAMES) worden hergebruikt zodat de kolommen niet uit de pas lopen
 * als er ooit een stap bijkomt.
 */

export interface AccountDeletionStep {
  name: StepName;
  state: StepState | null;
  error: string | null;
}

export interface AccountDeletionListRow {
  id: string;
  profileId: string | null;
  memberCode: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  requestedVia: string;
  requestedAt: string;
  purgeAfter: string;
  completedAt: string | null;
  cancelledAt: string | null;
  attempts: number;
  /**
   * Laatste betaalde dag van een opgezegd abonnement, als de sluiting daar
   * nog op wacht (step_status.freeze = 'pending'). null als de sluiting
   * direct was, al is uitgevoerd, of is mislukt.
   */
  closesOn: string | null;
  steps: AccountDeletionStep[];
}

const OPEN_STATUSES = ["requested", "in_progress", "blocked"];

function buildSteps(
  stepStatus: Partial<Record<StepName, StepState>> | null,
  lastError: Partial<Record<StepName, string>> | null,
): AccountDeletionStep[] {
  return STEP_NAMES.map((name) => ({
    name,
    state: stepStatus?.[name] ?? null,
    error: lastError?.[name] ?? null,
  }));
}

interface DeletionSelectRow {
  id: string;
  profile_id: string | null;
  member_code: string;
  status: string;
  requested_via: string;
  requested_at: string;
  purge_after: string;
  completed_at: string | null;
  cancelled_at: string | null;
  attempts: number;
  step_status: Partial<Record<StepName, StepState>> | null;
  last_error: Partial<Record<StepName, string>> | null;
  profile: { first_name: string; last_name: string; email: string } | { first_name: string; last_name: string; email: string }[] | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function withClosesOn(
  admin: ReturnType<typeof createAdminClient>,
  rows: DeletionSelectRow[],
): Promise<Map<string, string | null>> {
  const pendingProfileIds = rows
    .filter((r) => r.step_status?.freeze === "pending" && r.profile_id)
    .map((r) => r.profile_id as string);
  if (pendingProfileIds.length === 0) return new Map();

  const { data, error } = await admin
    .from("memberships")
    .select("profile_id, billing_cycle_weeks, status, cancellation_effective_date")
    .in("profile_id", pendingProfileIds)
    .eq("status", "cancellation_requested")
    .gt("billing_cycle_weeks", 0);
  if (error) throw new Error(`memberships lezen (closesOn): ${error.message}`);

  const byProfile = new Map<string, string | null>();
  for (const m of (data ?? []) as Array<{
    profile_id: string;
    cancellation_effective_date: string | null;
  }>) {
    const current = byProfile.get(m.profile_id) ?? null;
    if (m.cancellation_effective_date && (!current || m.cancellation_effective_date > current)) {
      byProfile.set(m.profile_id, m.cancellation_effective_date);
    }
  }
  return byProfile;
}

function toListRow(row: DeletionSelectRow, closesOn: string | null): AccountDeletionListRow {
  const profile = one(row.profile);
  return {
    id: row.id,
    profileId: row.profile_id,
    memberCode: row.member_code,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    email: profile?.email ?? null,
    status: row.status,
    requestedVia: row.requested_via,
    requestedAt: row.requested_at,
    purgeAfter: row.purge_after,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    attempts: row.attempts,
    closesOn,
    steps: buildSteps(row.step_status, row.last_error),
  };
}

const SELECT =
  "id, profile_id, member_code, status, requested_via, requested_at, purge_after, completed_at, cancelled_at, attempts, step_status, last_error, profile:profiles!profile_id(first_name, last_name, email)";

export interface AccountDeletionLists {
  open: AccountDeletionListRow[];
  history: AccountDeletionListRow[];
}

/** Open verzoeken (oudste eerst, zodat het langst wachtende bovenaan staat) en de laatste 25 afgeronde of ingetrokken verzoeken. */
export async function listAccountDeletions(): Promise<AccountDeletionLists> {
  const admin = createAdminClient();

  const [openResult, historyResult] = await Promise.all([
    admin.from("account_deletions").select(SELECT).in("status", OPEN_STATUSES).order("requested_at", { ascending: true }),
    admin
      .from("account_deletions")
      .select(SELECT)
      .in("status", ["completed", "cancelled"])
      .order("requested_at", { ascending: false })
      .limit(25),
  ]);
  if (openResult.error) throw new Error(`account_deletions lezen: ${openResult.error.message}`);
  if (historyResult.error) throw new Error(`account_deletions lezen: ${historyResult.error.message}`);

  const openRows = (openResult.data ?? []) as unknown as DeletionSelectRow[];
  const historyRows = (historyResult.data ?? []) as unknown as DeletionSelectRow[];
  const closesOnByProfile = await withClosesOn(admin, openRows);

  return {
    open: openRows.map((r) => toListRow(r, r.profile_id ? (closesOnByProfile.get(r.profile_id) ?? null) : null)),
    history: historyRows.map((r) => toListRow(r, null)),
  };
}
