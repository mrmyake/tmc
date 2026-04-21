import Link from "next/link";
import { redirect } from "next/navigation";
import { Confetti } from "@/components/blocks/crowdfunding/Confetti";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Bedankt | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<
  string,
  { title: string; body: string; showConfetti: boolean }
> = {
  active: {
    title: "Welkom bij The Movement Club.",
    body: "Je aanmelding is rond, de eerste betaling is binnen. Je kunt nu lessen boeken in het rooster.",
    showConfetti: true,
  },
  pending: {
    title: "We wachten nog op je betaling.",
    body: "Zodra Mollie je betaling bevestigt, wordt je abonnement automatisch actief. Dat duurt meestal een paar minuten — je hoeft niets te doen.",
    showConfetti: false,
  },
  payment_failed: {
    title: "Betaling niet geslaagd.",
    body: "Je betaling is geannuleerd of afgewezen. Probeer opnieuw via 'Kies abonnement' of neem contact op.",
    showConfetti: false,
  },
};

export default async function BedanktPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>;
}) {
  const params = await searchParams;
  const membershipId = params.membership;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = membershipId
    ? await supabase
        .from("memberships")
        .select(
          "id,plan_variant,status,price_per_cycle_cents,billing_cycle_weeks"
        )
        .eq("id", membershipId)
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  const status = membership?.status ?? "pending";
  const copy = STATUS_COPY[status] ?? STATUS_COPY.pending;

  let planName: string | null = null;
  if (membership) {
    const { data: plan } = await supabase
      .from("membership_plan_catalogue")
      .select("display_name")
      .eq("plan_variant", membership.plan_variant)
      .maybeSingle();
    planName = plan?.display_name ?? membership.plan_variant;
  }

  return (
    <>
      {copy.showConfetti && <Confetti />}
      <Container className="py-20 max-w-2xl text-center">
        <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
          {status === "active"
            ? "Je abonnement loopt"
            : status === "payment_failed"
            ? "Betaling mislukt"
            : "Bijna klaar"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-5 leading-tight">
          {copy.title}
        </h1>
        <p className="text-text-muted text-lg leading-relaxed mb-10">
          {copy.body}
        </p>

        {membership && (
          <div className="inline-block bg-bg-elevated border border-bg-subtle px-8 py-6 mb-10 text-left">
            <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
              Jouw plan
            </div>
            <div className="font-[family-name:var(--font-playfair)] text-2xl text-text">
              {planName}
            </div>
            <div className="text-accent mt-1">
              {formatEuro(
                Math.round(membership.price_per_cycle_cents / 100)
              )}{" "}
              / {membership.billing_cycle_weeks}wk
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/app">Naar dashboard</Button>
          {status === "active" && (
            <Link
              href="/app/rooster"
              className="text-xs uppercase tracking-[0.25em] text-text-muted hover:text-accent transition-colors"
            >
              Bekijk het rooster →
            </Link>
          )}
          {status === "payment_failed" && (
            <Link
              href="/app/abonnement/nieuw"
              className="text-xs uppercase tracking-[0.25em] text-text-muted hover:text-accent transition-colors"
            >
              Opnieuw proberen →
            </Link>
          )}
        </div>
      </Container>
    </>
  );
}
