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

/**
 * Verlengde-toegang-toestand van de primaire membership, afgeleid uit
 * `memberships.extended_access` (de boolean op de rij) gecombineerd met
 * `tmc.catalogue.extended_access_mode` van het plan (`plan_variant`).
 *
 * - `included`: mode `included`, boolean true (All Access).
 * - `addon`: mode `addon`, boolean true (betaalde add-on op Vrij Trainen).
 * - `addon_available`: mode `addon`, boolean false (add-on mogelijk).
 * - `na`: mode `na` (groepslessen/kids/senior), of een catalogusrij van een
 *   ander soort dan `plan` (rittenkaart, PT-pakket) waar de mode NULL is.
 * - `catalogue_missing`: geen catalogusrij voor `plan_variant`. Dat is een
 *   datafout, geen normale toestand; wordt server-side gelogd.
 * - `inconsistent`: mode `included` maar boolean false. Ook een datafout
 *   (activate_order zet de boolean bij All Access altijd op true); gelogd.
 * - `no_membership`: geen enkele membership-rij voor dit profiel.
 */
export type ExtendedAccessState =
  | "included"
  | "addon"
  | "addon_available"
  | "na"
  | "catalogue_missing"
  | "inconsistent"
  | "no_membership";

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
  /** Van de primaire membership, ongeacht status. Sinds PR #164 inbegrepen
   * bij elk All Access-abonnement, optioneel add-on op Vrij Trainen. */
  extendedAccess: boolean;
  /** Vier-plus-twee-toestanden-afleiding, zie `ExtendedAccessState`. */
  extendedAccessState: ExtendedAccessState;
}

export interface ListMembersInput {
  q?: string;
  status?: MemberStatus | "all";
  plan?: string | "all";
  inactive?: boolean;
  /** Orthogonale filteras: alleen profielen met minstens één membership
   * waar `extended_access = true`. Combineert via ids-intersectie met de
   * status- en planfilters. */
  extendedAccess?: boolean;
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
    extended_access: boolean;
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

type CatalogueMode = "included" | "addon" | "na" | null;

function resolveExtendedAccessState(
  profileId: string,
  primary: ProfileJoinRow["memberships"][number] | null,
  modeBySlug: Map<string, CatalogueMode>,
): ExtendedAccessState {
  if (!primary) return "no_membership";

  const variant = primary.plan_variant;
  const hasRow = variant != null && modeBySlug.has(variant);
  if (!hasRow) {
    // Datafout: een membership zonder (herleidbare) catalogusrij. Geen
    // stille fallback op plan_type; expliciet loggen en tonen.
    console.error("[listMembers] geen catalogusrij voor plan_variant", {
      profileId,
      plan_variant: variant,
    });
    return "catalogue_missing";
  }

  const mode = modeBySlug.get(variant as string) ?? null;
  // Rijen van een ander soort dan plan (rittenkaart, PT-pakket) hebben
  // mode NULL in de check-constraint; verlengde toegang bestaat daar niet.
  if (mode === "na" || mode === null) return "na";
  if (mode === "included") {
    if (primary.extended_access) return "included";
    // Plan zegt inbegrepen, rij zegt false: de data spreekt zichzelf tegen.
    // Niet stil naar een van beide kanten afronden; loggen en tonen.
    console.error("[listMembers] extended_access false op included-plan", {
      profileId,
      plan_variant: variant,
    });
    return "inconsistent";
  }
  // mode === "addon"
  return primary.extended_access ? "addon" : "addon_available";
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
          price_per_cycle_cents, start_date, extended_access
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

  // Verlengde-toegang-filter, zelfde patroon als de statusfilter hierboven:
  // een losse ongepagineerde query op memberships die alleen profile_id
  // ophaalt, daarna ids-intersectie op de hoofdquery.
  if (input.extendedAccess) {
    const { data: matchingIds } = await admin
      .from("memberships")
      .select("profile_id")
      .eq("extended_access", true);
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

  // Catalogus-lookup voor de verlengde-toegang-toestand: één gerichte query
  // op tmc.catalogue voor de plan_variants van de primaire memberships in
  // deze pagina-slice. Bewust geen extra join op de hoofdquery en bewust
  // geen fallback op plan_type: een ontbrekende catalogusrij is een
  // datafout die zichtbaar moet blijven (state `catalogue_missing`).
  const primaryByProfile = new Map<
    string,
    ProfileJoinRow["memberships"][number] | null
  >();
  for (const p of profiles) {
    primaryByProfile.set(p.id, pickPrimaryMembership(p.memberships));
  }
  const variantSlugs = Array.from(
    new Set(
      Array.from(primaryByProfile.values())
        .map((m) => m?.plan_variant)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const modeBySlug = new Map<string, CatalogueMode>();
  if (variantSlugs.length > 0) {
    const { data: catalogueRows, error: catalogueErr } = await admin
      .from("catalogue")
      .select("slug, extended_access_mode")
      .in("slug", variantSlugs);
    if (catalogueErr) {
      console.error("[listMembers] catalogue lookup failed", catalogueErr);
    }
    for (const row of catalogueRows ?? []) {
      modeBySlug.set(row.slug, (row.extended_access_mode ?? null) as CatalogueMode);
    }
  }

  let rows: MemberRow[] = profiles.map((p) => {
    const primary = primaryByProfile.get(p.id) ?? null;
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
      extendedAccess: primary?.extended_access ?? false,
      extendedAccessState: resolveExtendedAccessState(
        p.id,
        primary,
        modeBySlug,
      ),
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
