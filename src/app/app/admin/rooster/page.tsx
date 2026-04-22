import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { amsterdamParts, DAY_SHORT_NL, MONTH_SHORT_NL } from "@/lib/format-date";
import { RoosterEditorClient } from "./RoosterEditorClient";
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  type AdminClassTypeOption,
  type AdminDay,
  type AdminSessionBlockData,
  type AdminTrainerOption,
} from "./_components/types";

export const metadata = {
  title: "Admin · Rooster | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------- Date + ISO-week helpers -----------------------------------------

/** Monday (UTC midnight) of the ISO week that contains `date`. */
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

function weekParam(y: number, w: number): string {
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function isoDateAms(date: Date): string {
  const p = amsterdamParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// ---------- Page ------------------------------------------------------------

type SessionRow = {
  id: string;
  class_type_id: string;
  trainer_id: string;
  start_at: string;
  end_at: string;
  status: "scheduled" | "cancelled" | "completed";
  capacity: number;
  pillar: string;
  age_category: string;
  notes: string | null;
  class_type: { name: string } | null;
  trainer: { display_name: string } | null;
};

type AvailabilityRow = {
  id: string;
  booked_count: number | null;
};

export default async function AdminRoosterPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const searchParams = await props.searchParams;
  const admin = createAdminClient();

  const now = new Date();
  const currentWeek = getIsoWeekYear(now);
  const parsed = parseWeekParam(searchParams.week);
  const viewWeek = parsed
    ? { isoWeek: parsed.week, isoYear: parsed.year }
    : currentWeek;
  const weekStart = startOfIsoWeek(
    isoWeekToDate(viewWeek.isoYear, viewWeek.isoWeek),
  );
  const weekEnd = addDays(weekStart, 7);
  const isCurrentWeek =
    viewWeek.isoWeek === currentWeek.isoWeek &&
    viewWeek.isoYear === currentWeek.isoYear;

  const prevRef = new Date(weekStart);
  prevRef.setUTCDate(prevRef.getUTCDate() - 7);
  const nextRef = new Date(weekStart);
  nextRef.setUTCDate(nextRef.getUTCDate() + 7);
  const prev = getIsoWeekYear(prevRef);
  const next = getIsoWeekYear(nextRef);

  const [sessionsRes, trainersRes, classTypesRes] = await Promise.all([
    admin
      .from("class_sessions")
      .select(
        `
          id,
          class_type_id,
          trainer_id,
          start_at,
          end_at,
          status,
          capacity,
          pillar,
          age_category,
          notes,
          class_type:class_types(name),
          trainer:trainers(display_name)
        `,
      )
      .gte("start_at", weekStart.toISOString())
      .lt("start_at", weekEnd.toISOString())
      .order("start_at", { ascending: true })
      .returns<SessionRow[]>(),
    admin
      .from("trainers")
      .select("id, display_name, is_active")
      .order("display_name", { ascending: true }),
    admin
      .from("class_types")
      .select(
        "id, name, pillar, age_category, default_capacity, default_duration_minutes, is_active",
      )
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const availability =
    sessionIds.length === 0
      ? { data: [] as AvailabilityRow[] }
      : await admin
          .from("v_session_availability")
          .select("id, booked_count")
          .in("id", sessionIds);
  const bookedBy = new Map<string, number>();
  for (const r of availability.data ?? []) {
    if (r.id) bookedBy.set(r.id, r.booked_count ?? 0);
  }

  // Build 7-day skeleton with Amsterdam-local day keys.
  const todayKey = isoDateAms(now);
  const days: AdminDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const parts = amsterdamParts(date);
    return {
      isoDate: isoDateAms(date),
      weekdayShort: DAY_SHORT_NL[parts.weekday],
      dayNumber: parts.day,
      monthShort: MONTH_SHORT_NL[parts.month - 1],
      isToday: isoDateAms(date) === todayKey,
      sessions: [],
    };
  });
  const dayByKey = new Map(days.map((d) => [d.isoDate, d]));

  for (const s of sessions) {
    const start = new Date(s.start_at);
    const end = new Date(s.end_at);
    const sp = amsterdamParts(start);
    const ep = amsterdamParts(end);
    const key = `${sp.year}-${String(sp.month).padStart(2, "0")}-${String(sp.day).padStart(2, "0")}`;
    const dayBucket = dayByKey.get(key);
    if (!dayBucket) continue;
    const startOffsetMin =
      (sp.hour - GRID_START_HOUR) * 60 + sp.minute;
    // If session is outside grid (before 06:00 or after 22:00), clamp.
    if (sp.hour >= GRID_END_HOUR) continue;
    if (sp.hour < GRID_START_HOUR) continue;

    const rawDuration = Math.round(
      (end.getTime() - start.getTime()) / 60_000,
    );
    // Duration fallback using AMS wall-clock when dates cross DST (rare).
    const wallDuration =
      (ep.hour * 60 + ep.minute) - (sp.hour * 60 + sp.minute);
    const durationMin = rawDuration > 0 ? rawDuration : wallDuration;

    const block: AdminSessionBlockData = {
      id: s.id,
      classTypeId: s.class_type_id,
      className: s.class_type?.name ?? "Sessie",
      trainerId: s.trainer_id,
      trainerName: s.trainer?.display_name ?? "—",
      pillar: s.pillar,
      ageCategory: s.age_category,
      capacity: s.capacity,
      bookedCount: bookedBy.get(s.id) ?? 0,
      startAt: s.start_at,
      endAt: s.end_at,
      status: s.status,
      notes: s.notes,
      startOffsetMin,
      durationMin,
      startLabel: `${String(sp.hour).padStart(2, "0")}:${String(sp.minute).padStart(2, "0")}`,
    };
    dayBucket.sessions.push(block);
  }

  const trainers: AdminTrainerOption[] = (trainersRes.data ?? []).map((t) => ({
    id: t.id,
    displayName: t.display_name,
    isActive: t.is_active,
  }));

  const classTypes: AdminClassTypeOption[] = (classTypesRes.data ?? []).map(
    (c) => ({
      id: c.id,
      name: c.name,
      pillar: c.pillar,
      ageCategory: c.age_category,
      defaultCapacity: c.default_capacity,
      defaultDurationMinutes: c.default_duration_minutes,
    }),
  );

  const startParts = amsterdamParts(weekStart);
  const endParts = amsterdamParts(addDays(weekStart, 6));
  const rangeLabel =
    startParts.month === endParts.month
      ? `${startParts.day} – ${endParts.day} ${MONTH_SHORT_NL[startParts.month - 1]} ${startParts.year}`
      : `${startParts.day} ${MONTH_SHORT_NL[startParts.month - 1]} – ${endParts.day} ${MONTH_SHORT_NL[endParts.month - 1]} ${startParts.year}`;

  // Default date for "Nieuwe sessie" = today (if current week) or Monday of viewed week.
  const defaultNewDate = isCurrentWeek ? todayKey : days[0]?.isoDate ?? todayKey;

  const prevHref = `/app/admin/rooster?week=${weekParam(prev.isoYear, prev.isoWeek)}`;
  const nextHref = `/app/admin/rooster?week=${weekParam(next.isoYear, next.isoWeek)}`;
  const todayHref = `/app/admin/rooster`;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Rooster · Week {viewWeek.isoWeek} · {viewWeek.isoYear}
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
            {isCurrentWeek ? "Deze week." : `Week ${viewWeek.isoWeek}.`}
          </h1>
          <p className="tmc-eyebrow mt-3">{rangeLabel}</p>
        </div>
        <nav aria-label="Weeknavigatie" className="flex flex-wrap items-center gap-2">
          <Link
            href={prevHref}
            className="inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
          >
            Vorige
          </Link>
          {!isCurrentWeek && (
            <Link
              href={todayHref}
              className="inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
            >
              Vandaag
            </Link>
          )}
          <Link
            href={nextHref}
            className="inline-flex items-center gap-2 px-4 py-3 border border-text-muted/30 text-text-muted text-xs uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
          >
            Volgende
          </Link>
        </nav>
      </header>

      <RoosterEditorClient
        days={days}
        trainers={trainers}
        classTypes={classTypes}
        sanityStudioUrl="/studio/structure/schedule"
        defaultNewDate={defaultNewDate}
      />
    </div>
  );
}
