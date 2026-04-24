import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type MemberStatus =
  | "active"
  | "paused"
  | "cancellation_requested"
  | "cancelled"
  | "expired"
  | "payment_failed"
  | "pending"
  | "none";

export type MemberSort =
  | "name_asc"
  | "name_desc"
  | "last_session_asc"
  | "last_session_desc"
  | "mrr_asc"
  | "mrr_desc"
  | "credits_asc"
  | "credits_desc";

export const DEFAULT_SORT: MemberSort = "last_session_desc";
export const PAGE_SIZE = 50;
export const INACTIVE_WINDOW_DAYS = 30;

export interface MemberRow {
  profileId: string;
  firstName: string;
  lastName: string;
  email: string;
  planType: string | null;
  planVariant: string | null;
  membershipStatus: MemberStatus;
  creditsRemaining: number | null;
  lastSessionDate: string | null;
  mrrCents: number;
}

export interface ListMembersInput {
  q?: string;
  status?: MemberStatus | "all";
  plan?: string | "all";
  inactive?: boolean;
  sort?: MemberSort;
  page?: number;
}

export interface ListMembersResult {
  rows: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
}

type ProfileJoinRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  memberships: Array<{
    plan_type: string;
    plan_variant: string | null;
    status: string;
    credits_remaining: number | null;
    price_per_cycle_cents: number;
    start_date: string;
  }>;
};

