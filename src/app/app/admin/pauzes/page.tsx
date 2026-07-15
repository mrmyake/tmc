import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatShortDate,
  formatTimeRange,
  isCancellable,
} from "@/lib/format-date";
import { PauseRow } from "./_components/PauseRow";
import { PtCancellationRow } from "./_components/PtCancellationRow";

export const metadata = {
  title: "Admin · Pauzes | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  pregnancy: "Zwangerschap",
  medical: "Medisch",
  other_approved: "Anders (goedgekeurd)",
};

// COPY: confirm met Marlon
const PT_SESSION_TYPE_LABEL: Record<string, string> = {
  one_on_one: "Losse PT-sessie",
  duo: "Duo-sessie",
  small_group_4: "Small group-sessie",
};

const PT_CANCELLATION_SELECT = `
  id, reason, status, resolution_note, with_restitution, resolved_at, created_at,
  profile_id,
  profile:profiles!profile_id(first_name, last_name, email),
  booking:pt_bookings(
    credits_used_from,
    session:pt_sessions(
      id, start_at, end_at, format, trainer_id,
      trainer:trainers(display_name)
    )
  )
`;

type PtCancellationRequestRow = {
  id: string;
  reason: string | null;
  status: string;
  resolution_note: string | null;
  with_restitution: boolean | null;
  resolved_at: string | null;
  created_at: string;
  profile_id: string;
  profile: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  booking: {
    credits_used_from: string | null;
    session: {
      id: string;
      start_at: string;
      end_at: string;
      format: string;
      trainer_id: string;
      trainer: { display_name: string } | null;
    } | null;
  } | null;
};

type Row = {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  notes: string | null;
  created_at: string;
  medical_attest_url: string | null;
  membership: {
    id: string;
    plan_type: string;
    plan_variant: string | null;
    profile_id: string;
    profile: {
      first_name: string;
      last_name: string;
      email: string;
    } | null;
  } | null;
};

