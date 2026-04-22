import { Container } from "@/components/layout/Container";
import { Section } from "@/components/layout/Section";
import { QuietLink } from "@/components/ui/QuietLink";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amsterdamParts,
  formatTime,
  formatShortDate,
} from "@/lib/format-date";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

type TeaserVariant = "default" | "embed";

interface ScheduleTeaserProps {
  variant?: TeaserVariant;
}

interface TeaserSession {
  id: string;
  startAt: string;
  endAt: string;
  className: string;
  trainerName: string;
  pillar: string;
  capacity: number;
  bookedCount: number;
}

interface SessionRow {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  capacity: number;
  class_type: { name: string } | null;
  trainer: { display_name: string } | null;
}

async function fetchTeaserSessions(): Promise<TeaserSession[]> {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 3_600_000);

  const { data: sessions, error } = await admin
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
    .lt("start_at", horizon.toISOString())
    .order("start_at", { ascending: true })
    .returns<SessionRow[]>();

  if (error) {
    console.error("[ScheduleTeaser] sessions query:", error);
    return [];
  }
  if (!sessions || sessions.length === 0) return [];

  const todayParts = amsterdamParts(now);
  const todayKey = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

  const todaySessions: SessionRow[] = [];
  const tomorrowSessions: SessionRow[] = [];
  for (const s of sessions) {
    const p = amsterdamParts(new Date(s.start_at));
    const key = `${p.year}-${p.month}-${p.day}`;
    if (key === todayKey) {
      todaySessions.push(s);
    } else {
      tomorrowSessions.push(s);
    }
  }

  const picked: SessionRow[] = [...todaySessions.slice(0, 3)];
  if (picked.length < 4 && tomorrowSessions.length > 0) {
    picked.push(tomorrowSessions[0]);
  }

  if (picked.length === 0) return [];

  const ids = picked.map((s) => s.id);
  const { data: availability } = await admin
    .from("v_session_availability")
    .select("id, booked_count")
    .in("id", ids);
  const bookedBySession = new Map<string, number>();
  for (const row of availability ?? []) {
    if (row.id) bookedBySession.set(row.id, row.booked_count ?? 0);
  }

  return picked.map((s) => ({
    id: s.id,
    startAt: s.start_at,
    endAt: s.end_at,
    className: s.class_type?.name ?? "Sessie",
    trainerName: s.trainer?.display_name ?? "coach",
    pillar: s.pillar,
    capacity: s.capacity,
    bookedCount: bookedBySession.get(s.id) ?? 0,
  }));
}

function isToday(startAtIso: string, now: Date): boolean {
  const a = amsterdamParts(new Date(startAtIso));
  const b = amsterdamParts(now);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export async function ScheduleTeaser({
  variant = "default",
}: ScheduleTeaserProps) {
  const sessions = await fetchTeaserSessions();
  const now = new Date();
  const firstTomorrow = sessions.find((s) => !isToday(s.startAt, now));
  const hasTodaySession = sessions.some((s) => isToday(s.startAt, now));

  const body = (
    <>
      {sessions.length === 0 ? (
        <p className="py-12 text-text-muted text-base text-center">
          Momenteel staan er geen sessies gepland. Kijk straks terug of bekijk
          het rooster in Sanity.
        </p>
      ) : (
        <ul
          aria-label="Komende sessies"
          className="border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60"
        >
          {!hasTodaySession && firstTomorrow && (
            <li className="py-5 flex flex-wrap items-baseline gap-4">
              <span className="tmc-eyebrow text-text-muted/70">
                Vandaag
              </span>
              <span className="text-text-muted text-sm leading-relaxed">
                Vandaag geen sessies. Morgen om{" "}
                <span className="text-text">{formatTime(new Date(firstTomorrow.startAt))}</span>{" "}
                weer van start.
              </span>
            </li>
          )}
          {sessions.map((s) => {
            const start = new Date(s.startAt);
            const pillarLabel =
              PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar;
            const spotsLeft = Math.max(0, s.capacity - s.bookedCount);
            const isFull = spotsLeft === 0;
            return (
              <li
                key={s.id}
                className="py-5 grid grid-cols-[auto_1fr_auto] items-baseline gap-4 sm:gap-6"
              >
                <div className="flex flex-col items-start">
                  <span className="tmc-eyebrow text-text-muted/70">
                    {isToday(s.startAt, now)
                      ? "Vandaag"
                      : formatShortDate(start)}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-sm text-text-muted mt-1">
                    {formatTime(start)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <h3 className="font-[family-name:var(--font-playfair)] text-lg md:text-xl text-text leading-tight tracking-[-0.01em] truncate">
                    {s.className}
                  </h3>
                  <p className="text-text-muted text-xs">
                    {pillarLabel} · met {s.trainerName}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-medium uppercase tracking-[0.16em] whitespace-nowrap ${
                    isFull
                      ? "text-[color:var(--stone-600)]"
                      : "text-text-muted"
                  }`}
                >
                  {isFull ? "Vol" : `${spotsLeft} plekken`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (variant === "embed") {
    return (
      <div className="bg-bg p-6 text-text font-[family-name:var(--font-sans)]">
        <span className="tmc-eyebrow block mb-3">Komend op het rooster</span>
        {body}
        <div className="mt-4">
          <QuietLink href="/rooster">Volledig rooster</QuietLink>
        </div>
      </div>
    );
  }

  return (
    <Section bg="elevated">
      <Container className="max-w-3xl">
        <header className="mb-10 md:mb-14">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Komend op het rooster
          </span>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl lg:text-6xl text-text leading-[1.05] tracking-[-0.02em]">
            Wat staat er klaar.
          </h2>
        </header>
        {body}
        <div className="mt-10">
          <QuietLink href="/rooster">
            Bekijk het volledige rooster
          </QuietLink>
        </div>
      </Container>
    </Section>
  );
}
