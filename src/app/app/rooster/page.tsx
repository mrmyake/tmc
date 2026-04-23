import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  PILLARS,
  PILLAR_LABELS,
  type Pillar,
} from "@/lib/member/plan-coverage";
import {
  addDaysIsoAmsterdam,
  isOngoing,
  isoDateAmsterdam,
  parseIsoDateToAmsterdamMidnight,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import { FilterChips } from "./_components/FilterChips";
import { SessionList } from "./_components/SessionList";
import { DayStrip, type DayStripDay } from "./_components/DayStrip";
import {
  OpenStudioStrip,
  type OpenStudioDay,
} from "./_components/OpenStudioStrip";
import type { SessionStatus } from "@/components/ui/StatusBadge";
import { NextSessionCard } from "@/app/app/_components/NextSessionCard";
import { IntakeBanner } from "@/app/app/_components/IntakeBanner";

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

const WINDOW_DAYS = 7;

function buildHref(params: {
  from?: string;
  dag?: string;
  pijler?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.dag) qs.set("dag", params.dag);
  if (params.pijler) qs.set("pijler", params.pijler);
  const query = qs.toString();
  return query ? `/app/rooster?${query}` : "/app/rooster";
}

/**
 * Valideer en clamp een from-param. from mag niet eerder dan vandaag
 * (geen backward-navigatie) en hoort een yyyy-mm-dd Amsterdam-datum te
 * zijn. Ongeldig = fallback naar vandaag.
 */
function resolveFrom(
  param: string | undefined,
  todayIso: string,
): string {
  if (!param) return todayIso;
  const parsed = parseIsoDateToAmsterdamMidnight(param);
  const today = parseIsoDateToAmsterdamMidnight(todayIso);
  if (!parsed || !today) return todayIso;
  return parsed.getTime() < today.getTime() ? todayIso : param;
}

/**
 * Selecteerde dag valideren. Moet in het [from, from+7) window vallen,
 * anders snap naar `from`.
 */
function resolveSelectedDay(
  param: string | undefined,
  fromIso: string,
): string {
  if (!param) return fromIso;
  const base = parseIsoDateToAmsterdamMidnight(fromIso);
  const day = parseIsoDateToAmsterdamMidnight(param);
  if (!base || !day) return fromIso;
  const diffDays = Math.round(
    (day.getTime() - base.getTime()) / 86_400_000,
  );
  if (diffDays < 0 || diffDays >= WINDOW_DAYS) return fromIso;
  return param;
}

export default async function RoosterPage(props: {
  searchParams: Promise<{
    from?: string;
    dag?: string;
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
  const todayIso = todayIsoAmsterdam(now);
  const fromIso = resolveFrom(searchParams.from, todayIso);
  const selectedDayIso = resolveSelectedDay(searchParams.dag, fromIso);

  const windowStart = parseIsoDateToAmsterdamMidnight(fromIso)!;
  const windowEnd = parseIsoDateToAmsterdamMidnight(
    addDaysIsoAmsterdam(fromIso, WINDOW_DAYS),
  )!;

  const pillarFilter = (
    searchParams.pijler && (PILLARS as readonly string[]).includes(searchParams.pijler)
      ? (searchParams.pijler as Pillar)
      : null
  );

  const [
    sessionsResult,
    bookingsResult,
    waitlistResult,
    settingsResult,
    maxFutureResult,
    profileResult,
    nextBookingResult,
  ] = await Promise.all([
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
        .gte("start_at", windowStart.toISOString())
        .lt("start_at", windowEnd.toISOString())
        .order("start_at", { ascending: true });
      if (pillarFilter) q = q.eq("pillar", pillarFilter);
      return q.returns<SessionRow[]>();
    })(),
    supabase
      .from("bookings")
      .select("id, session_id, status")
      .eq("profile_id", user.id)
      .gte("session_date", fromIso)
      .lt("session_date", addDaysIsoAmsterdam(fromIso, WINDOW_DAYS))
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
    // Grootste start_at om te bepalen of "Volgende 7 dagen" nog iets
    // oplevert. Voeren we uit als head-query met order + limit zodat
    // we niet het hele resultaat ophalen.
    supabase
      .from("class_sessions")
      .select("start_at")
      .order("start_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Profiel voor intake-banner check
    supabase
      .from("profiles")
      .select("health_intake_completed_at")
      .eq("id", user.id)
      .maybeSingle(),
    // Eerstvolgende geboekte sessie (voor NextSessionCard bovenaan)
    supabase
      .from("bookings")
      .select(
        `
          id,
          session:class_sessions!inner(
            id, start_at, end_at,
            class_type:class_types(name),
            trainer:trainers(display_name)
          )
        `,
      )
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .gte("class_sessions.start_at", now.toISOString())
      .order("class_sessions(start_at)", { ascending: true })
      .limit(1)
      .returns<
        Array<{
          id: string;
          session: {
            id: string;
            start_at: string;
            end_at: string;
            class_type: { name: string } | null;
            trainer: { display_name: string } | null;
          } | null;
        }>
      >(),
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
    const end = new Date(s.end_at);
    let status: SessionStatus;
    if (end.getTime() < now.getTime()) status = "past";
    else if (isOngoing(start, end, now)) status = "ongoing";
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
      isoDate: isoDateAmsterdam(start),
    };
  });

  // Splits vrij-trainen dag-sessies van reguliere groepslessen — de
  // eerste renderen als horizontale strip, de tweede als geselecteerde
  // dag-agenda onder de DayStrip.
  const vrijTrainenByDate = new Map<string, (typeof enriched)[number]>();
  const regularEnriched = [] as typeof enriched;
  for (const s of enriched) {
    if (s.pillar === "vrij_trainen") {
      vrijTrainenByDate.set(s.isoDate, s);
    } else {
      regularEnriched.push(s);
    }
  }

  const openStudioDays: OpenStudioDay[] = Array.from(
    { length: WINDOW_DAYS },
    (_, i) => {
      const iso = addDaysIsoAmsterdam(fromIso, i);
      const match = vrijTrainenByDate.get(iso);
      if (!match) {
        const d = parseIsoDateToAmsterdamMidnight(iso)!;
        return {
          isoDate: iso,
          sessionId: "",
          startAt: d.toISOString(),
          state: "past" as const,
          bookingId: null,
        };
      }
      const state: "open" | "booked" | "past" =
        match.status === "past" || match.status === "ongoing"
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
    },
  ).filter((day) => day.sessionId !== "");

  // DayStrip tellers per dag.
  const dayCounts = new Map<
    string,
    { open: number; total: number }
  >();
  for (const s of regularEnriched) {
    const cur = dayCounts.get(s.isoDate) ?? { open: 0, total: 0 };
    cur.total += 1;
    if (s.status === "open") cur.open += 1;
    dayCounts.set(s.isoDate, cur);
  }

  const dayStripDays: DayStripDay[] = Array.from(
    { length: WINDOW_DAYS },
    (_, i) => {
      const iso = addDaysIsoAmsterdam(fromIso, i);
      const counts = dayCounts.get(iso) ?? { open: 0, total: 0 };
      return { iso, openCount: counts.open, totalCount: counts.total };
    },
  );

  const selectedDaySessions = regularEnriched.filter(
    (s) => s.isoDate === selectedDayIso,
  );

  // "Volgende 7 dagen" — alleen tonen als de volgende window nog binnen
  // het bereik van gepubliceerde sessies valt.
  const nextFromIso = addDaysIsoAmsterdam(fromIso, WINDOW_DAYS);
  const nextWindowStart = parseIsoDateToAmsterdamMidnight(nextFromIso)!;
  const maxFutureStart = maxFutureResult.data?.start_at
    ? new Date(maxFutureResult.data.start_at)
    : null;
  const hasNextWindow = Boolean(
    maxFutureStart && maxFutureStart.getTime() >= nextWindowStart.getTime(),
  );
  const nextHref = hasNextWindow
    ? buildHref({
        from: nextFromIso,
        dag: nextFromIso,
        pijler: pillarFilter ?? undefined,
      })
    : null;

  // NextSessionCard-input: komt van nextBookingResult
  const intakeDone = Boolean(
    profileResult.data?.health_intake_completed_at,
  );
  const nextBookingRow = nextBookingResult.data?.[0];
  const nextSession = nextBookingRow?.session
    ? {
        startAt: new Date(nextBookingRow.session.start_at),
        className: nextBookingRow.session.class_type?.name ?? "Sessie",
        trainerName:
          nextBookingRow.session.trainer?.display_name ?? "een coach",
        durationMinutes: Math.max(
          1,
          Math.round(
            (new Date(nextBookingRow.session.end_at).getTime() -
              new Date(nextBookingRow.session.start_at).getTime()) /
              60000,
          ),
        ),
      }
    : null;

  return (
    <Container className="py-16 md:py-20">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Rooster
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          Kies je moment.
        </h1>
      </header>

      {!intakeDone && (
        <div className="mb-10">
          <IntakeBanner />
        </div>
      )}

      {nextSession && (
        <div className="mb-12 md:mb-14">
          <NextSessionCard session={nextSession} />
        </div>
      )}

      <DayStrip
        days={dayStripDays}
        selectedIso={selectedDayIso}
        todayIso={todayIso}
        nextHref={nextHref}
        buildDayHref={(iso) =>
          buildHref({
            from: fromIso === todayIso ? undefined : fromIso,
            dag: iso,
            pijler: pillarFilter ?? undefined,
          })
        }
      />

      {openStudioDays.length > 0 && <OpenStudioStrip days={openStudioDays} />}

      <div className="mb-12">
        <FilterChips
          pillars={PILLARS.filter((p) => p !== "vrij_trainen")}
        />
      </div>

      <SessionList
        sessions={selectedDaySessions.map((s) => ({
          id: s.id,
          startAt: s.startAt,
          endAt: s.endAt,
          className: s.className,
          trainerName: s.trainerName,
          trainerBio: s.trainerBio,
          pillar: s.pillar,
          capacity: s.capacity,
          bookedCount: s.bookedCount,
          status: s.status,
          bookingId: s.bookingId,
        }))}
        cancellationWindowHours={cancellationWindowHours}
      />

      {pillarFilter && selectedDaySessions.length > 0 && (
        <p className="mt-10 text-text-muted text-xs">
          Filter actief: {PILLAR_LABELS[pillarFilter]}.
        </p>
      )}
    </Container>
  );
}
