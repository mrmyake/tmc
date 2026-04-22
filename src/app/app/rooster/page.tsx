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
import { DayStrip } from "./_components/DayStrip";
import type { SessionStatus } from "./_components/StatusBadge";

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
  day?: string;
  pijler?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.week) qs.set("week", params.week);
  if (params.day) qs.set("day", params.day);
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

export default async function RoosterPage(props: {
  searchParams: Promise<{
    week?: string;
    day?: string;
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

  const todayIso = isoDate(now);
  const selectedDay = searchParams.day ?? (isCurrentWeek ? todayIso : undefined);

  const visibleSessions = sessions.filter((s) => {
    if (!selectedDay) return true;
    return isoDate(new Date(s.start_at)) === selectedDay;
  });

  const enriched = visibleSessions.map((s) => {
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

  const dayGroupsMap = new Map<string, typeof enriched>();
  for (const s of enriched) {
    const key = isoDate(new Date(s.startAt));
    if (!dayGroupsMap.has(key)) dayGroupsMap.set(key, []);
    dayGroupsMap.get(key)!.push(s);
  }
  const dayGroups = Array.from(dayGroupsMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, list]) => {
      const date = new Date(iso + "T00:00:00Z");
      return {
        isoDate: iso,
        label: `${DAY_LABELS[date.getUTCDay()]} ${date.getUTCDate()} ${date.toLocaleDateString("nl-NL", { month: "short", timeZone: "UTC" })}`,
        sessions: list,
      };
    });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = isoDate(d);
    const count = sessions.filter((s) => isoDate(new Date(s.start_at)) === iso)
      .length;
    return { date: d, isoDate: iso, sessionsCount: count };
  });

  const prevWeekStart = addDays(weekStart, -7);
  const nextWeekStart = addDays(weekStart, 7);
  const prevWeek = getIsoWeekYear(prevWeekStart);
  const nextWeek = getIsoWeekYear(nextWeekStart);

  const weekParam = `${viewWeek.isoYear}-W${String(viewWeek.isoWeek).padStart(2, "0")}`;
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

      <div className="mb-8">
        <DayStrip
          days={days}
          selectedIsoDate={selectedDay ?? ""}
          buildHref={(iso) =>
            buildHref({
              week: weekParam,
              day: iso,
              pijler: pillarFilter ?? undefined,
            })
          }
        />
      </div>

      <div className="mb-12">
        <FilterChips pillars={[...PILLARS]} />
      </div>

      <SessionList
        dayGroups={dayGroups}
        cancellationWindowHours={cancellationWindowHours}
      />

      {pillarFilter && (
        <p className="mt-10 text-text-muted text-xs">
          Filter actief: {PILLAR_LABELS[pillarFilter]}.
        </p>
      )}
    </Container>
  );
}
