import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
} from "@/lib/format-date";
import { PILLARS, type Pillar } from "@/lib/member/plan-coverage";
import { PublicFilterChips } from "./_components/PublicFilterChips";
import {
  PublicWeekGrid,
  type PublicDay,
} from "./_components/PublicWeekGrid";
import type { PublicSessionCardData } from "./_components/PublicSessionCard";

export const metadata: Metadata = {
  title: "Rooster | The Movement Club",
  description:
    "Bekijk het wekelijkse rooster van The Movement Club. Yoga, kettlebell, kids en senior sessies in Loosdrecht.",
  alternates: { canonical: "https://themovementclub.nl/rooster" },
};

// Bezetting mag niet langer dan een minuut gecached zijn (spec A1).
export const revalidate = 60;

const HORIZON_DAYS = 14;

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  capacity: number;
  class_type: { name: string } | null;
  trainer: { display_name: string } | null;
};

function isoDate(d: Date): string {
  const p = amsterdamParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export default async function PublicRoosterPage(props: {
  searchParams: Promise<{ pijler?: string }>;
}) {
  const searchParams = await props.searchParams;
  const pillarFilter = (PILLARS as readonly string[]).includes(
    searchParams.pijler ?? "",
  )
    ? (searchParams.pijler as Pillar)
    : null;

  // Check auth status via the cookie-scoped server client (doesn't hit admin).
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const loggedIn = Boolean(user);

  // Admin client used only for reading session data. Anon-visible by design —
  // no member PII in the result shape, just session/class/trainer metadata +
  // aggregate booked counts.
  const admin = createAdminClient();

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86400000);

  let sessionsQuery = admin
    .from("class_sessions")
    .select(
      `
        id,
        start_at,
        end_at,
        pillar,
        capacity,
        class_type:class_types(name),
        trainer:trainers(display_name)
      `,
    )
    .eq("status", "scheduled")
    .neq("pillar", "vrij_trainen")
    .gte("start_at", now.toISOString())
    .lt("start_at", horizonEnd.toISOString())
    .order("start_at", { ascending: true });

  if (pillarFilter) {
    sessionsQuery = sessionsQuery.eq("pillar", pillarFilter);
  }

  const { data: sessions, error: sessionsError } =
    await sessionsQuery.returns<SessionRow[]>();

  if (sessionsError) {
    console.error("[/rooster] sessions query:", sessionsError);
  }

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const availabilityRes =
    sessionIds.length === 0
      ? { data: [] as Array<{ id: string | null; booked_count: number | null }> }
      : await admin
          .from("v_session_availability")
          .select("id, booked_count")
          .in("id", sessionIds);
  const bookedBySession = new Map<string, number>();
  for (const row of availabilityRes.data ?? []) {
    if (row.id) bookedBySession.set(row.id, row.booked_count ?? 0);
  }

  // User's own bookings (if logged in) — scope via auth client so RLS protects.
  const userBookedSessionIds = new Set<string>();
  if (loggedIn && user) {
    const { data: userBookings } = await authClient
      .from("bookings")
      .select("session_id, status")
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .in("session_id", sessionIds.length > 0 ? sessionIds : [""]);
    for (const b of userBookings ?? []) {
      userBookedSessionIds.add(b.session_id);
    }
  }

  const cards: PublicSessionCardData[] = (sessions ?? []).map((s) => ({
    id: s.id,
    startAt: s.start_at,
    endAt: s.end_at,
    className: s.class_type?.name ?? "Sessie",
    trainerName: s.trainer?.display_name ?? "coach",
    pillar: s.pillar,
    capacity: s.capacity,
    bookedCount: bookedBySession.get(s.id) ?? 0,
    userHasBooked: userBookedSessionIds.has(s.id),
  }));

  // Build a day array covering today + 13 days ahead, so empty days still
  // render their header (keeps rhythm + proves "nothing on Sunday").
  const days: PublicDay[] = Array.from({ length: HORIZON_DAYS }, (_, i) => {
    const date = new Date(now.getTime() + i * 86400000);
    const iso = isoDate(date);
    const parts = amsterdamParts(date);
    return {
      isoDate: iso,
      weekdayShort: DAY_SHORT_NL[parts.weekday],
      dayNumber: parts.day,
      monthShort: MONTH_SHORT_NL[parts.month - 1],
      sessions: [] as PublicSessionCardData[],
    };
  });
  const dayByIso = new Map(days.map((d) => [d.isoDate, d]));
  for (const card of cards) {
    const iso = isoDate(new Date(card.startAt));
    dayByIso.get(iso)?.sessions.push(card);
  }

  // Two-week split for the desktop grid (7+7), mobile just stacks everything.
  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);

  const totalSessions = cards.length;

  return (
    <Container className="py-16 md:py-24">
      <header className="mb-14 max-w-3xl">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Het rooster
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl lg:text-8xl text-text leading-[1.02] tracking-[-0.02em]">
          Twee weken vooruit.
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Yoga, kettlebell, kids en senior. Kleine groepen, échte coaching.
          Kom een keer mee.
        </p>
      </header>

      {!loggedIn && (
        <section className="relative bg-bg-elevated p-6 md:p-8 mb-12">
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
                Al lid?
              </span>
              <p className="text-text text-base">
                Log in om een sessie te boeken.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button href="/login">Inloggen</Button>
              <QuietLink href="/proefles">Of plan een proefles</QuietLink>
            </div>
          </div>
        </section>
      )}

      <div className="mb-12">
        <PublicFilterChips
          pillars={PILLARS.filter((p) => p !== "vrij_trainen")}
        />
      </div>

      {totalSessions === 0 ? (
        <section className="py-20 text-center">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Stil deze weken
          </span>
          <p className="text-text-muted text-base max-w-md mx-auto">
            Er zijn momenteel geen sessies ingepland die bij dit filter passen.
            Probeer een andere discipline of kom later terug.
          </p>
        </section>
      ) : (
        <>
          <PublicWeekGrid days={week1} />
          {week2.length > 0 && (
            <div className="mt-12">
              <PublicWeekGrid days={week2} />
            </div>
          )}
        </>
      )}

      <section className="mt-24 pt-16 border-t border-[color:var(--ink-500)]/60 text-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Nog geen lid?
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.05] tracking-[-0.02em] mb-6">
          Kom langs voor een proefles.
        </h2>
        <p className="text-text-muted text-base md:text-lg max-w-xl mx-auto mb-10">
          Eén sessie, vrijblijvend. Zo ervaar je hoe klein en persoonlijk het
          hier echt werkt.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button href="/proefles">Plan je proefles</Button>
          {loggedIn ? (
            <Button href="/app/rooster" variant="secondary">
              Naar jouw rooster
            </Button>
          ) : (
            <Link
              href="/aanbod"
              scroll={false}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-accent"
            >
              Bekijk het aanbod
            </Link>
          )}
        </div>
      </section>
    </Container>
  );
}
