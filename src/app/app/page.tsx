import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { IntakeBanner } from "./_components/IntakeBanner";
import { NextSessionCard } from "./_components/NextSessionCard";
import { StatTile } from "./_components/StatTile";

export const metadata = {
  title: "Dashboard | The Movement Club",
  robots: { index: false, follow: false },
};

const PLANS_WITH_CREDITS = new Set(["ten_ride_card", "pt_package"]);

type BookingRow = {
  id: string;
  session: {
    id: string;
    start_at: string;
    end_at: string;
    class_type: { name: string } | null;
    trainer: { display_name: string } | null;
  } | null;
};

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

function logIfError(tag: string, error: { message: string } | null) {
  if (error) {
    console.error(`[/app dashboard] ${tag} query failed:`, error.message);
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Layout already redirects; defence-in-depth for type-narrowing below.
    return null;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { isoWeek, isoYear } = getIsoWeekYear(now);

  const [
    profileResult,
    nextBookingResult,
    upcomingCountResult,
    membershipResult,
    weeklyBookingsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, health_intake_completed_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select(
        `
          id,
          session:class_sessions!inner(
            id,
            start_at,
            end_at,
            class_type:class_types(name),
            trainer:trainers(display_name)
          )
        `,
      )
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .gte("class_sessions.start_at", nowIso)
      .order("class_sessions(start_at)", { ascending: true })
      .limit(1)
      .returns<BookingRow[]>(),
    supabase
      .from("bookings")
      .select("id, class_sessions!inner(start_at)", {
        count: "exact",
        head: true,
      })
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .gte("class_sessions.start_at", nowIso),
    supabase
      .from("memberships")
      .select("plan_type, frequency_cap, credits_remaining, credits_total")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("v_weekly_bookings")
      .select("booking_count")
      .eq("profile_id", user.id)
      .eq("iso_week", isoWeek)
      .eq("iso_year", isoYear),
  ]);

  logIfError("profiles", profileResult.error);
  logIfError("next booking", nextBookingResult.error);
  logIfError("upcoming count", upcomingCountResult.error);
  logIfError("membership", membershipResult.error);
  logIfError("weekly bookings", weeklyBookingsResult.error);

  const firstName =
    profileResult.data?.first_name?.trim() ||
    user.email?.split("@")[0] ||
    "beweger";
  const intakeDone = Boolean(profileResult.data?.health_intake_completed_at);
  const upcomingCount = upcomingCountResult.count ?? 0;

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

  const membership = membershipResult.data;
  const showCreditsTile =
    membership &&
    PLANS_WITH_CREDITS.has(membership.plan_type) &&
    membership.credits_total !== null;

  const weeklyBookingsUsed =
    weeklyBookingsResult.data?.reduce(
      (sum, row) => sum + (row.booking_count ?? 0),
      0,
    ) ?? 0;
  const showFrequencyTile =
    !showCreditsTile &&
    membership !== null &&
    membership?.frequency_cap != null;

  return (
    <Container className="py-16 md:py-24">
      <header className="mb-16 md:mb-20">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Dashboard
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl text-text leading-[1.02] tracking-[-0.02em]">
          Hallo {firstName}.
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Welkom terug. Hieronder staat wat er deze week voor je op de
          agenda staat.
        </p>
      </header>

      {!intakeDone && <IntakeBanner />}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
        <div className="md:col-span-8">
          <NextSessionCard session={nextSession} />
        </div>
        <div className="md:col-span-4 flex flex-col gap-6 md:gap-8">
          <StatTile
            label="Komende sessies"
            value={String(upcomingCount)}
            hint={
              upcomingCount === 0
                ? "Nog niets gepland."
                : upcomingCount === 1
                  ? "Eén moment om naar uit te kijken."
                  : `${upcomingCount} momenten staan klaar.`
            }
          />
          {showCreditsTile && (
            <StatTile
              label={
                membership!.plan_type === "pt_package"
                  ? "PT-credits"
                  : "Rittenkaart"
              }
              value={`${membership!.credits_remaining ?? 0} / ${membership!.credits_total}`}
              hint="Resterend op je kaart."
            />
          )}
          {showFrequencyTile && (
            <StatTile
              label="Deze week"
              value={`${weeklyBookingsUsed} / ${membership!.frequency_cap}`}
              hint={
                weeklyBookingsUsed >= (membership!.frequency_cap ?? 0)
                  ? "Fair-use bereikt. Nieuwe week, nieuwe ruimte."
                  : "Sessies gebruikt binnen je abonnement."
              }
            />
          )}
        </div>
      </div>
    </Container>
  );
}