export default async function AdminPauzesPage() {
  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("membership_pauses")
    .select(
      `
        id, start_date, end_date, reason, status, notes, created_at,
        medical_attest_url,
        membership:memberships(
          id, plan_type, plan_variant, profile_id,
          profile:profiles!profile_id(first_name, last_name, email)
        )
      `,
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<Row[]>();

  const { data: recent } = await admin
    .from("membership_pauses")
    .select(
      `
        id, start_date, end_date, reason, status, notes, created_at,
        medical_attest_url,
        membership:memberships(
          id, plan_type, plan_variant, profile_id,
          profile:profiles!profile_id(first_name, last_name, email)
        )
      `,
    )
    .in("status", ["approved", "rejected"])
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(20)
    .returns<Row[]>();

  const { data: ptPending } = await admin
    .from("pt_cancellation_requests")
    .select(PT_CANCELLATION_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<PtCancellationRequestRow[]>();

  const { data: ptRecent } = await admin
    .from("pt_cancellation_requests")
    .select(PT_CANCELLATION_SELECT)
    .in("status", ["approved", "rejected"])
    .order("resolved_at", { ascending: false, nullsFirst: false })
    .limit(10)
    .returns<PtCancellationRequestRow[]>();

  // PR J: dezelfde bron als cancel_pt/de trainer-agenda, dedupliceer per
  // trainer zodat een drukke trainer niet meerdere keren bevraagd wordt.
  const ptTrainerIds = Array.from(
    new Set(
      (ptPending ?? [])
        .map((r) => r.booking?.session?.trainer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const cancelWindowByTrainer = new Map<string, number>();
  await Promise.all(
    ptTrainerIds.map(async (trainerId) => {
      const { data: rows } = await admin.rpc("pt_trainer_settings", {
        p_trainer_id: trainerId,
      });
      cancelWindowByTrainer.set(
        trainerId,
        rows?.[0]?.cancel_window_hours ?? 24,
      );
    }),
  );

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Pauze-verzoeken.
        </h1>
        <p className="tmc-eyebrow mt-4">
          {(pending ?? []).length} open ·{" "}
          {(recent ?? []).length} recent afgehandeld
        </p>
      </header>

      <section className="mb-14">
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">Openstaand</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {(pending ?? []).length === 0
              ? "Niks te keuren"
              : `${pending?.length} te beoordelen`}
          </h2>
        </header>
        {(pending ?? []).length === 0 ? (
          <div className="py-12 text-center border-t border-[color:var(--ink-500)]/60">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
              Up to date
            </span>
            <p className="text-text-muted text-sm max-w-md mx-auto">
              Geen openstaande pauze-verzoeken. Alles is afgehandeld.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {(pending ?? []).map((p) => (
              <li key={p.id}>
                <PauseRow
                  pauseId={p.id}
                  status={p.status}
                  firstName={p.membership?.profile?.first_name ?? ""}
                  lastName={p.membership?.profile?.last_name ?? ""}
                  email={p.membership?.profile?.email ?? ""}
                  profileId={p.membership?.profile_id ?? null}
                  planLabel={
                    [p.membership?.plan_type, p.membership?.plan_variant]
                      .filter(Boolean)
                      .join(" · ") || "Abonnement"
                  }
                  startDate={p.start_date}
                  endDate={p.end_date}
                  reasonLabel={REASON_LABEL[p.reason] ?? p.reason}
                  attestUrl={p.medical_attest_url}
                  notes={p.notes}
                  createdAt={p.created_at}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {(recent ?? []).length > 0 && (
        <section>
          <header className="mb-6">
            <span className="tmc-eyebrow block mb-2">Historie</span>
            <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
              Recent afgehandeld
            </h2>
          </header>
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {(recent ?? []).map((p) => {
              const name =
                [
                  p.membership?.profile?.first_name,
                  p.membership?.profile?.last_name,
                ]
                  .filter(Boolean)
                  .join(" ") || "Lid";
              const approved = p.status === "approved";
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4 border-b border-[color:var(--ink-500)]/40"
                >
                  <span className="text-sm text-text">
                    {p.membership?.profile_id ? (
                      <Link
                        href={`/app/admin/leden/${p.membership.profile_id}`}
                        className="hover:text-accent transition-colors"
                      >
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatShortDate(new Date(`${p.start_date}T00:00:00Z`))}{" "}
                    &rarr;{" "}
                    {formatShortDate(new Date(`${p.end_date}T00:00:00Z`))}
                  </span>
                  <span className="text-xs text-text-muted">
                    {REASON_LABEL[p.reason] ?? p.reason}
                  </span>
                  <span
                    className={`ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] ${
                      approved
                        ? "text-[color:var(--success)]"
                        : "text-[color:var(--danger)]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`w-1.5 h-1.5 rounded-full ${
                        approved
                          ? "bg-[color:var(--success)]"
                          : "bg-[color:var(--danger)]"
                      }`}
                    />
                    {approved ? "Goedgekeurd" : "Afgewezen"}
                  </span>
                  {!approved && p.notes && (
                    <p className="w-full text-xs text-[color:var(--danger)] mt-1">
                      Reden: {p.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mb-14">
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">PT-annuleringen</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {(ptPending ?? []).length === 0
              ? "Niks te keuren"
              : `${ptPending?.length} te beoordelen`}
          </h2>
          <p className="text-text-muted text-sm mt-2">
            {/* COPY: confirm met Marlon */}
            Annuleer-verzoeken van leden op PT-sessies.
          </p>
        </header>
        {(ptPending ?? []).length === 0 ? (
          <div className="py-12 text-center border-t border-[color:var(--ink-500)]/60">
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
              Up to date
            </span>
            <p className="text-text-muted text-sm max-w-md mx-auto">
              {/* COPY: confirm met Marlon */}
              Geen openstaande PT-annuleringen. Alles is afgehandeld.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {(ptPending ?? []).map((r) => {
              const session = r.booking?.session ?? null;
              const format = session?.format ?? "one_on_one";
              const hasCredit = Boolean(r.booking?.credits_used_from);
              const cancelWindowHours = session?.trainer_id
                ? (cancelWindowByTrainer.get(session.trainer_id) ?? 24)
                : 24;
              const withinWindow = session
                ? isCancellable(new Date(session.start_at), cancelWindowHours)
                : false;
              return (
                <li key={r.id}>
                  <PtCancellationRow
                    requestId={r.id}
                    firstName={r.profile?.first_name ?? ""}
                    lastName={r.profile?.last_name ?? ""}
                    email={r.profile?.email ?? ""}
                    profileId={r.profile_id ?? null}
                    sessionLabel={
                      PT_SESSION_TYPE_LABEL[format] ?? "PT-sessie"
                    }
                    startAt={session?.start_at ?? r.created_at}
                    endAt={session?.end_at ?? r.created_at}
                    reason={r.reason}
                    hasCredit={hasCredit}
                    creditLabel={
                      format === "duo" ? "duo-credit" : "PT-credit"
                    }
                    withinWindow={withinWindow}
                    cancelWindowHours={cancelWindowHours}
                    createdAt={r.created_at}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(ptRecent ?? []).length > 0 && (
        <section>
          <header className="mb-6">
            <span className="tmc-eyebrow block mb-2">Historie</span>
            <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
              Recent afgehandelde PT-annuleringen
            </h2>
          </header>
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {(ptRecent ?? []).map((r) => {
              const name =
                [r.profile?.first_name, r.profile?.last_name]
                  .filter(Boolean)
                  .join(" ") || "Lid";
              const approved = r.status === "approved";
              const session = r.booking?.session ?? null;
              const format = session?.format ?? "one_on_one";
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4 border-b border-[color:var(--ink-500)]/40"
                >
                  <span className="text-sm text-text">
                    {r.profile_id ? (
                      <Link
                        href={`/app/admin/leden/${r.profile_id}`}
                        className="hover:text-accent transition-colors"
                      >
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </span>
                  <span className="text-xs text-text-muted">
                    {PT_SESSION_TYPE_LABEL[format] ?? "PT-sessie"}
                  </span>
                  {session && (
                    <span className="text-xs text-text-muted">
                      {formatShortDate(new Date(session.start_at))}{" "}
                      {formatTimeRange(
                        new Date(session.start_at),
                        new Date(session.end_at),
                      )}
                    </span>
                  )}
                  <span
                    className={`ml-auto inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] ${
                      approved
                        ? "text-[color:var(--success)]"
                        : "text-[color:var(--danger)]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`w-1.5 h-1.5 rounded-full ${
                        approved
                          ? "bg-[color:var(--success)]"
                          : "bg-[color:var(--danger)]"
                      }`}
                    />
                    {approved
                      ? r.with_restitution
                        ? "Goedgekeurd · met restitutie"
                        : "Goedgekeurd · zonder restitutie"
                      : "Afgewezen"}
                  </span>
                  {r.resolution_note && (
                    <p className="w-full text-xs text-text-muted mt-1">
                      Toelichting: {r.resolution_note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
