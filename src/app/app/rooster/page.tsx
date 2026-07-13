import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import {
  PILLARS,
  PILLAR_LABELS,
  type Pillar,
} from "@/lib/member/plan-coverage";
import {
  canBook,
  REASON_COPY,
  type CanBookMembership,
} from "@/lib/member/can-book";
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
import type { SessionStatus } from "@/components/ui/StatusBadge";
import { NextSessionCard } from "@/app/app/_components/NextSessionCard";
import { IntakeBanner } from "@/app/app/_components/IntakeBanner";
import { OfflineBanner } from "./_components/OfflineBanner";

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
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  pillar: string;
  age_category: string;
  class_type: { name: string } | null;
  trainer: { display_name: string; bio: string | null } | null;
};

type MembershipRow = {
  id: string;
  plan_type: string;
  frequency_cap: number | null;
  credits_remaining: number | null;
  credits_expires_at: string | null;
  status: string;
  cancellation_effective_date: string | null;
};

const WINDOW_DAYS = 7;

// Reason-codes uit canBook() (src/lib/member/can-book.ts), 1:1 gespiegeld aan
// book_class_session — geen eigen beslislogica hier, alleen de vertaling
// naar een SessionStatus voor de badge. session_not_scheduled/session_in_past
// zijn hier structureel onbereikbaar (we roepen canBook() pas aan nadat de
// bestaande past/cancelled-checks al zijn gepasseerd), maar staan erin voor
// volledige typedekking van canBook()'s reason-union.
const REASON_TO_STATUS: Record<string, SessionStatus> = {
  capacity_full: "full",
  weekly_cap_reached: "limit_reached",
  daily_cap_reached: "limit_reached",
  booking_window_closed: "window_closed",
  strike_blocked: "strike_blocked",
  no_coverage: "no_coverage",
  age_mismatch: "age_mismatch",
  session_not_scheduled: "cancelled",
  session_in_past: "past",
};

// Zelfde ISO-week/jaar-berekening als src/app/app/vrij-trainen/page.tsx en
// src/lib/member/booking-actions.ts (softWeeklyCapCheck) — bewust een derde
// kopie in plaats van een nieuwe gedeelde util, om deze wijziging chirurgisch
// te houden. Zelfde UTC-basis als book_class_session's eigen
// extract(isoyear/week from (start_at at time zone 'utc')::date), dus de
// bucketing hier komt overeen met hoe bookings.iso_week/iso_year al gezet zijn.
function getIsoWeekYear(date: Date): { isoWeek: number; isoYear: number } {
  const target = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { isoWeek, isoYear: target.getUTCFullYear() };
}

