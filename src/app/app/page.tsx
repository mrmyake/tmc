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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Layout already redirects; defence-in-depth for type-narrowing below.
    return null;
  }

  const nowIso = new Date().toISOString();

  const [profileResult, nextBookingResult, upcomingCountResult, membershipResult] =
    await Promise.all([
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
    ]);

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
        </div>
      </div>
    </Container>
  );
}
