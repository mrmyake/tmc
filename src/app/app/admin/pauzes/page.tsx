import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatShortDate } from "@/lib/format-date";
import { PauseRow } from "./_components/PauseRow";

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
    </div>
  );
}