/** Kalenderdag-van-de-week voor een yyyy-mm-dd string, 1=ma..7=zo. */
function isoWeekdayNum(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Maandag van de week waarin `iso` valt. */
function mondayOfIso(iso: string): string {
  return addDaysIsoAmsterdam(iso, -(isoWeekdayNum(iso) - 1));
}

/**
 * Welke memberships dekken op datum `sessionDateIso`. Zelfde filter als
 * booking-actions.ts's softWeeklyCapCheck (en book_class_session zelf): een
 * lopende opzegging telt nog mee tot en met de effectieve datum, gepauzeerd
 * telt nooit mee. Geen nieuwe regel, herhaalt een al bestaande.
 */
function eligibleMembershipsForDate(
  memberships: MembershipRow[],
  sessionDateIso: string,
): MembershipRow[] {
  return memberships.filter(
    (m) =>
      m.status === "active" ||
      (m.status === "cancellation_requested" &&
        m.cancellation_effective_date != null &&
        m.cancellation_effective_date >= sessionDateIso),
  );
}

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

  // Breed genoeg venster om de volledige ISO-week(en) te dekken die het
  // getoonde 7-daagse venster overlapt, voor de weeklimiet-telling
  // (fromIso hoeft geen maandag te zijn).
  const weekRangeStartIso = mondayOfIso(fromIso);
  const weekRangeEndIso = addDaysIsoAmsterdam(
    mondayOfIso(addDaysIsoAmsterdam(fromIso, WINDOW_DAYS - 1)),
    7,
  );

  const [
    sessionsResult,
    bookingsResult,
    waitlistResult,
    settingsResult,
    maxFutureResult,
    profileResult,
    nextBookingResult,
    todayCheckInsResult,
    membershipsResult,
    strikesResult,
    weeklyPillarCountResult,
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
            age_category,
            class_type:class_types(name),
            trainer:trainers(display_name, bio)
          `,
        )
        // Vrij trainen heeft een eigen pagina (/app/vrij-trainen). Hier
        // alleen tijdslot-sessies.
        .neq("pillar", "vrij_trainen")
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
      .select(
        "cancellation_window_hours, booking_window_days, fair_use_daily_max, no_show_strike_threshold, no_show_block_days, check_in_enabled, check_in_pillars",
      )
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
    // Profiel voor intake-banner check + age_category (canBook-input).
    supabase
      .from("profiles")
      .select("health_intake_completed_at, age_category")
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
      .gte("session.start_at", now.toISOString())
      .order("session(start_at)", { ascending: true })
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
    // Eigen check-ins voor vandaag (Amsterdam-dag; ruim met UTC). Wordt
    // per session-id gekoppeld voor "Ingecheckt HH:MM"-hints.
    (() => {
      const todayUtcStart = new Date();
      todayUtcStart.setUTCHours(0, 0, 0, 0);
      return supabase
        .from("check_ins")
        .select("session_id, checked_in_at")
        .eq("profile_id", user.id)
        .not("session_id", "is", null)
        .gte("checked_in_at", todayUtcStart.toISOString());
    })(),
    // Eigen memberships voor coverage/frequency_cap/credits (canBook-input).
    // "paused" bewust buiten deze set: een gepauzeerd abonnement dekt niets,
    // dus zo'n lid ziet correct "buiten abonnement" tot het hervat is.
    supabase
      .from("memberships")
      .select(
        "id, plan_type, frequency_cap, credits_remaining, credits_expires_at, status, cancellation_effective_date",
      )
      .eq("profile_id", user.id)
      .in("status", ["active", "cancellation_requested"])
      .returns<MembershipRow[]>(),
    // Actieve no-show-strikes (canBook-input voor strike_blocked).
    supabase
      .from("v_active_strikes")
      .select("strike_count, last_strike_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    // Eigen boekingen in de overlappende ISO-week(en), voor de weeklimiet
    // per pillar. Zelfde iso_week/iso_year-kolommen als book_class_session
        // zelf al op elke booking zet; hier alleen groeperen, niet herrekenen.
    supabase
      .from("bookings")
      .select("pillar, iso_week, iso_year")
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .gte("session_date", weekRangeStartIso)
      .lt("session_date", weekRangeEndIso),
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
  const availabilityResult =
    sessionIds.length === 0
      ? {
          data: [] as {
            id: string;
            booked_count: number | null;
            spots_available: number | null;
            waitlist_count: number | null;
          }[],
        }
      : await supabase
          .from("v_session_availability")
          .select("id, booked_count, spots_available, waitlist_count")
          .in("id", sessionIds);

  const availabilityBySession = new Map<
    string,
    { bookedCount: number; spotsAvailable: number | null }
  >();
  for (const row of availabilityResult.data ?? []) {
    if (row.id) {
      availabilityBySession.set(row.id, {
        bookedCount: row.booked_count ?? 0,
        spotsAvailable: row.spots_available,
      });
    }
  }

  const cancellationWindowHours =
    settingsResult.data?.cancellation_window_hours ?? 6;

  // Fallbacks identiek aan de COALESCE-defaults in book_class_session zelf,
  // voor het (onwaarschijnlijke) geval de singleton-rij ontbreekt.
  const bookingSettings = {
    bookingWindowDays: settingsResult.data?.booking_window_days ?? 14,
    fairUseDailyMax: settingsResult.data?.fair_use_daily_max ?? 2,
    noShowStrikeThreshold: settingsResult.data?.no_show_strike_threshold ?? 3,
    noShowBlockDays: settingsResult.data?.no_show_block_days ?? 7,
    checkInEnabled: settingsResult.data?.check_in_enabled ?? true,
    checkInPillars: settingsResult.data?.check_in_pillars ?? [
      "yoga_mobility",
      "kettlebell",
      "vrij_trainen",
    ],
  };

  const ageCategory = profileResult.data?.age_category ?? null;
  const activeStrikes = strikesResult.data?.strike_count ?? 0;
  const strikesBlockUntil = strikesResult.data?.last_strike_at
    ? new Date(
        new Date(strikesResult.data.last_strike_at).getTime() +
          bookingSettings.noShowBlockDays * 86_400_000,
      ).toISOString()
    : null;

  const allMemberships = membershipsResult.data ?? [];

  // Eigen boekingen per (iso_year, iso_week, pillar), voor de weeklimiet.
  const weeklyPillarCount = new Map<string, number>();
  for (const row of weeklyPillarCountResult.data ?? []) {
    const key = `${row.iso_year}-${row.iso_week}-${row.pillar}`;
    weeklyPillarCount.set(key, (weeklyPillarCount.get(key) ?? 0) + 1);
  }

  // Map van session_id → checked_in_at voor hint-rendering op vandaag.
  const checkInBySession = new Map<string, string>();
  for (const ci of todayCheckInsResult.data ?? []) {
    if (ci.session_id && ci.checked_in_at) {
      checkInBySession.set(ci.session_id, ci.checked_in_at);
    }
  }
  const todayIsoForHint = isoDateAmsterdam(now);
  const amsterdamTime = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // Eigen boekingen per dag (voor de daglimiet), afgeleid uit de sessies
  // zelf zodat we niet nog een aparte query nodig hebben: bookingsBySession
  // + de sessie-datum geven ons de daglimiet-telling gratis.
  const bookedDatesForUser: string[] = [];
  for (const s of sessions) {
    if (bookingsBySession.has(s.id)) {
      bookedDatesForUser.push(isoDateAmsterdam(new Date(s.start_at)));
    }
  }
  const bookingCountByDate = new Map<string, number>();
  for (const d of bookedDatesForUser) {
    bookingCountByDate.set(d, (bookingCountByDate.get(d) ?? 0) + 1);
  }

  const enriched = sessions.map((s) => {
    const booking = bookingsBySession.get(s.id);
    const waitlisted = waitlistedSessions.has(s.id);
    const availability = availabilityBySession.get(s.id);
    // Sessie zonder rij in v_session_availability (bv. een race, of een net
    // niet meer "scheduled" sessie buiten de view): terugvallen op 0 geboekt
    // in plaats van te crashen. De RPC blijft sowieso de echte gate.
    const bookedCount = availability?.bookedCount ?? 0;
    const spotsAvailable = availability?.spotsAvailable ?? null;
    const start = new Date(s.start_at);
    const end = new Date(s.end_at);
    const sessionIso = isoDateAmsterdam(start);

    let status: SessionStatus;
    let reasonText: string | null = null;

    if (end.getTime() < now.getTime()) {
      status = "past";
    } else if (isOngoing(start, end, now)) {
      status = "ongoing";
    } else if (booking) {
      status = "booked";
    } else if (waitlisted) {
      status = "waitlisted";
    } else if (s.status !== "scheduled") {
      status = "cancelled";
    } else {
      // Live kandidaat: canBook() beslist, wij tonen alleen. Zelfde functie,
      // zelfde volgorde en reason-codes als de RPC — geen eigen regels hier.
      const eligibleMemberships = eligibleMembershipsForDate(
        allMemberships,
        sessionIso,
      );
      const canBookMemberships: CanBookMembership[] = eligibleMemberships.map(
        (m) => ({
          id: m.id,
          plan_type: m.plan_type,
          frequency_cap: m.frequency_cap,
          credits_remaining: m.credits_remaining,
          credits_expires_at: m.credits_expires_at,
        }),
      );
      const isoWeek = getIsoWeekYear(start);
      const weekKey = `${isoWeek.isoYear}-${isoWeek.isoWeek}-${s.pillar}`;
      const checkInEnabledForPillar =
        bookingSettings.checkInEnabled &&
        bookingSettings.checkInPillars.includes(s.pillar);

      const result = canBook({
        session: {
          id: s.id,
          start_at: s.start_at,
          status: s.status,
          pillar: s.pillar,
          age_category: s.age_category,
          capacity: s.capacity,
        },
        profile: {
          age_category: ageCategory ?? s.age_category,
          active_strikes: activeStrikes,
          strikes_block_until: strikesBlockUntil,
        },
        memberships: canBookMemberships,
        usage: {
          bookedCountThisSession: bookedCount,
          bookingsSameDay: bookingCountByDate.get(sessionIso) ?? 0,
          bookingsSamePillarThisWeek: weeklyPillarCount.get(weekKey) ?? 0,
          // Alleen relevant binnen de soft-cap-tak (checkInEnabledForPillar),
          // die nooit "niet boekbaar" teruggeeft — zie can-book.ts. Voor deze
          // prefilter maakt de exacte waarde dus niet uit; 0 is veilig en
          // bespaart een check-ins-per-week-query.
          checkInsSamePillarThisWeek: 0,
        },
        settings: {
          booking_window_days: bookingSettings.bookingWindowDays,
          fair_use_daily_max: bookingSettings.fairUseDailyMax,
          no_show_strike_threshold: bookingSettings.noShowStrikeThreshold,
          no_show_block_days: bookingSettings.noShowBlockDays,
          checkInEnabledForPillar,
        },
        now,
      });

      if (result.allowed) {
        status = "open";
      } else {
        status = REASON_TO_STATUS[result.reason] ?? "no_coverage";
        reasonText = REASON_COPY[result.reason] ?? null;
      }
    }

    // Check-in hint: alleen tonen op sessies van vandaag waarvoor de
    // user geboekt heeft (of al ingecheckt is). Andere dagen niet
    // relevant — tablet-hint zou verwarren.
    const isToday = sessionIso === todayIsoForHint;
    const checkedInAt = checkInBySession.get(s.id);
    let checkInHint: string | null = null;
    let checkedIn = false;
    if (checkedInAt) {
      checkInHint = `Ingecheckt ${amsterdamTime.format(new Date(checkedInAt))}`;
      checkedIn = true;
    } else if (isToday && booking && status === "booked") {
      checkInHint = "Check in bij de tablet";
    }

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
      spotsAvailable,
      status,
      reasonText,
      bookingId: booking?.id ?? null,
      isoDate: sessionIso,
      checkInHint,
      checkedIn,
    };
  });

  // Vrij trainen wordt hier niet meer getoond — eigen pagina op
  // /app/vrij-trainen. De query boven filtert al op pillar ≠
  // vrij_trainen, dus enriched bevat alleen groepslessen.
  const regularEnriched = enriched;

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

      <OfflineBanner />

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
        fromIso={fromIso}
        pillarFilter={pillarFilter}
        nextHref={nextHref}
      />

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
          checkInHint: s.checkInHint,
          checkedIn: s.checkedIn,
          reasonText: s.reasonText,
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
