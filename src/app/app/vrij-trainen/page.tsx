import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import {
  addDaysIsoAmsterdam,
  isoDateAmsterdam,
  parseIsoDateToAmsterdamMidnight,
  todayIsoAmsterdam,
} from "@/lib/format-date";
import { DayPassStrip, type DayPassDay } from "./_components/DayPassStrip";

export const metadata = {
  title: "Vrij trainen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;
const VRIJ_TRAINEN = "vrij_trainen";

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

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
};

type MembershipRow = {
  plan_variant: string;
  status: string;
  frequency_cap: number | null;
  covered_pillars: string[];
};

export default async function VrijTrainenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const todayIso = todayIsoAmsterdam(now);
  const windowStart = parseIsoDateToAmsterdamMidnight(todayIso)!;
  const windowEnd = parseIsoDateToAmsterdamMidnight(
    addDaysIsoAmsterdam(todayIso, WINDOW_DAYS),
  )!;
  const { isoWeek, isoYear } = getIsoWeekYear(now);

  const [
    sessionsResult,
    bookingsResult,
    membershipResult,
    weekCountResult,
    settingsResult,
  ] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id, start_at, end_at, status")
      .eq("pillar", VRIJ_TRAINEN)
      .gte("start_at", windowStart.toISOString())
      .lt("start_at", windowEnd.toISOString())
      .order("start_at", { ascending: true })
      .returns<SessionRow[]>(),
    supabase
      .from("bookings")
      .select("id, session_id, status")
      .eq("profile_id", user.id)
      .eq("pillar", VRIJ_TRAINEN)
      .eq("status", "booked")
      .gte("session_date", todayIso)
      .lt("session_date", addDaysIsoAmsterdam(todayIso, WINDOW_DAYS)),
    supabase
      .from("memberships")
      .select("plan_variant, status, frequency_cap, covered_pillars")
      .eq("profile_id", user.id)
      .in("status", ["active", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<MembershipRow>(),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("status", "booked")
      .eq("pillar", VRIJ_TRAINEN)
      .eq("iso_week", isoWeek)
      .eq("iso_year", isoYear),
    supabase
      .from("booking_settings")
      .select("vrij_trainen_cancel_window_minutes")
      .limit(1)
      .maybeSingle(),
  ]);

  const membership = membershipResult.data;
  const covers =
    membership?.covered_pillars?.includes(VRIJ_TRAINEN) ?? false;
  const isEligible = covers;
  const isPaused = isEligible && membership?.status === "paused";
  const cap = membership?.frequency_cap ?? null;
  const weekUsed = weekCountResult.count ?? 0;
  const capReached = cap !== null && weekUsed >= cap;

  // Niet-eligible → standalone no-access render
  if (!isEligible) {
    return <NotEligibleView hasMembership={Boolean(membership)} />;
  }

  const cancelWindowMinutes =
    settingsResult.data?.vrij_trainen_cancel_window_minutes ?? 5;

  // Bookings keyen op session_id zodat we per tile weten of 'ie geboekt is
  const bookingsBySession = new Map<string, string>();
  for (const b of bookingsResult.data ?? []) {
    bookingsBySession.set(b.session_id, b.id);
  }
  const sessionsByDate = new Map<string, SessionRow>();
  for (const s of sessionsResult.data ?? []) {
    const iso = isoDateAmsterdam(new Date(s.start_at));
    sessionsByDate.set(iso, s);
  }

  // Build 7 days, ongeacht of er een sessie bestaat — cron genereert ze
  // automatisch, maar defensive anyway.
  const days: DayPassDay[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const iso = addDaysIsoAmsterdam(todayIso, i);
    const session = sessionsByDate.get(iso);
    if (!session) {
      // Geen sessie — skip zou netter zijn, maar tile placeholder houdt layout stabiel
      const d = parseIsoDateToAmsterdamMidnight(iso)!;
      return {
        isoDate: iso,
        sessionId: "",
        startAt: d.toISOString(),
        state: "past",
        bookingId: null,
      } satisfies DayPassDay;
    }
    const end = new Date(session.end_at);
    const bookingId = bookingsBySession.get(session.id) ?? null;

    let state: DayPassDay["state"];
    if (end.getTime() < now.getTime()) state = "past";
    else if (bookingId) state = "booked";
    else if (isPaused) state = "paused";
    else if (capReached) state = "capped";
    else state = "open";

    return {
      isoDate: iso,
      sessionId: session.id,
      startAt: session.start_at,
      state,
      bookingId,
    } satisfies DayPassDay;
  }).filter((day) => day.sessionId !== "");

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Open studio
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em] mb-6">
          Vrij trainen.
        </h1>
        <p className="text-text-muted text-lg leading-relaxed max-w-xl">
          Kom wanneer je wil tussen 06:00 en 22:00. Boek een dag van tevoren,
          cancel kan tot {cancelWindowMinutes} minuten voor sluiting.
        </p>
      </header>

      {cap !== null && !isPaused && (
        <div className="mb-10 pb-6 border-b border-[color:var(--ink-500)]/60">
          <span className="tmc-eyebrow block mb-2">Deze week</span>
          <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.02em]">
            {weekUsed} <span className="text-text-muted">van {cap}</span>
          </p>
          {capReached && (
            <p className="mt-3 text-[color:var(--warning)] text-sm">
              Je weekcap is bereikt. Volgende week weer.
            </p>
          )}
        </div>
      )}

      {isPaused && (
        <div
          role="status"
          className="mb-10 p-5 border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/5"
        >
          <span className="tmc-eyebrow block mb-2">Abonnement gepauzeerd</span>
          <p className="text-text-muted text-sm leading-relaxed">
            Zolang je pauze loopt kun je niet vrij trainen. Als je het abbo
            hervat staat je plek weer open.
          </p>
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-text-muted text-sm py-8">
          Nog geen open studio-dagen gepubliceerd. Probeer het later opnieuw.
        </p>
      ) : (
        <DayPassStrip days={days} />
      )}
    </Container>
  );
}

function NotEligibleView({ hasMembership }: { hasMembership: boolean }) {
  return (
    <Container className="py-16 md:py-20 max-w-2xl">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Open studio
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Vrij trainen.
        </h1>
      </header>
      <section className="bg-bg-elevated p-10 md:p-12">
        <span className="tmc-eyebrow block mb-4">Nog geen toegang</span>
        <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
          {hasMembership
            ? "Jouw abbo dekt vrij trainen nog niet."
            : "Kies een abonnement met vrij trainen."}
        </h2>
        <p className="text-text-muted text-base leading-relaxed mb-8 max-w-md">
          De open studio is inbegrepen bij Vrij Trainen- en All Inclusive-
          plannen. Upgrade of kies een plan en je kunt direct binnenlopen.
        </p>
        <Button href="/app/abonnement">Bekijk abonnementen</Button>
      </section>
    </Container>
  );
}
