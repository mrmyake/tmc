import { formatEuro } from "@/lib/crowdfunding-helpers";
import { amsterdamParts, DAY_SHORT_NL } from "@/lib/format-date";
import { createAdminClient } from "@/lib/supabase/admin";
import { KpiCard } from "./_components/KpiCard";
import {
  BezettingBarChart,
  type BezettingDay,
} from "./_components/BezettingBarChart";
import {
  ActivityFeed,
  type ActivityItem,
} from "./_components/ActivityFeed";
import { QuickTile } from "./_components/QuickTile";

export const metadata = {
  title: "Admin · Dashboard | The Movement Club",
  robots: { index: false, follow: false },
};

export const revalidate = 300;

// ---------- Date helpers ------------------------------------------------

function mondayOfThisWeekInAmsterdam(): Date {
  const now = new Date();
  const p = amsterdamParts(now);
  const wd = p.weekday === 0 ? 7 : p.weekday; // Sun=7, Mon=1..
  // Build a UTC date representing Amsterdam-today, subtract to get Monday.
  const amsToday = new Date(
    Date.UTC(p.year, p.month - 1, p.day),
  );
  amsToday.setUTCDate(amsToday.getUTCDate() - (wd - 1));
  return amsToday;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------- Page --------------------------------------------------------

export default async function AdminDashboardPage() {
  const admin = createAdminClient();
  const now = new Date();
  const weekStart = mondayOfThisWeekInAmsterdam();
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const [
    kpisRes,
    weekSessionsRes,
    weekBookingsCountRes,
    lastMembershipsRes,
    lastCancellationsRes,
    failedPaymentsRes,
    pendingPausesRes,
    openInvoicesRes,
    todaySessionsCountRes,
  ] = await Promise.all([
    // Materialized view — refreshed dagelijks via cron/refresh-kpis. Bevat
    // active_members, mrr_cents, fill_rate_week_pct, no_show_rate_30d_pct
    // en nog 6 andere metrics voor toekomstige uitbreidingen.
    admin
      .from("vw_admin_kpis")
      .select(
        "active_members, mrr_cents, fill_rate_week_pct, no_show_rate_30d_pct, refreshed_at",
      )
      .limit(1)
      .maybeSingle(),
    admin
      .from("class_sessions")
      .select("id, capacity")
      .eq("status", "scheduled")
      .neq("pillar", "vrij_trainen")
      .gte("start_at", weekStart.toISOString())
      .lt("start_at", weekEnd.toISOString()),
    admin
      .from("bookings")
      .select("id, session_date, pillar, status", { count: "exact" })
      .eq("status", "booked")
      .neq("pillar", "vrij_trainen")
      .gte("session_date", isoDate(weekStart))
      .lt("session_date", isoDate(weekEnd)),
    admin
      .from("memberships")
      .select(
        "id, plan_variant, status, created_at, profile:profiles(first_name, last_name)",
      )
      .order("created_at", { ascending: false })
      .limit(6),
    admin
      .from("memberships")
      .select(
        "id, plan_variant, cancellation_requested_at, profile:profiles(first_name, last_name)",
      )
      .eq("status", "cancellation_requested")
      .order("cancellation_requested_at", { ascending: false })
      .limit(4),
    admin
      .from("payments")
      .select(
        "id, amount_cents, status, paid_at, created_at, profile:profiles(first_name, last_name)",
      )
      .in("status", ["failed", "expired", "canceled"])
      .order("created_at", { ascending: false })
      .limit(4),
    admin
      .from("membership_pauses")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "expired", "open"]),
    admin
      .from("class_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .neq("pillar", "vrij_trainen")
      .gte("start_at", new Date(now.setHours(0, 0, 0, 0)).toISOString())
      .lt(
        "start_at",
        new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      ),
  ]);

  // KPI's uit de materialized view — één rij, dagelijks refreshed.
  const kpis = kpisRes.data;
  const activeMembers = kpis?.active_members ?? 0;
  const mrrMonthlyCents = Number(kpis?.mrr_cents ?? 0);
  const fillRateWeekPct = Number(kpis?.fill_rate_week_pct ?? 0);
  const noShowRatePct = Number(kpis?.no_show_rate_30d_pct ?? 0);

  // Live bezetting voor de bar-chart (chart toont current-week cadence,
  // niet rolling). Week-totals blijven ook live zodat de chart-subtekst
  // consistent is met de chart zelf.
  const weekCapacity = (weekSessionsRes.data ?? []).reduce(
    (sum, s) => sum + (s.capacity ?? 0),
    0,
  );
  const weekBooked = weekBookingsCountRes.count ?? 0;

  // Bar chart: bezetting per dag
  const bookingsByDate = new Map<string, number>();
  for (const b of weekBookingsCountRes.data ?? []) {
    const key = b.session_date;
    if (key) bookingsByDate.set(key, (bookingsByDate.get(key) ?? 0) + 1);
  }
  const capacityByDate = new Map<string, number>();
  for (const s of weekSessionsRes.data ?? []) {
    if (!s || !s.capacity) continue;
    // Need session date — re-derive from the session rows' start_at. Query above
    // doesn't select start_at; we add it now via a second small query if needed.
  }
  // Actually: we need start_at to group sessions per day. Re-fetch minimal
  // day info — the earlier query only took id+capacity. Do one narrow query.
  const { data: weekSessionsWithDate } = await admin
    .from("class_sessions")
    .select("capacity, start_at")
    .eq("status", "scheduled")
    .neq("pillar", "vrij_trainen")
    .gte("start_at", weekStart.toISOString())
    .lt("start_at", weekEnd.toISOString());

  for (const s of weekSessionsWithDate ?? []) {
    if (!s?.start_at || !s?.capacity) continue;
    const key = isoDate(new Date(s.start_at));
    capacityByDate.set(key, (capacityByDate.get(key) ?? 0) + s.capacity);
  }

  const bezettingDays: BezettingDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = isoDate(d);
    const parts = amsterdamParts(d);
    return {
      isoDate: iso,
      label: DAY_SHORT_NL[parts.weekday],
      booked: bookingsByDate.get(iso) ?? 0,
      capacity: capacityByDate.get(iso) ?? 0,
    };
  });

  // Activity feed
  type Joined<T> = T & {
    profile: { first_name?: string | null; last_name?: string | null } | null | Array<{ first_name?: string | null; last_name?: string | null }>;
  };
  const nameOf = (row: Joined<unknown>): string => {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Lid";
  };

  const activities: ActivityItem[] = [];
  for (const m of lastMembershipsRes.data ?? []) {
    activities.push({
      id: `membership-${m.id}`,
      tone: m.status === "active" ? "positive" : "neutral",
      at: m.created_at,
      title: `Nieuw lid: ${nameOf(m)}`,
      detail: `Abonnement ${m.plan_variant} · status ${m.status}`,
    });
  }
  for (const c of lastCancellationsRes.data ?? []) {
    if (!c.cancellation_requested_at) continue;
    activities.push({
      id: `cancel-${c.id}`,
      tone: "warning",
      at: c.cancellation_requested_at,
      title: `Opzegverzoek: ${nameOf(c)}`,
      detail: `Plan ${c.plan_variant}`,
    });
  }
  for (const p of failedPaymentsRes.data ?? []) {
    activities.push({
      id: `payment-${p.id}`,
      tone: "warning",
      at: p.paid_at ?? p.created_at,
      title: `Betaling gefaald: ${nameOf(p)}`,
      detail: `${formatEuro(Math.round(p.amount_cents / 100))} · ${p.status}`,
    });
  }
  activities.sort((a, b) => (a.at < b.at ? 1 : -1));
  const recentActivity = activities.slice(0, 8);

  // Quick tiles
  const pendingPauseCount = pendingPausesRes.count ?? 0;
  const openInvoiceCount = openInvoicesRes.count ?? 0;
  const todaySessionCount = todaySessionsCountRes.count ?? 0;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Dashboard.
        </h1>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-14">
        <KpiCard
          label="Actieve leden"
          value={activeMembers.toString()}
          hint="Lopende abonnementen"
        />
        <KpiCard
          label="MRR"
          value={formatEuro(Math.round(mrrMonthlyCents / 100))}
          hint="Geprorateerd vanuit 4-weekse cyclus"
        />
        <KpiCard
          label="Bezetting (7d rolling)"
          value={`${fillRateWeekPct}%`}
          hint={`Deze week: ${weekBooked} van ${weekCapacity} plekken`}
        />
        <KpiCard
          label="No-show rate"
          value={`${noShowRatePct}%`}
          hint="Laatste 30 dagen"
        />
      </div>

      {/* Chart + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 md:gap-8 mb-14">
        <section className="bg-bg-elevated p-6 md:p-8">
          <header className="mb-6">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
              Bezetting per dag
            </span>
            <h2 className="text-xl md:text-2xl font-medium text-text tracking-[-0.01em]">
              Deze week
            </h2>
          </header>
          <BezettingBarChart days={bezettingDays} />
        </section>

        <section className="bg-bg-elevated p-6 md:p-8">
          <header className="mb-6">
            <span className="tmc-eyebrow block mb-3">Activiteit</span>
            <h2 className="text-xl md:text-2xl font-medium text-text tracking-[-0.01em]">
              Recent
            </h2>
          </header>
          <ActivityFeed items={recentActivity} />
        </section>
      </div>

      {/* Quick tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <QuickTile
          label="Pauze-verzoeken"
          count={pendingPauseCount}
          href="/app/admin/pauzes"
          hint="In afwachting"
        />
        <QuickTile
          label="Openstaande facturen"
          count={openInvoiceCount}
          href="/app/admin/facturen"
          hint="Failed of open"
        />
        <QuickTile
          label="Vandaag in de studio"
          count={todaySessionCount}
          href="/app/admin/rooster"
          hint="Geplande groepslessen"
        />
      </div>
    </div>
  );
}
