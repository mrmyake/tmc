import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { MandateStatusCard } from "./_components/MandateStatusCard";
import { PaymentRow } from "./_components/PaymentRow";
import type { PaymentStatus } from "./_components/PaymentStatusBadge";

export const metadata = {
  title: "Facturen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function parsePage(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function logIfError(tag: string, error: { message: string } | null) {
  if (error) {
    console.error(`[/app/facturen] ${tag} query failed:`, error.message);
  }
}

function computeNextInvoice(
  startDate: string,
  billingCycleWeeks: number,
  cancellationEffectiveDate: string | null,
): string | null {
  const start = new Date(startDate);
  const cycleMs = billingCycleWeeks * 7 * 86400000;
  const now = Date.now();
  if (now < start.getTime()) return start.toISOString().slice(0, 10);
  const elapsed = now - start.getTime();
  const cyclesElapsed = Math.floor(elapsed / cycleMs);
  const next = new Date(start.getTime() + (cyclesElapsed + 1) * cycleMs);
  if (
    cancellationEffectiveDate &&
    next > new Date(cancellationEffectiveDate)
  ) {
    return null;
  }
  return next.toISOString().slice(0, 10);
}

export default async function FacturenPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await props.searchParams;
  const page = parsePage(pageParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [paymentsResult, paymentsCountResult, activeMembershipResult] =
    await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, paid_at, created_at, amount_cents, status, description, method, mollie_payment_id",
        )
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", user.id),
      supabase
        .from("memberships")
        .select(
          "plan_variant, start_date, billing_cycle_weeks, mollie_subscription_id, cancellation_effective_date",
        )
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  logIfError("payments", paymentsResult.error);
  logIfError("payments count", paymentsCountResult.error);
  logIfError("active membership", activeMembershipResult.error);

  const membership = activeMembershipResult.data;

  let planName: string | null = null;
  if (membership?.plan_variant) {
    const { data: plan } = await supabase
      .from("membership_plan_catalogue")
      .select("display_name")
      .eq("plan_variant", membership.plan_variant)
      .maybeSingle();
    planName = plan?.display_name ?? membership.plan_variant;
  }

  const mandateActive = Boolean(
    membership && membership.mollie_subscription_id,
  );
  const nextInvoice = membership
    ? computeNextInvoice(
        membership.start_date,
        membership.billing_cycle_weeks,
        membership.cancellation_effective_date,
      )
    : null;

  const rows = (paymentsResult.data ?? []).map((p) => ({
    id: p.id,
    paidAt: p.paid_at,
    createdAt: p.created_at,
    amountCents: p.amount_cents,
    status: p.status as PaymentStatus,
    description: p.description,
    method: p.method,
    mollieId: p.mollie_payment_id,
  }));

  const total = paymentsCountResult.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < lastPage;

  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Betaalhistorie
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          Facturen.
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Elke incasso en elke drop-in staat hier terug. Rustig overzichtelijk.
        </p>
      </header>

      <div className="mb-14">
        <MandateStatusCard
          active={mandateActive}
          planName={planName}
          nextInvoiceDate={nextInvoice}
        />
      </div>

      {rows.length === 0 ? (
        <section className="bg-bg-elevated p-10 md:p-12 text-center">
          <span className="tmc-eyebrow block mb-4">Nog geen betalingen</span>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4">
            Je tijdlijn staat nog leeg.
          </h2>
          <p className="text-text-muted text-base leading-relaxed max-w-md mx-auto">
            Zodra je eerste incasso binnen is, vind je hier een overzicht van
            al je betalingen.
          </p>
        </section>
      ) : (
        <>
          <div className="border-t border-[color:var(--ink-500)]/60">
            {rows.map((row) => (
              <PaymentRow key={row.id} row={row} />
            ))}
          </div>
          {(hasPrev || hasNext) && (
            <nav
              aria-label="Paginering"
              className="mt-10 flex items-center justify-between gap-4 text-xs text-text-muted"
            >
              <span>
                Pagina {page} van {lastPage} · {total} betalingen
              </span>
              <div className="flex items-center gap-2">
                {hasPrev && (
                  <Link
                    href={`/app/facturen?page=${page - 1}`}
                    scroll={false}
                    className="px-4 py-2 border border-text-muted/30 uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent"
                  >
                    Vorige
                  </Link>
                )}
                {hasNext && (
                  <Link
                    href={`/app/facturen?page=${page + 1}`}
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

      <p className="mt-14 text-text-muted text-xs leading-relaxed max-w-prose">
        PDF-facturen komen binnenkort. Heb je nu al een factuur nodig voor je
        administratie? Mail Marlon met het betalingsnummer, we sturen &rsquo;m je
        toe.
      </p>
    </Container>
  );
}
