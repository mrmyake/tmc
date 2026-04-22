import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  PILLARS,
  PILLAR_LABELS,
  type Pillar,
} from "@/lib/member/plan-coverage";
import { FilterChips } from "./_components/FilterChips";
import { SessionList } from "./_components/SessionList";
import { WeekNavigator } from "./_components/WeekNavigator";
import {
  OpenStudioStrip,
  type OpenStudioDay,
} from "./_components/OpenStudioStrip";
import type { SessionStatus } from "@/components/ui/StatusBadge";

export const metadata = {
  title: "Rooster | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  capacity: number;
  pillar: string;
  class_type: { name: string } | null;
  trainer: { display_name: string; bio: string | null } | null;
};

function startOfIsoWeek(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 1);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getIsoWeekYear(date: Date): { isoWeek: number; isoYear: number } {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { isoWeek, isoYear: target.getUTCFullYear() };
}

function isoWeekToDate(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (isoWeek - 1) * 7);
  return weekStart;
}

function parseWeekParam(
  param: string | undefined,
): { year: number; week: number } | null {
  if (!param) return null;
  const match = /^(\d{4})-W(\d{1,2})$/.exec(param);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

function buildHref(params: {
  week?: string;
  pijler?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.week) qs.set("week", params.week);
  if (params.pijler) qs.set("pijler", params.pijler);
  const query = qs.toString();
  return query ? `/app/rooster?${query}` : "/app/rooster";
}

const DAY_LABELS = [
  "Zondag",
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
];

const MONTH_LABELS = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

export default async function RoosterPage(props: {
  searchParams: Promise<{
    week?: string;
    pijler?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const currentWeek = getIsoWeekYear(now);
  const parsedOverride = parseWeekParam(searchParams.week);
  const viewWeek = parsedOverride
    ? { isoWeek: parsedOverride.week, isoYear: parsedOverride.year }
    : currentWeek;
  const weekStart = startOfIsoWeek(
    isoWeekToDate(viewWeek.isoYear, viewWeek.isoWeek),
  );
  const weekEnd = addDays(weekStart, 7);
  const isCurrentWeek =
    viewWeek.isoWeek === currentWeek.isoWeek &&
    viewWeek.isoYear === currentWeek.isoYear;

  const pillarFilter = (
    searchParams.pijler && (PILLARS as readonly string[]).includes(searchParams.pijler)
      ? (searchParams.pijler as Pillar)
      : null
  );

  const [sessionsResult, bookingsResult, waitlistResult, settingsResult] =
    await Promise.all([
      (() => {
        let q = supabase
          .from("class_sessions")
          .select(
            `
              id,
              start_at,
              end_at,
              status,
              capacity,
              pillar,
              class_type:class_types(name),
              trainer:trainers(display_name, bio)
            `,
          )
          .gte("start_at", weekStart.toISOString())
          .lt("start_at", weekEnd.toISOString())
          .order("start_at", { ascending: true });
        if (pillarFilter) q = q.eq("pillar", pillarFilter);
        return q.returns<SessionRow[]>();
      })(),
      supabase
        .from("bookings")
        .select("id, session_id, status")
        .eq("profile_id", user.id)
        .gte("session_date", isoDate(weekStart))
        .lt("session_date", isoDate(weekEnd))
        .in("status", ["booked", "cancelled"]),
      supabase
        .from("waitlist_entries")
        .select("id, session_id")
        .eq("profile_id", user.id)
        .is("expired_at", null),
      supabase
        .from("booking_settings")
        .select("cancellation_window_hours")
        .limit(1)
        .maybeSingle(),
    ]);

  if (sessionsResult.error) {
    console.error("[/app/rooster] sessions query failed", sessionsResult.error);
  }

  const sessions = sessionsResult.data ?? [];
  const bookingsBySession = new Map<string, { id: string; status: string }>();
  for (const b of bookingsResult.data ?? []) {
    if (b.status === "booked") {
      bookingsBySession.set(b.session_id, { id: b.id, status: b.status });
    }
  }
  const waitlistedSessions = new Set(
    (waitlistResult.data ?? []).map((w) => w.session_id),
  );

  const sessionIds = sessions.map((s) => s.id);
  const bookedCountsResult =
    sessionIds.length === 0
      ? { data: [] as { id: string; booked_count: number | null }[] }
      : await supabase
          .from("v_session_availability")
          .select("id, booked_count")
          .in("id", sessionIds);

  const bookedBySession = new Map<string, number>();
  for (const row of bookedCountsResult.data ?? []) {
    if (row.id) bookedBySession.set(row.id, row.booked_count ?? 0);
  }

  const cancellationWindowHours =
    settingsResult.data?.cancellation_window_hours ?? 6;

  const enriched = sessions.map((s) => {
    const booking = bookingsBySession.get(s.id);
    const waitlisted = waitlistedSessions.has(s.id);
    const bookedCount = bookedBySession.get(s.id) ?? 0;
    const start = new Date(s.start_at);
    let status: SessionStatus;
    if (start <= now) status = "past";
    else if (booking) status = "booked";
    else if (waitlisted) status = "waitlisted";
    else if (bookedCount >= s.capacity) status = "full";
    else if (s.status !== "scheduled") status = "cancelled";
    else status = "open";

    return {
      id: s.id,
      startAt: s.start_at,
      endAt: s.end_at,
      className: s.class_type?.name ?? "Sessie",
      trainerName: s.trainer?.display_name ?? "coach",
      trainerBio: s.trainer?.bio ?? null,
      pillar: s.pillar,
      capacity: s.capacity,
      bookedCount,
      status,
      bookingId: booking?.id ?? null,
    };
  });

  // Split open-studio day-sessions from regular class sessions — the rooster
  // renders vrij trainen as a separate strip of day pills, group classes as
  // the stacked weekly agenda below.
  const vrijTrainenByDate = new Map<string, (typeof enriched)[number]>();
  const regularEnriched = [] as typeof enriched;
  for (const s of enriched) {
    if (s.pillar === "vrij_trainen") {
      vrijTrainenByDate.set(isoDate(new Date(s.startAt)), s);
    } else {
      regularEnriched.push(s);
    }
  }

  const openStudioDays: OpenStudioDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = isoDate(d);
    const match = vrijTrainenByDate.get(iso);
    if (!match) {
      return {
        isoDate: iso,
        sessionId: "",
        startAt: d.toISOString(),
        state: "past" as const,
        bookingId: null,
      };
    }
    const state: "open" | "booked" | "past" =
      match.status === "past"
        ? "past"
        : match.status === "booked"
          ? "booked"
          : "open";
    return {
      isoDate: iso,
      sessionId: match.id,
      startAt: match.startAt,
      state,
      bookingId: match.bookingId,
    };
  }).filter((day) => day.sessionId !== "");

  // Build day groups for every day of the visible week, even empty ones, so
  // the editorial rhythm stays consistent and members see the full week at a
  // glance instead of needing to toggle days.
  const sessionsByDay = new Map<string, typeof enriched>();
  for (const s of regularEnriched) {
    const key = isoDate(new Date(s.startAt));
    if (!sessionsByDay.has(key)) sessionsByDay.set(key, []);
    sessionsByDay.get(key)!.push(s);
  }

  const dayGroups = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = isoDate(d);
    const dayLabel = DAY_LABELS[d.getUTCDay()];
    const monthLabel = MONTH_LABELS[d.getUTCMonth()];
    return {
      isoDate: iso,
      label: `${dayLabel} ${d.getUTCDate()} ${monthLabel}`,
      sessions: sessionsByDay.get(iso) ?? [],
    };
  });

  const prevWeekStart = addDays(weekStart, -7);
  const nextWeekStart = addDays(weekStart, 7);
  const prevWeek = getIsoWeekYear(prevWeekStart);
  const nextWeek = getIsoWeekYear(nextWeekStart);

  const prevWeekParam = `${prevWeek.isoYear}-W${String(prevWeek.isoWeek).padStart(2, "0")}`;
  const nextWeekParam = `${nextWeek.isoYear}-W${String(nextWeek.isoWeek).padStart(2, "0")}`;

  return (
    <Container className="py-16 md:py-20">
      <WeekNavigator
        isoWeek={viewWeek.isoWeek}
        isoYear={viewWeek.isoYear}
        isCurrentWeek={isCurrentWeek}
        prevHref={buildHref({ week: prevWeekParam, pijler: pillarFilter ?? undefined })}
        nextHref={buildHref({ week: nextWeekParam, pijler: pillarFilter ?? undefined })}
        todayHref={buildHref({ pijler: pillarFilter ?? undefined })}
      />

      {openStudioDays.length > 0 && <OpenStudioStrip days={openStudioDays} />}

      <div className="mb-12">
        <FilterChips
          pillars={PILLARS.filter((p) => p !== "vrij_trainen")}
        />
      </div>

      <SessionList
        dayGroups={dayGroups}
        cancellationWindowHours={cancellationWindowHours}
      />

      {pillarFilter && sessions.length > 0 && (
        <p className="mt-10 text-text-muted text-xs">
          Filter actief: {PILLAR_LABELS[pillarFilter]}.
        </p>
      )}
    </Container>
  );
}
