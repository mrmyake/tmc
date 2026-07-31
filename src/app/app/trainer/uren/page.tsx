import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTrainerScope } from "@/lib/trainer/trainer-scope";
import { TrainerScopePicker } from "@/components/trainer/TrainerScopePicker";
import { formatShortDate } from "@/lib/format-date";
import { UrenForm } from "./_components/UrenForm";
import { StatTile } from "@/app/app/_components/StatTile";
import { Chip } from "@/components/ui/Chip";

export const metadata = {
  title: "Trainer · Uren | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function parseWeekParam(
  param: string | undefined,
): { year: number; week: number } | null {
  if (!param) return null;
  const m = /^(\d{4})-W(\d{1,2})$/.exec(param);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

function isoWeekMondayIso(year: number, week: number): string {
  // Jan 4 sits in ISO-week 1; find Monday of Jan 4's week then shift.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function startOfIsoWeekIso(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export default async function TrainerUrenPage(props: {
  searchParams: Promise<{ week?: string; trainerId?: string }>;
}) {
  const { week: weekParam, trainerId: requestedTrainerId } =
    await props.searchParams;
  const weekHint = parseWeekParam(weekParam);
  const defaultDate = weekHint
    ? isoWeekMondayIso(weekHint.year, weekHint.week)
    : null;

  const scope = await resolveTrainerScope(requestedTrainerId);
  if (!scope.ok) redirect("/app");

  const admin = createAdminClient();

  if (!scope.selectedTrainerId) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-14">
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-sm">
          {scope.isAdmin
            ? "Er zijn nog geen actieve trainers om uren voor te tonen."
            : "Geen trainer-profiel gevonden. Check met admin."}
        </p>
      </div>
    );
  }

  const selectedTrainerId = scope.selectedTrainerId;

  const { data: rows } = await admin
    .from("trainer_hours")
    .select(
      `id, work_date, hours, notes, status,
       approved_at, rejection_reason, submitted_at,
       approver:profiles!approved_by(first_name, last_name)`,
    )
    .eq("trainer_id", selectedTrainerId)
    .order("work_date", { ascending: false })
    .limit(60);

  const monthStart = startOfMonthIso();
  const weekStart = startOfIsoWeekIso();
  let monthApproved = 0;
  let monthPending = 0;
  let weekApproved = 0;
  for (const r of rows ?? []) {
    if (r.work_date < monthStart) continue;
    const h = toNumber(r.hours);
    if (r.status === "approved") {
      monthApproved += h;
      if (r.work_date >= weekStart) weekApproved += h;
    } else if (r.status === "pending") {
      monthPending += h;
    }
  }

  type NameRef =
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  function nameOf(ref: NameRef): string | null {
    const n = Array.isArray(ref) ? ref[0] : ref;
    const full = [n?.first_name, n?.last_name].filter(Boolean).join(" ");
    return full || null;
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

      <header className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
            Urenregistratie
          </span>
          {/* COPY: confirm met Marlon */}
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
            {scope.isOwnData ? "Uren indienen." : "Uren bekijken."}
          </h1>
          <p className="text-text-muted mt-4 max-w-xl">
            {scope.isOwnData
              ? "Registreer wat je hebt gewerkt. Admin keurt goed of wijst af. Je kunt ze pas aanpassen na admin-actie."
              : "Je bekijkt de uren van een andere trainer. Uren indienen kan alleen voor jezelf; goedkeuren gaat via de admin-cockpit."}
          </p>
        </div>
        <TrainerScopePicker
          isAdmin={scope.isAdmin}
          options={scope.options}
          selectedTrainerId={selectedTrainerId}
        />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-14">
        <StatTile
          size="md"
          label="Deze week"
          value={`${weekApproved.toFixed(1)}u`}
          hint="Goedgekeurd"
        />
        <StatTile
          size="md"
          label="Deze maand"
          value={`${monthApproved.toFixed(1)}u`}
          hint="Goedgekeurd"
        />
        <StatTile
          size="md"
          label="In behandeling"
          value={`${monthPending.toFixed(1)}u`}
          hint="Wacht op admin"
        />
      </div>

      {/*
        Het invoerformulier verschijnt alleen bij de eigen uren.
        submitOwnHours schrijft altijd naar de trainers-rij van de
        ingelogde gebruiker (en RLS trainer_hours_self_insert dwingt dat
        af), dus uren indienen namens een andere trainer bestaat niet.
        Het formulier tonen bij andermans uren zou suggereren dat het wel
        kan.
      */}
      {scope.isOwnData && (
        <section className="mb-14">
          <header className="mb-6">
            <span className="tmc-eyebrow block mb-2">Nieuwe invoer</span>
            <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
              {weekHint ? `Voor week ${weekHint.week}` : "Voeg uren toe"}
            </h2>
            {weekHint && (
              <p className="text-text-muted text-sm mt-1">
                Datum start op maandag van week {weekHint.week}. Pas aan waar
                nodig.
              </p>
            )}
          </header>
          <UrenForm defaultDate={defaultDate ?? undefined} />
        </section>
      )}

      <section>
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">Historie</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            {(rows ?? []).length === 0
              ? "Nog geen invoer"
              : `${rows?.length} regel${rows?.length === 1 ? "" : "s"}`}
          </h2>
        </header>
        {(rows ?? []).length === 0 ? (
          // COPY: confirm met Marlon
          <p className="text-text-muted text-sm">
            {scope.isOwnData
              ? "Dien je eerste uren in via het formulier hierboven."
              : "Deze trainer heeft nog geen uren ingediend."}
          </p>
        ) : (
          <ul className="flex flex-col border-t border-[color:var(--ink-500)]/60">
            {(rows ?? []).map((r) => {
              const date = new Date(`${r.work_date}T00:00:00Z`);
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-4 py-4 border-b border-[color:var(--ink-500)]/40 items-start"
                >
                  <span className="text-sm text-text tabular-nums">
                    {formatShortDate(date)}
                  </span>
                  <div>
                    <p className="text-text text-sm">
                      <span className="tabular-nums">
                        {toNumber(r.hours).toFixed(1)}u
                      </span>
                      {r.notes ? (
                        <span className="text-text-muted"> · {r.notes}</span>
                      ) : null}
                    </p>
                    {r.status === "rejected" && r.rejection_reason && (
                      <p className="text-[color:var(--danger)] text-xs mt-1">
                        Afgewezen: {r.rejection_reason}
                      </p>
                    )}
                    {r.status === "approved" && r.approved_at && (
                      <p className="text-text-muted text-xs mt-1">
                        Goedgekeurd{nameOf(r.approver as NameRef) ? ` door ${nameOf(r.approver as NameRef)}` : ""}
                      </p>
                    )}
                  </div>
                  <StatusPill status={r.status as "pending" | "approved" | "rejected"} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}


function StatusPill({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  if (status === "approved") return <Chip tone="success">Goedgekeurd</Chip>;
  if (status === "rejected") return <Chip tone="danger">Afgewezen</Chip>;
  return <Chip tone="accent">In behandeling</Chip>;
}
