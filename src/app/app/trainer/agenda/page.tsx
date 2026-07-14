import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import { getAgendaSessions } from "@/lib/trainer/pt-agenda-actions";
import { getPtBusy } from "@/lib/admin/pt-busy-actions";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  parseIsoDateToAmsterdamMidnight,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import { AgendaScreen } from "./_components/AgendaScreen";
import { layoutDayOverlaps } from "./_components/overlap-layout";
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  type AgendaDay,
  type AgendaSessionBlockData,
  type AgendaViewMode,
  type TrainerOption,
} from "./_components/types";

export const metadata = {
  title: "PT-agenda | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------- Date + ISO-week helpers (zelfde patroon als admin/rooster) -----

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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function isoDateAms(date: Date): string {
  const p = amsterdamParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

interface RangeResult {
  rangeStart: Date;
  rangeEnd: Date;
  /** Alleen relevant voor maandweergave: dagen buiten de getoonde maand worden gedimd. */
  currentMonth: number;
}

function computeRange(view: AgendaViewMode, anchor: Date): RangeResult {
  const anchorParts = amsterdamParts(anchor);
  if (view === "day") {
    return {
      rangeStart: anchor,
      rangeEnd: addDays(anchor, 1),
      currentMonth: anchorParts.month,
    };
  }
  if (view === "month") {
    const firstOfMonth = new Date(
      Date.UTC(anchorParts.year, anchorParts.month - 1, 1),
    );
    const lastOfMonth = new Date(
      Date.UTC(anchorParts.year, anchorParts.month, 0),
    );
    const gridStart = startOfIsoWeek(firstOfMonth);
    const lastRowStart = startOfIsoWeek(lastOfMonth);
    return {
      rangeStart: gridStart,
      rangeEnd: addDays(lastRowStart, 7),
      currentMonth: anchorParts.month,
    };
  }
  const weekStart = startOfIsoWeek(anchor);
  return {
    rangeStart: weekStart,
    rangeEnd: addDays(weekStart, 7),
    currentMonth: anchorParts.month,
  };
}

function navHref(
  view: AgendaViewMode,
  anchorIso: string,
  trainerId: string | null,
  deltaDays: number,
  deltaMonths = 0,
): string {
  const anchor = parseIsoDateToAmsterdamMidnight(anchorIso) ?? new Date();
  const shifted =
    deltaMonths !== 0 ? addMonths(anchor, deltaMonths) : addDays(anchor, deltaDays);
  const params = new URLSearchParams({
    view,
    date: isoDateAms(shifted),
  });
  if (trainerId) params.set("trainerId", trainerId);
  return `/app/trainer/agenda?${params.toString()}`;
}

// ---------- Page --------------------------------------------------------

interface TrainerRow {
  id: string;
  display_name: string;
  slug: string;
  is_active: boolean;
}

export default async function TrainerAgendaPage(props: {
  searchParams: Promise<{ view?: string; date?: string; trainerId?: string }>;
}) {
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) redirect("/app");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const searchParams = await props.searchParams;
  const view: AgendaViewMode =
    searchParams.view === "day" || searchParams.view === "month"
      ? searchParams.view
      : "week";
  const anchorIso = searchParams.date ?? todayIsoAmsterdam();
  const anchor =
    parseIsoDateToAmsterdamMidnight(anchorIso) ??
    parseIsoDateToAmsterdamMidnight(todayIsoAmsterdam())!;

  const [{ data: ownTrainerRow }, { data: allTrainersRows }] =
    await Promise.all([
      admin
        .from("trainers")
        .select("id, display_name, slug, is_active")
        .eq("profile_id", user.id)
        .eq("is_active", true)
        .maybeSingle<TrainerRow>(),
      gate.actorType === "admin"
        ? admin
            .from("trainers")
            .select("id, display_name, slug, is_active")
            .eq("is_active", true)
            .order("display_order", { ascending: true })
            .returns<TrainerRow[]>()
        : Promise.resolve({ data: null }),
    ]);

  const isAdmin = gate.actorType === "admin";
  const trainerOptions: TrainerOption[] = isAdmin
    ? (allTrainersRows ?? []).map((t) => ({
        id: t.id,
        displayName: t.display_name,
        slug: t.slug,
      }))
    : ownTrainerRow
      ? [{ id: ownTrainerRow.id, displayName: ownTrainerRow.display_name, slug: ownTrainerRow.slug }]
      : [];

  // Een trainer (niet-admin) kan het trainerId-queryparam niet gebruiken
  // om andermans agenda te bekijken — altijd de eigen rij.
  const requestedTrainerId = isAdmin ? searchParams.trainerId : undefined;
  const defaultTrainerId = isAdmin
    ? (ownTrainerRow?.id ??
        trainerOptions.find((t) => t.slug === "marlon")?.id ??
        trainerOptions[0]?.id ??
        null)
    : (ownTrainerRow?.id ?? null);
  const selectedTrainerId =
    requestedTrainerId && trainerOptions.some((t) => t.id === requestedTrainerId)
      ? requestedTrainerId
      : defaultTrainerId;

  if (!selectedTrainerId) {
    // Geen actieve trainers-rij te vinden — admin zonder trainer-rij zou
    // hier niet moeten landen (roleRedirect stuurt die naar /app/admin),
    // dus dit is een randgeval (bv. de eigen rij is net gedeactiveerd).
    redirect("/app");
  }

  const { rangeStart, rangeEnd, currentMonth } = computeRange(view, anchor);
  const rangeStartIso = rangeStart.toISOString();
  const rangeEndIso = rangeEnd.toISOString();

  const [sessions, busyBlocks] = await Promise.all([
    getAgendaSessions(selectedTrainerId, rangeStartIso, rangeEndIso),
    getPtBusy(selectedTrainerId, rangeStartIso, rangeEndIso),
  ]);

  const busyBySessionId = new Map(busyBlocks.map((b) => [b.ptSessionId, b]));
  const todayKey = isoDateAms(new Date());

  const dayCount = Math.round(
    (rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000,
  );
  const days: AgendaDay[] = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(rangeStart, i);
    const parts = amsterdamParts(date);
    return {
      isoDate: isoDateAms(date),
      weekdayShort: DAY_SHORT_NL[parts.weekday],
      dayNumber: parts.day,
      monthShort: MONTH_SHORT_NL[parts.month - 1],
      isToday: isoDateAms(date) === todayKey,
      isCurrentMonth: parts.month === currentMonth,
      sessions: [],
    };
  });
  const dayByKey = new Map(days.map((d) => [d.isoDate, d]));

  for (const s of sessions) {
    const start = new Date(s.startAt);
    const sp = amsterdamParts(start);
    const key = isoDateAms(start);
    const dayBucket = dayByKey.get(key);
    if (!dayBucket) continue;
    if (sp.hour >= GRID_END_HOUR || sp.hour < GRID_START_HOUR) continue;

    const busy = busyBySessionId.get(s.id);
    const bufferBeforeMin = busy
      ? Math.round(
          (new Date(s.startAt).getTime() - new Date(busy.blockedFrom).getTime()) /
            60_000,
        )
      : 0;
    const bufferAfterMin = busy
      ? Math.round(
          (new Date(busy.blockedUntil).getTime() - new Date(s.endAt).getTime()) /
            60_000,
        )
      : 0;

    const block: AgendaSessionBlockData = {
      ...s,
      startOffsetMin: (sp.hour - GRID_START_HOUR) * 60 + sp.minute,
      startLabel: `${String(sp.hour).padStart(2, "0")}:${String(sp.minute).padStart(2, "0")}`,
      bufferBeforeMin: Math.max(0, bufferBeforeMin),
      bufferAfterMin: Math.max(0, bufferAfterMin),
      lane: 0,
      laneCount: 1,
      overlapping: false,
    };
    dayBucket.sessions.push(block);
  }

  for (const day of days) {
    day.sessions = layoutDayOverlaps(day.sessions);
  }

  const prevHref =
    view === "month"
      ? navHref(view, anchorIso, isAdmin ? selectedTrainerId : null, 0, -1)
      : navHref(view, anchorIso, isAdmin ? selectedTrainerId : null, view === "day" ? -1 : -7);
  const nextHref =
    view === "month"
      ? navHref(view, anchorIso, isAdmin ? selectedTrainerId : null, 0, 1)
      : navHref(view, anchorIso, isAdmin ? selectedTrainerId : null, view === "day" ? 1 : 7);
  const todayHref = (() => {
    const params = new URLSearchParams({ view, date: todayIsoAmsterdam() });
    if (isAdmin) params.set("trainerId", selectedTrainerId);
    return `/app/trainer/agenda?${params.toString()}`;
  })();

  return (
    <AgendaScreen
      view={view}
      anchorIso={anchorIso}
      days={days}
      isAdmin={isAdmin}
      trainerOptions={trainerOptions}
      selectedTrainerId={selectedTrainerId}
      prevHref={prevHref}
      nextHref={nextHref}
      todayHref={todayHref}
      isCurrentRangeToday={days.some((d) => d.isToday)}
    />
  );
}
