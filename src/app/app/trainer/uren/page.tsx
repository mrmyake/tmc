import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatShortDate } from "@/lib/format-date";
import { UrenForm } from "./_components/UrenForm";

export const metadata = {
  title: "Trainer · Uren | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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

export default async function TrainerUrenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: trainer } = await admin
    .from("trainers")
    .select("id, is_active")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!trainer) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-14">
        <p className="text-text-muted text-sm">
          Geen trainer-profiel gevonden. Check met admin.
        </p>
      </div>
    );
  }

  const { data: rows } = await admin
    .from("trainer_hours")
    .select(
      `id, work_date, hours, notes, status,
       approved_at, rejection_reason, submitted_at,
       approver:profiles!approved_by(first_name, last_name)`,
    )
    .eq("trainer_id", trainer.id)
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

      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Urenregistratie
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          Uren indienen.
        </h1>
        <p className="text-text-muted mt-4 max-w-xl">
          Registreer wat je hebt gewerkt. Admin keurt goed of wijst af. Je
          kunt ze pas aanpassen na admin-actie.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-14">
        <StatTile
          label="Deze week"
          value={`${weekApproved.toFixed(1)}u`}
          hint="Goedgekeurd"
        />
        <StatTile
          label="Deze maand"
          value={`${monthApproved.toFixed(1)}u`}
          hint="Goedgekeurd"
        />
        <StatTile
          label="In behandeling"
          value={`${monthPending.toFixed(1)}u`}
          hint="Wacht op admin"
        />
      </div>

      <section className="mb-14">
        <header className="mb-6">
          <span className="tmc-eyebrow block mb-2">Nieuwe invoer</span>
          <h2 className="text-xl md:text-2xl text-text font-medium tracking-[-0.01em]">
            Voeg uren toe
          </h2>
        </header>
        <UrenForm />
      </section>

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
          <p className="text-text-muted text-sm">
            Dien je eerste uren in via het formulier hierboven.
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

function StatusPill({
  status,
}: {
  status: "pending" | "approved" | "rejected";
}) {
  const base =
    "inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em]";
  if (status === "approved") {
    return (
      <span className={`${base} text-[color:var(--success)]`}>
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]"
        />
        Goedgekeurd
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className={`${base} text-[color:var(--danger)]`}>
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--danger)]"
        />
        Afgewezen
      </span>
    );
  }
  return (
    <span className={`${base} text-accent`}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-accent" />
      In behandeling
    </span>
  );
}
