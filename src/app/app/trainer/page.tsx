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

export default async function TrainerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();

  // Find the trainer row for this profile. Admin viewing this route sees
  // the first trainer (fallback) or nothing. We want the trainer-of-self.
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, display_name, pillar_specialties, is_active")
    .eq("profile_id", user.id)
    .maybeSingle();

  const firstName = user.user_metadata?.first_name ?? user.email?.split("@")[0] ?? "";

  const now = new Date();
  const todayIso = isoDateAms(now);
  const weekStart = startOfIsoWeekUtc(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const monthStart = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), 1),
  );

  // If this isn't a trainer profile, render a lean admin view with a
  // picker hint. Admins reach this page but have no trainer row of their
  // own unless they're also a coach.
  if (!trainer) {
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
      </div>
    );
  }

  const [todaySessionsRes, weekSessionsRes, hoursMonthRes, pendingHoursRes] =
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
        .select("hours, status")
        .eq("trainer_id", trainer.id)
        .gte("work_date", isoDateAms(monthStart)),
      admin
        .from("trainer_hours")
        .select("id", { count: "exact", head: true })
        .eq("trainer_id", trainer.id)
        .eq("status", "pending"),
    ]);

  const todaySessions = todaySessionsRes.data ?? [];
  const weekSessionCount = weekSessionsRes.count ?? 0;
  const hoursMonth = (hoursMonthRes.data ?? []).reduce<number>((sum, r) => {
    if (r.status !== "approved") return sum;
    const n = typeof r.hours === "number" ? r.hours : Number(r.hours);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const pendingHours = pendingHoursRes.count ?? 0;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-14">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Trainer
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Hé {firstName}.
        </h1>
        {!trainer.is_active && (
          <p className="tmc-eyebrow text-[color:var(--warning)] mt-4">
            Je staat op inactief — sessies komen niet meer je kant op.
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-14">
        <StatTile label="Vandaag" value={String(todaySessions.length)} hint="Geplande sessies" />
        <StatTile label="Deze week" value={String(weekSessionCount)} hint="Totaal aantal" />
        <StatTile
          label="Uren deze maand"
          value={`${hoursMonth.toFixed(1)}u`}
          hint={pendingHours > 0 ? `${pendingHours} nog te keuren` : "Goedgekeurd"}
        />
      </div>

      <section className="mb-14">
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
                      {PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar}
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
          title="Uren indienen"
          hint="Registratie per werkdag"
        />
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-bg-elevated p-5 border border-[color:var(--ink-500)]">
      <span className="tmc-eyebrow block mb-2">{label}</span>
      <p className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-none tracking-[-0.02em] mb-1">
        {value}
      </p>
      {hint && (
        <p className="text-[11px] text-text-muted uppercase tracking-[0.14em]">
          {hint}
        </p>
      )}
    </div>
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
