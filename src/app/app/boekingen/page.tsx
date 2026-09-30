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
import { bookingTimes, cancelWindowMinutes } from "@/lib/member/booking-times";
import { HistoryRow, type HistoryRowData } from "./_components/HistoryRow";
import { PtUpcomingRow, type PtUpcomingRowData } from "./_components/PtUpcomingRow";
import { WaitlistRow, type WaitlistRowData } from "./_components/WaitlistRow";
import type { MyWaitlistEntry } from "@/lib/member/waitlist";

export const metadata = {
  title: "Boekingen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type BookingRow = {
  id: string;
  status: string;
  no_show_at: string | null;
  booked_at?: string;
  pillar?: string;
  slot_start_at?: string | null;
  slot_end_at?: string | null;
  session:
    | {
        id: string;
        start_at: string;
        end_at: string;
        rescheduled_at?: string | null;
        occurrence_start_at?: string;
        class_type: { name: string } | null;
        trainer: { display_name: string } | null;
      }
    | null;
};

type PtBookingRow = {
  id: string;
  status: string;
  session:
    | {
        id: string;
        start_at: string;
        end_at: string;
        format: string | null;
        program_id: string | null;
        trainer: { display_name: string } | null;
        program: { total_sessions: number } | null;
      }
    | null;
};

// COPY: confirm met Marlon
const PT_FORMAT_LABEL: Record<string, string> = {
  one_on_one: "Losse PT-sessie",
  duo: "Duo-sessie",
  small_group_4: "Small group-sessie",
};

/**
 * PT-agenda PR E: label voor een PT-boeking in de leden-boekingenlijst.
 * Een programma-sessie toont bewust alleen de voortgang (sessie X van N),
 * NOOIT een creditsaldo (vergrendelde regel); X is de chronologische
 * positie van deze sessie binnen alle sessies van hetzelfde programma,
 * N is pt_programs.total_sessions.
 */
function ptSessionLabel(
  format: string | null,
  programId: string | null,
  programTotal: number | undefined,
  ordinal: number | undefined,
): string {
  if (programId && programTotal && ordinal) {
    return `Programma-sessie · sessie ${ordinal} van ${programTotal}`;
  }
  return (format && PT_FORMAT_LABEL[format]) ?? "PT-sessie";
}

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

/**
 * Leidt display-status af uit de slim'd {booked, cancelled, waitlisted}
 * + check_ins presence + no_show_at. check_in wint van no_show_at omdat
 * een latere admin-override (attended) een eerder geregistreerde no_show
 * corrigeert.
 */
