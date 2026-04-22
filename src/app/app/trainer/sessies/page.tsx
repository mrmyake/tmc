import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatTimeRange,
} from "@/lib/format-date";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

export const metadata = {
  title: "Trainer · Sessies | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  pillar: string;
  capacity: number;
  class_type: { name: string | null } | null;
};

interface DayBucket {
  key: string;
  label: string;
  dayNumber: number;
  monthShort: string;
  sessions: SessionRow[];
}

export default async function TrainerSessiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();

  const { data: trainer } = await admin
    .from("trainers")
    .select("id, display_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!trainer) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-14">
        <p className="text-text-muted text-sm">
          Je hebt geen trainer-profiel.
        </p>
      </div>
    );
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 28 * 86_400_000);

  const { data: sessions } = await admin
    .from("class_sessions")
    .select(
      `id, start_at, end_at, status, pillar, capacity,
       class_type:class_types(name)`,
    )
    .eq("trainer_id", trainer.id)
    .gte("start_at", now.toISOString())
    .lt("start_at", horizon.toISOString())
    .order("start_at")
    .returns<SessionRow[]>();

  // Booked-count per session
  const ids = (sessions ?? []).map((s) => s.id);
  const bookedBy = new Map<string, number>();
  if (ids.length > 0) {
    const { data: avail } = await admin
      .from("v_session_availability")
      .select("id, booked_count")
      .in("id", ids);
    for (const r of avail ?? []) {
      if (r.id) bookedBy.set(r.id, r.booked_count ?? 0);
    }
  }

  const buckets: DayBucket[] = [];
  const byKey = new Map<string, DayBucket>();
  for (const s of sessions ?? []) {
    const d = new Date(s.start_at);
    const p = amsterdamParts(d);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: DAY_SHORT_NL[p.weekday],
        dayNumber: p.day,
        monthShort: MONTH_SHORT_NL[p.month - 1],
        sessions: [],
      };
      byKey.set(key, bucket);
      buckets.push(bucket);
    }
    bucket.sessions.push(s);
  }

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <Link
        href="/app/trainer"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors mb-6"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        Terug
      </Link>
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Mijn sessies
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Komende 4 weken.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {sessions?.length ?? 0} sessie{(sessions?.length ?? 0) === 1 ? "" : "s"}
        </p>
      </header>

      {buckets.length === 0 ? (
        <div className="py-16 text-center">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Stil
          </span>
          <p className="text-text-muted text-sm max-w-md mx-auto">
            Er staan geen geplande sessies voor jou. Check met admin of de
            templates kloppen.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {buckets.map((b) => (
            <section key={b.key}>
              <header className="flex items-baseline gap-4 mb-4 pb-3 border-b border-[color:var(--ink-500)]/60">
                <span className="tmc-eyebrow tmc-eyebrow--accent">{b.label}</span>
                <span className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-none">
                  {b.dayNumber}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                  {b.monthShort}
                </span>
              </header>
              <ul className="flex flex-col">
                {b.sessions.map((s) => {
                  const start = new Date(s.start_at);
                  const end = new Date(s.end_at);
                  const booked = bookedBy.get(s.id) ?? 0;
                  const cancelled = s.status === "cancelled";
                  return (
                    <li
                      key={s.id}
                      className={`grid grid-cols-[auto_1fr_auto] gap-5 py-5 border-b border-[color:var(--ink-500)]/40 items-center ${
                        cancelled
                          ? "opacity-50 line-through decoration-text-muted/60"
                          : ""
                      }`}
                    >
                      <span className="text-sm text-text tabular-nums">
                        {formatTimeRange(start, end)}
                      </span>
                      <div>
                        <p className="text-text text-base">
                          {s.class_type?.name ?? "Sessie"}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          {PILLAR_LABELS[s.pillar as Pillar] ?? s.pillar} ·{" "}
                          {booked}/{s.capacity} geboekt
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
