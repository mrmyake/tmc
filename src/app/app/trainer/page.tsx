import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatTimeRange,
} from "@/lib/format-date";
import { listVisibleAnnouncements } from "@/lib/announcements-query";
import { StatTile } from "@/app/app/_components/StatTile";

export const metadata = {
  title: "Trainer · Home | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  pillar: string;
  capacity: number;
  class_type: { name: string | null } | null;
};

function isoDateAms(d: Date): string {
  const p = amsterdamParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function startOfIsoWeekUtc(ref: Date): Date {
  const d = new Date(
    Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
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

function weekParam(y: number, w: number): string {
  return `${y}-W${String(w).padStart(2, "0")}`;
}

function toHoursNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export default async function TrainerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();

  const { data: trainer } = await admin
    .from("trainers")
    .select("id, display_name, pillar_specialties, is_active")
    .eq("profile_id", user.id)
    .maybeSingle();

  const firstName =
    user.user_metadata?.first_name ?? user.email?.split("@")[0] ?? "";

  const now = new Date();
  const todayIso = isoDateAms(now);
  const weekStart = startOfIsoWeekUtc(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  const monthStart = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), 1),
  );

  const announcements = await listVisibleAnnouncements(5);

  if (!trainer) {
    // Admins zonder eigen trainer-rij komen hier ook — minder volledige
    // pagina, geen agenda, alleen een pointer naar admin-surfaces en een
    // eventueel aankondigingen-blok.
    return (
      <div className="px-6 md:px-10 lg:px-12 py-14">
        <header className="mb-10">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
            Trainer
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
            Hé {firstName}.
          </h1>
          <p className="text-text-muted mt-4 max-w-md">
            Je staat niet als trainer in het systeem. Admins kunnen trainers
            beheren via onderstaande link.
          </p>
          <Link
            href="/app/admin/trainers"
            className="inline-flex items-center gap-2 mt-6 px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text hover:border-accent hover:text-accent transition-colors"
          >
            Trainers beheren
            <ChevronRight size={14} strokeWidth={1.5} />
          </Link>
        </header>

        {announcements.length > 0 && (
          <AnnouncementsFeed rows={announcements} />
        )}
      </div>
    );
  }

  const [todaySessionsRes, weekSessionCountRes, hoursRowsRes, pendingHoursRes] =
    await Promise.all([
      admin
        .from("class_sessions")
        .select(
          `id, start_at, end_at, pillar, capacity,
           class_type:class_types(name)`,
        )
        .eq("trainer_id", trainer.id)
        .eq("status", "scheduled")
        .gte("start_at", new Date(`${todayIso}T00:00:00Z`).toISOString())
        .lt(
          "start_at",
          new Date(`${todayIso}T23:59:59Z`).toISOString(),
        )
        .order("start_at")
        .returns<SessionRow[]>(),
      admin
        .from("class_sessions")
        .select("id", { count: "exact", head: true })
        .eq("trainer_id", trainer.id)
        .eq("status", "scheduled")
        .gte("start_at", weekStart.toISOString())
        .lt("start_at", weekEnd.toISOString()),
      admin
        .from("trainer_hours")
        .select("hours, status, work_date")
        .eq("trainer_id", trainer.id)
        .gte("work_date", isoDateAms(lastWeekStart)),
      admin
        .from("trainer_hours")
        .select("id", { count: "exact", head: true })
        .eq("trainer_id", trainer.id)
        .eq("status", "pending"),
    ]);

  const todaySessions = todaySessionsRes.data ?? [];
  const weekSessionCount = weekSessionCountRes.count ?? 0;
  const pendingHours = pendingHoursRes.count ?? 0;

  const weekStartIso = isoDateAms(weekStart);
  const lastWeekStartIso = isoDateAms(lastWeekStart);
  const lastWeekEndIso = isoDateAms(lastWeekEnd);
  const monthStartIso = isoDateAms(monthStart);

  let weekHoursApproved = 0;
  let lastWeekHoursApproved = 0;
  let lastWeekHoursPending = 0;
  let hoursMonthApproved = 0;
  for (const r of hoursRowsRes.data ?? []) {
    const h = toHoursNumber(r.hours);
    if (r.status === "approved") {
      if (r.work_date >= monthStartIso) hoursMonthApproved += h;
      if (r.work_date >= weekStartIso) weekHoursApproved += h;
      else if (
        r.work_date >= lastWeekStartIso &&
        r.work_date < lastWeekEndIso
      ) {
        lastWeekHoursApproved += h;
      }
    } else if (r.status === "pending") {
      if (
        r.work_date >= lastWeekStartIso &&
        r.work_date < lastWeekEndIso
      ) {
        lastWeekHoursPending += h;
      }
    }
  }

  // Booked counts for today's rows
  const sessionIds = todaySessions.map((s) => s.id);
  const bookedBy = new Map<string, number>();
  if (sessionIds.length > 0) {
    const { data: avail } = await admin
      .from("v_session_availability")
      .select("id, booked_count")
      .in("id", sessionIds);
    for (const r of avail ?? []) {
      if (r.id) bookedBy.set(r.id, r.booked_count ?? 0);
    }
  }

  // Week-param voor de "afgelopen week" CTA.
  const lastWeek = getIsoWeekYear(lastWeekStart);
  const urenHref = `/app/trainer/uren?week=${weekParam(lastWeek.isoYear, lastWeek.isoWeek)}`;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-14">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Trainer
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Hé {firstName}.
        </h1>
        {!trainer.is_active && (
          <p className="tmc-eyebrow text-[color:var(--warning)] mt-4">
            Je staat op inactief. Sessies komen niet meer je kant op.
          </p>
        )}
      </header>

      {announcements.length > 0 && (
        <div className="mb-12">
          <AnnouncementsFeed rows={announcements} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-8">
        <StatTile
          size="md"
          label="Vandaag"
          value={String(todaySessions.length)}
          hint={todaySessions.length === 1 ? "Sessie" : "Sessies"}
        />
        <StatTile
          size="md"
          label="Deze week"
          value={`${weekSessionCount}`}
          hint={`${weekHoursApproved.toFixed(1)}u goedgekeurd`}
        />
        <StatTile
          size="md"
          label="Uren deze maand"
          value={`${hoursMonthApproved.toFixed(1)}u`}
          hint={pendingHours > 0 ? `${pendingHours} nog te keuren` : "Goedgekeurd"}
        />
      </div>

      <LastWeekHoursCTA
        href={urenHref}
        weekNumber={lastWeek.isoWeek}
        approvedHours={lastWeekHoursApproved}
        pendingHours={lastWeekHoursPending}
      />

      <section className="mt-14 mb-14">
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">Vandaag</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {todaySessions.length === 0
              ? "Geen sessies vandaag"
              : `${todaySessions.length} sessie${todaySessions.length === 1 ? "" : "s"}`}
          </h2>
        </header>
        {todaySessions.length === 0 ? (
          <p className="text-text-muted text-sm">
            Niks in je agenda vandaag. Tijd voor je eigen training.
          </p>
        ) : (
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {todaySessions.map((s) => {
              const start = new Date(s.start_at);
              const end = new Date(s.end_at);
              const p = amsterdamParts(start);
              const booked = bookedBy.get(s.id) ?? 0;
              const full = booked >= s.capacity;
              return (
                <li
                  key={s.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 py-5 border-b border-[color:var(--ink-500)]/40 items-center"
                >
                  <div className="flex flex-col items-center w-12">
                    <span className="tmc-eyebrow">
                      {DAY_SHORT_NL[p.weekday]}
                    </span>
                    <span className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-none mt-1">
                      {p.day}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                      {MONTH_SHORT_NL[p.month - 1]}
                    </span>
                  </div>
                  <div>
                    <p className="text-text text-base font-medium">
                      {s.class_type?.name ?? "Sessie"}
                    </p>
                    <p className="text-text-muted text-sm mt-0.5">
                      {formatTimeRange(start, end)} ·{" "}
                      {PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar} ·{" "}
                      <span
                        className={
                          full ? "text-[color:var(--warning)]" : undefined
                        }
                      >
                        {booked}/{s.capacity} deelnemers
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/app/trainer/sessies/${s.id}`}
                    className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
                  >
                    Deelnemers
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        <QuickLink
          href="/app/trainer/sessies"
          title="Alle eigen sessies"
          hint="Deze en komende weken"
        />
        <QuickLink
          href="/app/trainer/uren"
          title="Urenregistratie"
          hint="Historie en handmatig invoeren"
        />
      </section>
    </div>
  );
}


function LastWeekHoursCTA({
  href,
  weekNumber,
  approvedHours,
  pendingHours,
}: {
  href: string;
  weekNumber: number;
  approvedHours: number;
  pendingHours: number;
}) {
  const hasActivity = approvedHours > 0 || pendingHours > 0;
  const headline = hasActivity
    ? `Afgelopen week: ${approvedHours.toFixed(1)}u ingediend`
    : `Uren invoeren voor week ${weekNumber}`;
  const sub = hasActivity
    ? pendingHours > 0
      ? `${pendingHours.toFixed(1)}u wacht op goedkeuring`
      : "Alles goedgekeurd"
    : "Nog niks geregistreerd voor afgelopen week";

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 p-6 bg-bg-elevated border border-accent/40 transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent"
    >
      <div>
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
          Urenregistratie
        </span>
        <p className="text-text text-lg font-medium tracking-[-0.01em] group-hover:text-accent transition-colors">
          {headline}
        </p>
        <p className="text-text-muted text-xs uppercase tracking-[0.14em] mt-1">
          {sub}
        </p>
      </div>
      <ChevronRight
        size={18}
        strokeWidth={1.5}
        className="text-text-muted group-hover:text-accent transition-colors shrink-0"
      />
    </Link>
  );
}

function QuickLink({
  href,
  title,
  hint,
}: {
  href: string;
  title: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 p-6 bg-bg-elevated border border-[color:var(--ink-500)] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent"
    >
      <div>
        <p className="text-text text-lg font-medium tracking-[-0.01em] group-hover:text-accent transition-colors">
          {title}
        </p>
        <p className="text-text-muted text-xs uppercase tracking-[0.14em] mt-1">
          {hint}
        </p>
      </div>
      <ChevronRight
        size={18}
        strokeWidth={1.5}
        className="text-text-muted group-hover:text-accent transition-colors"
      />
    </Link>
  );
}

function AnnouncementsFeed({
  rows,
}: {
  rows: Awaited<ReturnType<typeof listVisibleAnnouncements>>;
}) {
  return (
    <section>
      <header className="mb-4">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
          Aankondigingen
        </span>
      </header>
      <ul className="flex flex-col gap-4">
        {rows.map((a) => (
          <li
            key={a.id}
            className="p-5 bg-bg-elevated border-l-4 border-accent border-y border-r border-y-[color:var(--ink-500)]/60 border-r-[color:var(--ink-500)]/60"
          >
            <p className="text-text text-base font-medium tracking-[-0.01em] mb-2">
              {a.title}
            </p>
            {a.body && (
              <p className="text-text-muted text-sm leading-relaxed whitespace-pre-wrap">
                {a.body}
              </p>
            )}
            <p className="tmc-eyebrow text-text-muted/80 mt-3">
              {a.authorName}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
