import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/app/app/_components/StatTile";
import { MembershipHeroCard } from "./_components/MembershipHeroCard";
import { PlanBenefitsList } from "./_components/PlanBenefitsList";
import {
  MembershipHistory,
  type HistoryItem,
} from "./_components/MembershipHistory";
import { MembershipActions } from "./_components/MembershipActions";

export const metadata = {
  title: "Abonnement | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = [
  "pending",
  "active",
  "paused",
  "cancellation_requested",
  "payment_failed",
];

const HISTORY_STATUSES = ["cancelled", "expired"];

const PLANS_WITH_CREDITS = new Set(["ten_ride_card", "pt_package"]);

function logIfError(tag: string, error: { message: string } | null) {
  if (error) {
    console.error(`[/app/abonnement] ${tag} query failed:`, error.message);
  }
}

export default async function AbonnementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [currentResult, historyResult] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        `
          id,
          plan_type,
          plan_variant,
          status,
          price_per_cycle_cents,
          billing_cycle_weeks,
          commit_months,
          commit_end_date,
          start_date,
          end_date,
          frequency_cap,
          covered_pillars,
          credits_remaining,
          credits_total,
          cancellation_effective_date,
          cancellation_requested_at
        `,
      )
      .eq("profile_id", user.id)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "id, plan_variant, status, price_per_cycle_cents, billing_cycle_weeks, start_date, end_date",
      )
      .eq("profile_id", user.id)
      .in("status", HISTORY_STATUSES)
      .order("end_date", { ascending: false })
      .limit(20),
  ]);

  logIfError("current membership", currentResult.error);
  logIfError("history", historyResult.error);

  const membership = currentResult.data;

  // Build a set of plan_variants we need display names for.
  const variants = new Set<string>();
  if (membership?.plan_variant) variants.add(membership.plan_variant);
  for (const row of historyResult.data ?? []) {
    if (row.plan_variant) variants.add(row.plan_variant);
  }

  const planCatalogue =
    variants.size === 0
      ? { data: [] as { plan_variant: string; display_name: string; includes: string[] }[] }
      : await supabase
          .from("membership_plan_catalogue")
          .select("plan_variant, display_name, includes")
          .in("plan_variant", Array.from(variants));

  const planByVariant = new Map<
    string,
    { display_name: string; includes: string[] }
  >();
  for (const p of planCatalogue.data ?? []) {
    planByVariant.set(p.plan_variant, {
      display_name: p.display_name,
      includes: p.includes ?? [],
    });
  }

  const currentPlan = membership
    ? planByVariant.get(membership.plan_variant)
    : null;

  const historyItems: HistoryItem[] = (historyResult.data ?? []).map((row) => ({
    id: row.id,
    planName:
      planByVariant.get(row.plan_variant)?.display_name ?? row.plan_variant,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    pricePerCycleCents: row.price_per_cycle_cents,
    billingCycleWeeks: row.billing_cycle_weeks,
  }));

  if (!membership) {
    return (
      <Container className="py-16 md:py-20 max-w-3xl">
        <Header />
        <section className="bg-bg-elevated p-10 md:p-12 text-center">
          <span className="tmc-eyebrow block mb-4">Nog geen abonnement</span>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
            Kies een plan en kom binnen.
          </h2>
          <p className="text-text-muted text-base leading-relaxed mb-8 max-w-md mx-auto">
            Zodra je een abonnement hebt lopen, vind je hier je plan, cycle en
            volgende incasso.
          </p>
          <Button href="/app/abonnement/nieuw">Bekijk abonnementen</Button>
        </section>
        <div className="mt-14">
          <MembershipHistory items={historyItems} />
        </div>
      </Container>
    );
  }

  const planName = currentPlan?.display_name ?? membership.plan_variant;
  const showCreditsTile =
    PLANS_WITH_CREDITS.has(membership.plan_type) &&
    membership.credits_total !== null;

  const canPause =
    membership.status === "active" || membership.status === "paused";
  const canCancel =
    membership.status === "active" ||
    membership.status === "paused" ||
    membership.status === "payment_failed";

  return (
    <Container className="py-16 md:py-20 max-w-4xl">
      <Header />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-12">
        <div className="md:col-span-2">
          <MembershipHeroCard
            planName={planName}
            planVariant={membership.plan_variant}
            status={membership.status}
            pricePerCycleCents={membership.price_per_cycle_cents}
            billingCycleWeeks={membership.billing_cycle_weeks}
            startDate={membership.start_date}
            commitEndDate={membership.commit_end_date}
            cancellationEffectiveDate={membership.cancellation_effective_date}
          />
        </div>
        <div className="flex flex-col gap-6 md:gap-8">
          {showCreditsTile ? (
            <StatTile
              label={
                membership.plan_type === "pt_package"
                  ? "PT-credits"
                  : "Rittenkaart"
              }
              value={`${membership.credits_remaining ?? 0} / ${membership.credits_total}`}
              hint="Resterend op je kaart."
            />
          ) : (
            <StatTile
              label="Cyclus"
              value={`${membership.billing_cycle_weeks}wk`}
              hint={`Commitment: ${membership.commit_months} maanden.`}
            />
          )}
        </div>
      </div>

      {currentPlan?.includes && currentPlan.includes.length > 0 && (
        <div className="mb-14">
          <PlanBenefitsList
            includes={currentPlan.includes}
            coveredPillars={membership.covered_pillars ?? []}
            frequencyCap={membership.frequency_cap}
          />
        </div>
      )}

      <div className="mb-16">
        <MembershipActions
          membershipId={membership.id}
          commitEndDate={membership.commit_end_date}
          canPause={canPause}
          canCancel={canCancel}
        />
      </div>

      <div className="mb-12">
        <QuietLink href="/app/facturen">Bekijk facturen</QuietLink>
      </div>

      <MembershipHistory items={historyItems} />
    </Container>
  );
}

function Header() {
  return (
    <header className="mb-12">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Lidmaatschap
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
        Jouw abonnement.
      </h1>
      <p className="mt-6 text-text-muted text-lg max-w-xl">
        Jouw plan, je cycle en wat je nog over hebt. Veranderen kan hier.
      </p>
    </header>
  );
}
