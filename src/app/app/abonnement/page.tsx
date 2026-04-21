import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/crowdfunding-helpers";

export const metadata = {
  title: "Abonnement | The Movement Club",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Betaling in behandeling",
  active: "Actief",
  paused: "Gepauzeerd",
  cancellation_requested: "Opgezegd (loopt nog)",
  cancelled: "Beëindigd",
  expired: "Verlopen",
  payment_failed: "Betaling mislukt",
};

function formatDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export default async function AbonnementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select(
      "id,plan_type,plan_variant,status,price_per_cycle_cents,billing_cycle_weeks,commit_months,start_date,commit_end_date,frequency_cap,covered_pillars"
    )
    .eq("profile_id", user.id)
    .in("status", [
      "pending",
      "active",
      "paused",
      "cancellation_requested",
      "payment_failed",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let planName: string | null = null;
  if (membership) {
    const { data: plan } = await supabase
      .from("membership_plan_catalogue")
      .select("display_name")
      .eq("plan_variant", membership.plan_variant)
      .maybeSingle();
    planName = plan?.display_name ?? null;
  }

  return (
    <Container className="py-12 max-w-3xl">
      <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
        Abonnement
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-8">
        Jouw abonnement
      </h1>

      {!membership && (
        <div className="bg-bg-elevated border border-bg-subtle p-6 md:p-8">
          <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-3">
            Nog geen abonnement
          </h2>
          <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-xl">
            Kies een abonnement en rond je aanmelding af. Je kunt direct na
            betaling lessen boeken.
          </p>
          <Link
            href="/app/abonnement/nieuw"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium uppercase tracking-[0.15em] bg-accent text-bg hover:bg-accent-hover transition-colors"
          >
            Bekijk abonnementen
          </Link>
        </div>
      )}

      {membership && (
        <div className="bg-bg-elevated border border-bg-subtle p-6 md:p-8 space-y-6">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
              Plan
            </div>
            <div className="font-[family-name:var(--font-playfair)] text-2xl text-text">
              {planName ?? membership.plan_variant}
            </div>
          </div>

          <Row
            label="Status"
            value={STATUS_LABEL[membership.status] ?? membership.status}
            accent={membership.status === "active"}
          />
          <Row
            label="Prijs per cyclus"
            value={`${formatEuro(
              Math.round(membership.price_per_cycle_cents / 100)
            )} / ${membership.billing_cycle_weeks}wk`}
          />
          {membership.frequency_cap && (
            <Row
              label="Frequentie-cap"
              value={`${membership.frequency_cap}× per week`}
            />
          )}
          {membership.covered_pillars?.length > 0 && (
            <Row
              label="Toegang"
              value={membership.covered_pillars.join(", ")}
            />
          )}
          <Row
            label="Startdatum"
            value={formatDate(membership.start_date) ?? "—"}
          />
          <Row
            label="Commitment tot"
            value={formatDate(membership.commit_end_date) ?? "—"}
          />

          {membership.status === "pending" && (
            <div className="text-sm text-text-muted pt-4 border-t border-bg-subtle/70">
              Je betaling is nog niet bevestigd. Zodra die binnen is, wordt je
              abonnement automatisch actief.
            </div>
          )}

          {membership.status === "payment_failed" && (
            <div className="text-sm text-red-400 border border-red-500/30 bg-red-500/10 px-4 py-3">
              Je laatste incasso is niet gelukt. Neem contact op of probeer
              opnieuw.
            </div>
          )}

          {membership.status === "active" && (
            <div className="pt-4 border-t border-bg-subtle/70">
              <p className="text-xs text-text-muted mb-3">
                Pauzeren of opzeggen komt binnenkort in-app. Voor nu: mail ons.
              </p>
            </div>
          )}
        </div>
      )}
    </Container>
  );
}

function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 py-2 border-b border-bg-subtle/70 last:border-0">
      <span className="text-xs uppercase tracking-[0.2em] text-text-muted pt-1">
        {label}
      </span>
      <span className={accent ? "text-accent" : "text-text"}>{value}</span>
    </div>
  );
}
