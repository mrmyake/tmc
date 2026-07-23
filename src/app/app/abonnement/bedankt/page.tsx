import Link from "next/link";
import { redirect } from "next/navigation";
import { Confetti } from "@/components/ui/Confetti";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/Button";
import { formatEuro } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PaymentTracker } from "./PaymentTracker";

export const metadata = {
  title: "Bedankt | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// order.status -> copy. 'pending' en 'paid' delen dezelfde "we wachten
// nog"-copy: 'paid' is de conditie-2 duplicaat-blokkade (geld binnen, geen
// membership), een interne ops-zaak (zie orders.blocked_reason en de ntfy-
// alert in de webhook), niet iets om de klant hier over uit te leggen.
const STATUS_COPY: Record<
  string,
  { title: string; body: string; showConfetti: boolean }
> = {
  activated: {
    title: "Welkom bij The Movement Club.",
    body: "Je aanmelding is rond, de eerste betaling is binnen. Je kunt nu lessen boeken in het rooster.",
    showConfetti: true,
  },
  pending: {
    title: "We wachten nog op je betaling.",
    body: "Zodra Mollie je betaling bevestigt, wordt je abonnement automatisch actief. Dat duurt meestal een paar minuten — je hoeft niets te doen.",
    showConfetti: false,
  },
  paid: {
    title: "We ronden je aanmelding af.",
    body: "Je betaling is binnen. We handelen dit voor je af en nemen contact op als er iets nodig is.",
    showConfetti: false,
  },
  expired: {
    title: "Betaling niet geslaagd.",
    body: "Je betaling is geannuleerd, afgewezen of verlopen. Probeer opnieuw via 'Kies abonnement' of neem contact op.",
    showConfetti: false,
  },
  cancelled: {
    title: "Betaling niet geslaagd.",
    body: "Je betaling is geannuleerd, afgewezen of verlopen. Probeer opnieuw via 'Kies abonnement' of neem contact op.",
    showConfetti: false,
  },
};

export default async function BedanktPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: order } = orderId
    ? await supabase
        .from("orders")
        .select("id,catalogue_slug,status,base_price_cents,billing_cycle_weeks")
        .eq("id", orderId)
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  const status = order?.status ?? "pending";
  const copy = STATUS_COPY[status] ?? STATUS_COPY.pending;

  let planName: string | null = null;
  if (order) {
    const { data: plan } = await supabase
      .from("catalogue")
      .select("display_name")
      .eq("slug", order.catalogue_slug)
      .maybeSingle();
    planName = plan?.display_name ?? order.catalogue_slug;
  }

  return (
    <>
      {copy.showConfetti && <Confetti />}
      {order && (
        <PaymentTracker
          status={status}
          amount={Math.round(order.base_price_cents / 100)}
          transactionId={order.id}
        />
      )}
      <Container className="py-20 max-w-2xl text-center">
        <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
          {status === "activated"
            ? "Je abonnement loopt"
            : status === "expired" || status === "cancelled"
            ? "Betaling mislukt"
            : "Bijna klaar"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-5 leading-tight">
          {copy.title}
        </h1>
        <p className="text-text-muted text-lg leading-relaxed mb-10">
          {copy.body}
        </p>

        {order && (
          <div className="inline-block bg-bg-elevated border border-bg-subtle px-8 py-6 mb-10 text-left">
            <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
              Jouw plan
            </div>
            <div className="font-[family-name:var(--font-playfair)] text-2xl text-text">
              {planName}
            </div>
            <div className="text-accent mt-1">
              {formatEuro(Math.round(order.base_price_cents / 100))}{" "}
              {order.billing_cycle_weeks ? `/ ${order.billing_cycle_weeks}wk` : ""}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button href="/app">Naar dashboard</Button>
          {status === "activated" && (
            <Link
              href="/app/rooster"
              className="text-xs uppercase tracking-[0.25em] text-text-muted hover:text-accent transition-colors"
            >
              Bekijk het rooster →
            </Link>
          )}
          {(status === "expired" || status === "cancelled") && (
            <Link
              href="/abonnement"
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