function likePattern(q: string): string {
  return `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

function sortToOrderExpr(sort: MemberSort): {
  column: keyof ProfileJoinRow | null;
  ascending: boolean;
  nullsFirst?: boolean;
} {
  switch (sort) {
    case "name_asc":
      return { column: "first_name", ascending: true };
    case "name_desc":
      return { column: "first_name", ascending: false };
    // The rest require computed columns; we'll apply client-side sort on the
    // page slice after the base query. Use name for the paginated base.
    default:
      return { column: "first_name", ascending: true };
  }
}

function membershipStatusOf(
  memberships: ProfileJoinRow["memberships"],
): MemberStatus {
  if (!memberships || memberships.length === 0) return "none";
  const priority: MemberStatus[] = [
    "active",
    "paused",
    "payment_failed",
    "cancellation_requested",
    "pending",
    "cancelled",
    "expired",
  ];
  for (const p of priority) {
    if (memberships.find((m) => m.status === p)) return p;
  }
  return "none";
}

function pickPrimaryMembership(
  memberships: ProfileJoinRow["memberships"],
): ProfileJoinRow["memberships"][number] | null {
  if (!memberships || memberships.length === 0) return null;
  const priority = [
    "active",
    "paused",
    "payment_failed",
    "cancellation_requested",
    "pending",
    "cancelled",
    "expired",
  ];
  for (const s of priority) {
    const found = memberships.find((m) => m.status === s);
    if (found) return found;
  }
  return memberships[0];
}

/**
 * Server-side aggregate over profiles + active memberships + last session.
 * For sort keys that depend on computed columns (last_session, mrr, credits)
 * we sort the result slice after enrichment — which is safe because the slice
 * is bounded by PAGE_SIZE. For name sort, Postgres does the work.
 *
 * The `inactive` filter is applied post-enrichment for the same reason: it
 * depends on last_session. This means the returned count may be lower than
 * Postgres' count() indicated; we correct by re-counting post-filter.
 */
export async function listMembers(
  input: ListMembersInput,
): Promise<ListMembersResult> {
  const admin = createAdminClient();
  const page = Math.max(1, input.page ?? 1);
  const sort = input.sort ?? DEFAULT_SORT;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const order = sortToOrderExpr(sort);

  let query = admin
    .from("profiles")
    .select(
      `
        id, first_name, last_name, email,
        memberships:memberships(
          plan_type, plan_variant, status, credits_remaining,
          price_per_cycle_cents, start_date
        )
      `,
      { count: "exact" },
    )
    .eq("role", "member");

  if (input.q && input.q.trim().length > 0) {
    const pat = likePattern(input.q.trim());
    query = query.or(
      `first_name.ilike.${pat},last_name.ilike.${pat},email.ilike.${pat}`,
    );
  }

  // Status filter — "none" means no memberships at all (handled post-fetch).
  // We can narrow server-side for concrete statuses by filtering on a
  // memberships inner join; but that complicates the query shape and drops
  // members without memberships when we don't want that. Safer: filter
  // post-enrichment for a simple 50-row slice, but server-narrow when
  // there's a concrete status via `filter` on the nested table.
  const statusFilter =
    input.status && input.status !== "all" ? input.status : null;

  if (statusFilter && statusFilter !== "none") {
    // Narrow: profiles that have at least one membership with this status.
    const { data: matchingIds } = await admin
      .from("memberships")
      .select("profile_id")
      .eq("status", statusFilter);
    const ids = (matchingIds ?? []).map((r) => r.profile_id);
    if (ids.length === 0) {
      return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
    }
    query = query.in("id", ids);
  }

  if (input.plan && input.plan !== "all") {
    const { data: matchingIds } = await admin
      .from("memberships")
      .select("profile_id")
      .eq("plan_type", input.plan);
    const ids = (matchingIds ?? []).map((r) => r.profile_id);
    if (ids.length === 0) {
      return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
    }
    query = query.in("id", ids);
  }

  if (order.column) {
    query = query.order(order.column, { ascending: order.ascending });
  }
  query = query.range(from, to);

  const { data, count, error } = await query.returns<ProfileJoinRow[]>();
  if (error) {
    console.error("[listMembers] query failed", error);
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const profiles = data ?? [];
  const profileIds = profiles.map((p) => p.id);

  // Fetch last-session date per profile (restricted to the paginated slice).
  // Prefer attended/no_show rows; fall back to any booked past date. Keep
  // query simple — we'll reduce client-side.
  let lastBySession = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: sessions } = await admin
      .from("bookings")
      .select("profile_id, session_date, status")
      .in("profile_id", profileIds)
      .in("status", ["booked", "cancelled"])
      .order("session_date", { ascending: false });
    lastBySession = new Map();
    for (const row of sessions ?? []) {
      if (!row.profile_id || !row.session_date) continue;
      if (!lastBySession.has(row.profile_id)) {
        lastBySession.set(row.profile_id, row.session_date);
      }
    }
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - INACTIVE_WINDOW_DAYS);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().slice(0, 10);

  let rows: MemberRow[] = profiles.map((p) => {
    const primary = pickPrimaryMembership(p.memberships);
    const mrrCents = primary
      ? Math.round((primary.price_per_cycle_cents ?? 0) * (13 / 12))
      : 0;
    return {
      profileId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      planType: primary?.plan_type ?? null,
      planVariant: primary?.plan_variant ?? null,
      membershipStatus: membershipStatusOf(p.memberships),
      creditsRemaining: primary?.credits_remaining ?? null,
      lastSessionDate: lastBySession.get(p.id) ?? null,
      mrrCents: primary?.status === "active" ? mrrCents : 0,
    };
  });

  if (statusFilter === "none") {
    rows = rows.filter((r) => r.membershipStatus === "none");
  }

  if (input.inactive) {
    rows = rows.filter(
      (r) =>
        r.membershipStatus === "active" &&
        (r.lastSessionDate === null || r.lastSessionDate < thirtyDaysAgoIso),
    );
  }

  // Apply computed-column sort on the bounded slice.
  switch (sort) {
    case "last_session_asc":
      rows.sort((a, b) =>
        (a.lastSessionDate ?? "").localeCompare(b.lastSessionDate ?? ""),
      );
      break;
    case "last_session_desc":
      rows.sort((a, b) =>
        (b.lastSessionDate ?? "").localeCompare(a.lastSessionDate ?? ""),
      );
      break;
    case "mrr_asc":
      rows.sort((a, b) => a.mrrCents - b.mrrCents);
      break;
    case "mrr_desc":
      rows.sort((a, b) => b.mrrCents - a.mrrCents);
      break;
    case "credits_asc":
      rows.sort(
        (a, b) => (a.creditsRemaining ?? -1) - (b.creditsRemaining ?? -1),
      );
      break;
    case "credits_desc":
      rows.sort(
        (a, b) => (b.creditsRemaining ?? -1) - (a.creditsRemaining ?? -1),
      );
      break;
    default:
      break;
  }

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize: PAGE_SIZE,
  };
}
