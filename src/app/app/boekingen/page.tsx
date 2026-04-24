import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { isoDateAmsterdam } from "@/lib/format-date";
import type { SessionStatus } from "@/components/ui/StatusBadge";
import {
  BoekingenTabs,
  type BoekingenView,
} from "./_components/BoekingenTabs";
import { UpcomingRow } from "./_components/UpcomingRow";
import { HistoryRow } from "./_components/HistoryRow";

export const metadata = {
  title: "Boekingen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type BookingRow = {
  id: string;
  status: string;
  session:
    | {
        id: string;
        start_at: string;
        end_at: string;
        class_type: { name: string } | null;
        trainer: { display_name: string } | null;
      }
    | null;
};

function parseView(value: string | undefined): BoekingenView {
  return value === "historie" ? "historie" : "komend";
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function mapStatus(raw: string): SessionStatus {
  if (raw === "attended") return "attended";
  if (raw === "no_show") return "no_show";
  if (raw === "cancelled") return "cancelled";
  if (raw === "waitlisted") return "waitlisted";
  return "booked";
}

function logIfError(tag: string, error: { message: string } | null) {
  if (error) {
    console.error(`[/app/boekingen] ${tag} query failed:`, error.message);
  }
}

export default async function BoekingenPage(props: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { view: viewParam, page: pageParam } = await props.searchParams;
  const view = parseView(viewParam);
  const page = parsePage(pageParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const nowIso = new Date().toISOString();

  const [
    settingsResult,
    upcomingResult,
    historyResult,
    historyCountResult,
    todayCheckInsResult,
  ] = await Promise.all([
      supabase
        .from("booking_settings")
        .select("cancellation_window_hours")
        .limit(1)
        .maybeSingle(),
      view === "komend"
        ? supabase
            .from("bookings")
            .select(
              `
                id,
                status,
                session:class_sessions!inner(
                  id, start_at, end_at,
                  class_type:class_types(name),
                  trainer:trainers(display_name)
                )
              `,
            )
            .eq("profile_id", user.id)
            .eq("status", "booked")
            .gte("session.start_at", nowIso)
            .order("session(start_at)", { ascending: true })
            .returns<BookingRow[]>()
        : Promise.resolve({ data: null, error: null }),
      view === "historie"
        ? supabase
            .from("bookings")
            .select(
              `
                id,
                status,
                session:class_sessions!inner(
                  id, start_at, end_at,
                  class_type:class_types(name),
                  trainer:trainers(display_name)
                )
              `,
            )
            .eq("profile_id", user.id)
            .lt("session.start_at", nowIso)
            .order("session(start_at)", { ascending: false })
            .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
            .returns<BookingRow[]>()
        : Promise.resolve({ data: null, error: null }),
      view === "historie"
        ? supabase
            .from("bookings")
            .select("id, class_sessions!inner(start_at)", {
              count: "exact",
              head: true,
            })
            .eq("profile_id", user.id)
            .lt("class_sessions.start_at", nowIso)
        : Promise.resolve({ data: null, error: null, count: 0 }),
      // Vandaag's check-ins (per session) voor hint-rendering op
      // UpcomingRow. Alleen relevant voor de komend-tab.
      view === "komend"
        ? (() => {
            const startUtc = new Date();
            startUtc.setUTCHours(0, 0, 0, 0);
            return supabase
              .from("check_ins")
              .select("session_id, checked_in_at")
              .eq("profile_id", user.id)
              .not("session_id", "is", null)
              .gte("checked_in_at", startUtc.toISOString());
          })()
        : Promise.resolve({ data: null, error: null }),
    ]);

  logIfError("settings", settingsResult.error);
  logIfError("upcoming", upcomingResult.error);
  logIfError("history", historyResult.error);
  logIfError("history count", historyCountResult.error);
  logIfError("today check-ins", todayCheckInsResult.error);

  const cancellationWindowHours =
    settingsResult.data?.cancellation_window_hours ?? 6;

  const checkInBySession = new Map<string, string>();
  for (const ci of todayCheckInsResult.data ?? []) {
    if (ci.session_id && ci.checked_in_at) {
      checkInBySession.set(ci.session_id, ci.checked_in_at);
    }
  }
  const todayIsoForHint = isoDateAmsterdam(new Date());
  const amsterdamTime = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const upcomingRows =
    (upcomingResult.data ?? [])
      .filter((b) => b.session)
      .map((b) => {
        const start = new Date(b.session!.start_at);
        const sessionIso = isoDateAmsterdam(start);
        const isToday = sessionIso === todayIsoForHint;
        const status =
          b.status === "waitlisted" ? ("waitlisted" as const) : ("booked" as const);
        const checkedInAt = checkInBySession.get(b.session!.id);
        let checkInHint: string | null = null;
        let checkedIn = false;
        if (checkedInAt) {
          checkInHint = `Ingecheckt ${amsterdamTime.format(new Date(checkedInAt))}`;
          checkedIn = true;
        } else if (isToday && status === "booked") {
          checkInHint = "Check in bij de tablet";
        }
        return {
          bookingId: b.id,
          startAt: b.session!.start_at,
          endAt: b.session!.end_at,
          className: b.session!.class_type?.name ?? "Sessie",
          trainerName: b.session!.trainer?.display_name ?? "coach",
          status,
          checkInHint,
          checkedIn,
        };
      });

  const historyRows =
    (historyResult.data ?? [])
      .filter((b) => b.session)
      .map((b) => ({
        bookingId: b.id,
        startAt: b.session!.start_at,
        className: b.session!.class_type?.name ?? "Sessie",
        trainerName: b.session!.trainer?.display_name ?? "coach",
        status: mapStatus(b.status),
      }));

  const historyTotal = historyCountResult.count ?? 0;
  const historyLastPage = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const hasPrev = view === "historie" && page > 1;
  const hasNext = view === "historie" && page < historyLastPage;

  return (
    <Container className="py-16 md:py-20">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Je agenda
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          Mijn boekingen.
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Je gereserveerde momenten, en wat je al hebt gedaan.
        </p>
      </header>

      <div className="mb-12">
        <BoekingenTabs
          active={view}
          upcomingHref="/app/boekingen"
          historyHref="/app/boekingen?view=historie"
        />
      </div>

      {view === "komend" && (
        <div
          role="tabpanel"
          aria-label="Komende boekingen"
          className="animate-tab-in"
        >
          {upcomingRows.length === 0 ? (
            <EmptyUpcoming />
          ) : (
            <div>
              {upcomingRows.map((row) => (
                <UpcomingRow
                  key={row.bookingId}
                  row={row}
                  cancellationWindowHours={cancellationWindowHours}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {view === "historie" && (
        <div
          role="tabpanel"
          aria-label="Historie"
          className="animate-tab-in"
        >
          {historyRows.length === 0 ? (
            <EmptyHistory />
          ) : (
            <>
              <div>
                {historyRows.map((row) => (
                  <HistoryRow key={row.bookingId} row={row} />
                ))}
              </div>
              {(hasPrev || hasNext) && (
                <nav
                  aria-label="Paginering"
                  className="mt-12 flex items-center justify-between gap-4 text-xs text-text-muted"
                >
                  <span>
                    Pagina {page} van {historyLastPage} · {historyTotal}{" "}
                    boekingen
                  </span>
                  <div className="flex items-center gap-2">
                    {hasPrev && (
                      <Link
                        href={`/app/boekingen?view=historie&page=${page - 1}`}
                        scroll={false}
                        className="px-4 py-2 border border-text-muted/30 uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
                      >
                        Vorige
                      </Link>
                    )}
                    {hasNext && (
                      <Link
                        href={`/app/boekingen?view=historie&page=${page + 1}`}
                        scroll={false}
                        className="px-4 py-2 border border-text-muted/30 uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
                      >
                        Volgende
                      </Link>
                    )}
                  </div>
                </nav>
              )}
            </>
          )}
        </div>
      )}
    </Container>
  );
}

function EmptyUpcoming() {
  return (
    <section className="bg-bg-elevated p-10 md:p-12 text-center">
      <span className="tmc-eyebrow block mb-4">Leeg voor nu</span>
      <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
        Nog geen sessie geboekt.
      </h2>
      <p className="text-text-muted text-base leading-relaxed mb-8 max-w-md mx-auto">
        De agenda staat open. Reserveer je eerste moment en kom langs.
      </p>
      <Button href="/app/rooster">Naar rooster</Button>
    </section>
  );
}

function EmptyHistory() {
  return (
    <section className="bg-bg-elevated p-10 md:p-12 text-center">
      <span className="tmc-eyebrow block mb-4">Geschiedenis</span>
      <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
        Je tijdlijn staat nog leeg.
      </h2>
      <p className="text-text-muted text-base leading-relaxed max-w-md mx-auto">
        Na je eerste sessie verschijnt hier een rustige tijdlijn van alles wat
        je hebt gedaan.
      </p>
    </section>
  );
}