function deriveDisplayStatus(
  rawStatus: string,
  hasCheckIn: boolean,
  noShowAt: string | null,
): string {
  if (hasCheckIn) return "attended";
  if (noShowAt) return "no_show";
  return rawStatus;
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
    ptUpcomingResult,
    ptHistoryResult,
    ptPendingCancellationsResult,
    waitlistResult,
  ] = await Promise.all([
      supabase
        .from("booking_settings")
        .select("cancellation_window_hours, vrij_trainen_cancel_window_minutes")
        .limit(1)
        .maybeSingle(),
      view === "komend"
        ? supabase
            .from("bookings")
            .select(
              `
                id,
                status,
                no_show_at,
                booked_at,
                pillar,
                slot_start_at,
                slot_end_at,
                session:class_sessions!inner(
                  id, start_at, end_at, rescheduled_at, occurrence_start_at,
                  class_type:class_types(name),
                  trainer:trainers(display_name)
                )
              `,
            )
            .eq("profile_id", user.id)
            .eq("status", "booked")
            // Op end_at: een vrij-trainen-slot hoort bij een dagsessie die om
            // 07:00 al begonnen kan zijn. De echte start (slot of sessie)
            // filtert en sorteert hieronder (spec-vrij-trainen-slots.md).
            .gte("session.end_at", nowIso)
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
                no_show_at,
                slot_start_at,
                slot_end_at,
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
      // PT-agenda PR E: eigen PT/duo/programma-sessies, naast de
      // groepslessen hierboven. RLS (pt_bookings_self_read +
      // pt_sessions_member_booked_read/has_own_pt_booking) scoped al op
      // het eigen profiel; geen service-role, geen nieuwe RPC. Intakes
      // zijn account-loos en hebben nooit een pt_booking, dus die komen
      // hier vanzelf nooit in beeld. Alleen status 'booked' (zelfde
      // conventie als de groepsles-upcoming hierboven).
      view === "komend"
        ? supabase
            .from("pt_bookings")
            .select(
              `
                id, status,
                session:pt_sessions!inner(
                  id, start_at, end_at, format, program_id,
                  trainer:trainers(display_name),
                  program:pt_programs(total_sessions)
                )
              `,
            )
            .eq("profile_id", user.id)
            .eq("status", "booked")
            .gte("session.start_at", nowIso)
            .order("session(start_at)", { ascending: true })
            .returns<PtBookingRow[]>()
        : Promise.resolve({ data: null, error: null }),
      view === "historie"
        ? supabase
            .from("pt_bookings")
            .select(
              `
                id, status,
                session:pt_sessions!inner(
                  id, start_at, end_at, format, program_id,
                  trainer:trainers(display_name),
                  program:pt_programs(total_sessions)
                )
              `,
            )
            .eq("profile_id", user.id)
            .lt("session.start_at", nowIso)
            .order("session(start_at)", { ascending: false })
            .returns<PtBookingRow[]>()
        : Promise.resolve({ data: null, error: null }),
      // PT-agenda PR E2: eigen openstaande annuleer-verzoeken, om per
      // PT-rij te bepalen of de aanvraag-actie plaats moet maken voor de
      // "Annulering aangevraagd"-status. RLS (pcr_self_read) scoped al op
      // het eigen profiel; alleen relevant in de komend-tab.
      view === "komend"
        ? supabase
            .from("pt_cancellation_requests")
            .select("id, pt_booking_id, status")
            .eq("profile_id", user.id)
            .eq("status", "pending")
        : Promise.resolve({ data: null, error: null }),
      // Eigen open wachtlijstentries (wachtend of open promotie) als eigen
      // rijen bij Aankomend (spec-community-growth.md, sectie Wachtlijst).
      // De oude afleiding uit bookings.status = 'waitlisted' hieronder blijft
      // staan; niets schrijft die status nog.
      view === "komend"
        ? supabase.rpc("my_waitlist_entries")
        : Promise.resolve({ data: null, error: null }),
    ]);

  logIfError("settings", settingsResult.error);
  logIfError("upcoming", upcomingResult.error);
  logIfError("history", historyResult.error);
  logIfError("history count", historyCountResult.error);
  logIfError("today check-ins", todayCheckInsResult.error);
  logIfError("pt upcoming", ptUpcomingResult.error);
  logIfError("pt history", ptHistoryResult.error);
  logIfError("pt pending cancellations", ptPendingCancellationsResult.error);
  logIfError("waitlist", waitlistResult.error);

  // Lesgegevens voor de wachtlijstrijen: authenticated leest class_sessions
  // per kolomgrant (zelfde kolommen als het rooster).
  const waitlistEntries = (waitlistResult.data ?? []) as MyWaitlistEntry[];
  const waitlistSessionIds = waitlistEntries.map((w) => w.session_id);
  const waitlistSessionsResult = waitlistSessionIds.length
    ? await supabase
        .from("class_sessions")
        .select(
          `id, start_at, end_at,
           class_type:class_types(name),
           trainer:trainers(display_name)`,
        )
        .in("id", waitlistSessionIds)
        .returns<
          Array<{
            id: string;
            start_at: string;
            end_at: string;
            class_type: { name: string } | null;
            trainer: { display_name: string } | null;
          }>
        >()
    : { data: null, error: null };
  logIfError("waitlist sessions", waitlistSessionsResult.error);
  const waitlistSessionById = new Map(
    (waitlistSessionsResult.data ?? []).map((s) => [s.id, s]),
  );

  const waitlistRows: WaitlistRowData[] = waitlistEntries.flatMap((w) => {
    const s = waitlistSessionById.get(w.session_id);
    if (!s) return [];
    return [
      {
        entryId: w.entry_id,
        sessionId: w.session_id,
        startAt: s.start_at,
        endAt: s.end_at,
        className: s.class_type?.name ?? "Sessie",
        trainerName: s.trainer?.display_name ?? "coach",
        state: w.state,
        rank: w.rank,
        confirmationDeadline: w.confirmation_deadline,
      },
    ];
  });

  const cancelSettings = {
    cancellationWindowHours: settingsResult.data?.cancellation_window_hours ?? 6,
    vrijTrainenCancelWindowMinutes:
      settingsResult.data?.vrij_trainen_cancel_window_minutes ?? 5,
  };

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
      .map((b) => ({ b, ...bookingTimes(b, b.session!) }))
      .filter((r) => Date.parse(r.startAt) >= Date.parse(nowIso))
      .sort((x, y) => Date.parse(x.startAt) - Date.parse(y.startAt))
      .map(({ b, startAt, endAt }) => {
        const start = new Date(startAt);
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
        // Verschoven les (spec-session-overrides.md): oude tijd tonen en,
        // als de boeking van voor de verschuiving is, kosteloos annuleren
        // tot de start (zelfde regel als cancel_class_booking).
        const rescheduledAt = b.session!.rescheduled_at ?? null;
        const occurrence = b.session!.occurrence_start_at ?? b.session!.start_at;
        const rescheduledFrom =
          rescheduledAt && occurrence !== b.session!.start_at
            ? amsterdamTime.format(new Date(occurrence))
            : null;
        const freeCancel = Boolean(
          rescheduledAt &&
            b.booked_at &&
            new Date(b.booked_at).getTime() < new Date(rescheduledAt).getTime(),
        );
        return {
          bookingId: b.id,
          startAt,
          endAt,
          className: b.session!.class_type?.name ?? "Sessie",
          trainerName: b.session!.trainer?.display_name ?? "coach",
          status,
          cancelWindowMinutes: cancelWindowMinutes(b.pillar, cancelSettings),
          checkInHint,
          checkedIn,
          rescheduledFrom,
          freeCancel,
        };
      });

  // Boekingen en wachtlijstrijen door elkaar op starttijd.
  const komendRows = [
    ...upcomingRows.map((row) => ({ kind: "booking" as const, startAt: row.startAt, row })),
    ...waitlistRows.map((row) => ({ kind: "waitlist" as const, startAt: row.startAt, row })),
  ].sort((x, y) => Date.parse(x.startAt) - Date.parse(y.startAt));

  // History: attended/no_show afleiden uit check_ins presence + no_show_at
  // omdat bookings.status alleen nog {booked, cancelled, waitlisted} bevat
  // na de slim.
  const historySessionIds = (historyResult.data ?? [])
    .map((b) => b.session?.id)
    .filter((id): id is string => Boolean(id));

  const historyCheckIns = historySessionIds.length
    ? await supabase
        .from("check_ins")
        .select("session_id")
        .eq("profile_id", user.id)
        .in("session_id", historySessionIds)
    : { data: null, error: null };
  logIfError("history check-ins", historyCheckIns.error);

  const historyCheckInSessionIds = new Set(
    (historyCheckIns.data ?? [])
      .map((c) => c.session_id)
      .filter((id): id is string => Boolean(id)),
  );

  const historyRows =
    (historyResult.data ?? [])
      .filter((b) => b.session)
      // Een vrij-trainen-slot van vandaag dat nog moet beginnen staat bij
      // komend, niet hier (de query filtert op de sessiestart van 07:00).
      .filter((b) => Date.parse(bookingTimes(b, b.session!).startAt) < Date.parse(nowIso))
      .map((b) => {
        const hasCheckIn = historyCheckInSessionIds.has(b.session!.id);
        const displayStatus = deriveDisplayStatus(
          b.status,
          hasCheckIn,
          b.no_show_at,
        );
        return {
          bookingId: b.id,
          startAt: bookingTimes(b, b.session!).startAt,
          className: b.session!.class_type?.name ?? "Sessie",
          trainerName: b.session!.trainer?.display_name ?? "coach",
          status: mapStatus(displayStatus),
        };
      });

  const historyTotal = historyCountResult.count ?? 0;
  const historyLastPage = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));
  const hasPrev = view === "historie" && page > 1;
  const hasNext = view === "historie" && page < historyLastPage;

  // PT-agenda PR E: sessie X van N is de chronologische positie van deze
  // sessie binnen ALLE sessies van hetzelfde programma (niet alleen de
  // sessies in deze view); nooit een creditsaldo. admin_plan_pt_program
  // creëert bij aanmaak alle sessies van een programma in een keer, dus
  // "alle sessies" hier is stabiel. RLS (has_own_pt_booking) laat het lid
  // elke sessie van het eigen programma lezen, geen service-role nodig.
  const ptBookingRows = [
    ...(ptUpcomingResult.data ?? []),
    ...(ptHistoryResult.data ?? []),
  ];
  const programIds = Array.from(
    new Set(
      ptBookingRows
        .map((b) => b.session?.program_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const programOrdinalBySession = new Map<string, number>();
  if (programIds.length > 0) {
    const { data: programSessions, error: programSessionsError } =
      await supabase
        .from("pt_sessions")
        .select("id, program_id, start_at")
        .in("program_id", programIds)
        .order("start_at", { ascending: true });
    logIfError("pt program sessions", programSessionsError);
    const byProgram = new Map<string, string[]>();
    for (const s of programSessions ?? []) {
      const list = byProgram.get(s.program_id!) ?? [];
      list.push(s.id);
      byProgram.set(s.program_id!, list);
    }
    for (const list of byProgram.values()) {
      list.forEach((sessionId, index) =>
        programOrdinalBySession.set(sessionId, index + 1),
      );
    }
  }

  const ptPendingCancellationBookingIds = new Set(
    (ptPendingCancellationsResult.data ?? []).map((r) => r.pt_booking_id),
  );

  const ptUpcomingRows: PtUpcomingRowData[] = (ptUpcomingResult.data ?? [])
    .filter((b) => b.session)
    .map((b) => ({
      bookingId: b.id,
      startAt: b.session!.start_at,
      endAt: b.session!.end_at,
      label: ptSessionLabel(
        b.session!.format,
        b.session!.program_id,
        b.session!.program?.total_sessions,
        programOrdinalBySession.get(b.session!.id),
      ),
      trainerName: b.session!.trainer?.display_name ?? "coach",
      status: "booked" as const,
      hasPendingCancellation: ptPendingCancellationBookingIds.has(b.id),
    }));

  const ptHistoryRows: HistoryRowData[] = (ptHistoryResult.data ?? [])
    .filter((b) => b.session)
    .map((b) => ({
      bookingId: b.id,
      startAt: b.session!.start_at,
      className: ptSessionLabel(
        b.session!.format,
        b.session!.program_id,
        b.session!.program?.total_sessions,
        programOrdinalBySession.get(b.session!.id),
      ),
      trainerName: b.session!.trainer?.display_name ?? "coach",
      status: mapStatus(b.status),
    }));

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
          {komendRows.length === 0 && ptUpcomingRows.length === 0 ? (
            <EmptyUpcoming />
          ) : (
            <>
              {komendRows.length > 0 && (
                <div>
                  {komendRows.map((item) =>
                    item.kind === "booking" ? (
                      <UpcomingRow key={item.row.bookingId} row={item.row} />
                    ) : (
                      <WaitlistRow key={item.row.entryId} row={item.row} />
                    ),
                  )}
                </div>
              )}

              {ptUpcomingRows.length > 0 && (
                <div className={komendRows.length > 0 ? "mt-12" : undefined}>
                  <span className="tmc-eyebrow block mb-6">PT-sessies</span>
                  <p className="text-text-muted text-sm mb-6 max-w-md">
                    {/* COPY: confirm met Marlon */}
                    Kun je niet? Vraag een annulering aan. Je sessie blijft
                    gepland tot Marlon je verzoek heeft behandeld.
                  </p>
                  <div>
                    {ptUpcomingRows.map((row) => (
                      <PtUpcomingRow key={row.bookingId} row={row} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === "historie" && (
        <div
          role="tabpanel"
          aria-label="Historie"
          className="animate-tab-in"
        >
          {historyRows.length === 0 && ptHistoryRows.length === 0 ? (
            <EmptyHistory />
          ) : (
            <>
              {historyRows.length > 0 && (
                <div>
                  {historyRows.map((row) => (
                    <HistoryRow key={row.bookingId} row={row} />
                  ))}
                </div>
              )}

              {ptHistoryRows.length > 0 && (
                <div className={historyRows.length > 0 ? "mt-12" : undefined}>
                  <span className="tmc-eyebrow block mb-6">PT-sessies</span>
                  <div>
                    {ptHistoryRows.map((row) => (
                      <HistoryRow key={row.bookingId} row={row} />
                    ))}
                  </div>
                </div>
              )}

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
