import {
  DEFAULT_SORT,
  PAGE_SIZE,
  listMembers,
  type MemberSort,
  type MemberStatus,
} from "@/lib/admin/members-query";
import { MembersToolbar } from "./_components/MembersToolbar";
import { MembersTable } from "./_components/MembersTable";
import { Pagination } from "./_components/Pagination";

export const metadata = {
  title: "Admin · Leden | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VALID_SORTS: MemberSort[] = [
  "name_asc",
  "name_desc",
  "last_session_asc",
  "last_session_desc",
  "mrr_asc",
  "mrr_desc",
  "credits_asc",
  "credits_desc",
];

const VALID_STATUSES: Array<MemberStatus | "all"> = [
  "all",
  "active",
  "paused",
  "cancellation_requested",
  "cancelled",
  "expired",
  "payment_failed",
  "pending",
  "none",
];

const VALID_PLANS = [
  "all",
  "vrij_trainen",
  "yoga_mobility",
  "kettlebell",
  "all_inclusive",
  "ten_ride_card",
  "pt_package",
  "twelve_week_program",
  "kids",
  "senior",
];

function parseSearchParams(sp: Record<string, string | string[] | undefined>) {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const q = get("q")?.trim() || "";
  const statusRaw = get("status") ?? "all";
  const status = (VALID_STATUSES as string[]).includes(statusRaw)
    ? (statusRaw as MemberStatus | "all")
    : "all";
  const planRaw = get("plan") ?? "all";
  const plan = VALID_PLANS.includes(planRaw) ? planRaw : "all";
  const inactive = get("inactive") === "1";
  const sortRaw = get("sort") ?? DEFAULT_SORT;
  const sort = (VALID_SORTS as string[]).includes(sortRaw)
    ? (sortRaw as MemberSort)
    : DEFAULT_SORT;
  const page = Math.max(1, Number(get("page") ?? "1") || 1);
  return { q, status, plan, inactive, sort, page };
}

export default async function AdminMembersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const parsed = parseSearchParams(searchParams);

  const result = await listMembers(parsed);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Leden.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {result.total} {result.total === 1 ? "lid" : "leden"} totaal
        </p>
      </header>

      <MembersToolbar
        q={parsed.q}
        status={parsed.status}
        plan={parsed.plan}
        inactive={parsed.inactive}
        sort={parsed.sort}
      />

      <MembersTable
        rows={result.rows}
        sort={parsed.sort}
        activeFilters={{
          q: parsed.q,
          status: parsed.status,
          plan: parsed.plan,
          inactive: parsed.inactive,
          page: parsed.page,
        }}
      />

      <Pagination
        currentPage={parsed.page}
        totalPages={totalPages}
        params={{
          q: parsed.q,
          status: parsed.status,
          plan: parsed.plan,
          inactive: parsed.inactive ? "1" : "",
          sort: parsed.sort,
        }}
      />
    </div>
  );
}
