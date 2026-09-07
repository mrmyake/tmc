import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { getCatalogue } from "@/lib/catalogue";
import { SITE } from "@/lib/constants";
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

  // Testrijen dubbel gefilterd (spec 6.8): het .eq("is_test", false) hier
  // is de expliciete laag naast de RLS-policy (invoices_self_read etc.
  // filtert al op is_test, maar payments zelf heeft geen is_test-policy --
  // de RLS op payments scopet alleen op profile_id). Zonder dit filter zou
  // een testbetaling van dit lid gewoon meegeteld en getoond worden.
  const [paymentsResult, paymentsCountResult, activeMembershipResult] =
    await Promise.all([
      supabase
        .from("payments")
        .select(
          "id, paid_at, created_at, amount_cents, status, description, method, mollie_payment_id, order_id, membership_id, refunded_amount_cents",
        )
        .eq("profile_id", user.id)
        .eq("is_test", false)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .eq("is_test", false),
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
    // Naam uit tmc.catalogue (slug = plan_variant). Een inactieve of
    // verdwenen catalogusrij valt terug op de ruwe variant-string, zelfde
    // gedrag als voorheen met membership_plan_catalogue.
    const { data: plan } = await supabase
      .from("catalogue")
      .select("display_name")
      .eq("slug", membership.plan_variant)
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

  const payments = paymentsResult.data ?? [];

  // Verrijking, zelfde truc als /app/producten (regel 96-128 daar: slug ->
  // catalogue.get(slug)?.display_name), maar de KIND-beperking daar
  // (product-only) gaat hier bewust niet mee: /app/facturen toont alles.
  // Ook de zoekrichting is omgekeerd -- we starten bij de payments van
  // deze pagina en zoeken terug naar hun order of membership, in plaats
  // van andersom.
  const orderIds = Array.from(
    new Set(payments.map((p) => p.order_id).filter((id): id is string => !!id)),
  );
  const membershipIds = Array.from(
    new Set(
      payments.map((p) => p.membership_id).filter((id): id is string => !!id),
    ),
  );
  const paymentIds = payments.map((p) => p.id);

  const [ordersResult, membershipsResult, invoicesResult] = await Promise.all([
    orderIds.length
      ? supabase.from("orders").select("id, catalogue_slug").in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    membershipIds.length
      ? supabase
          .from("memberships")
          .select("id, plan_variant")
          .in("id", membershipIds)
      : Promise.resolve({ data: [], error: null }),
    // Downloadkolom (8.2): alleen gefinaliseerde, niet-test facturen op de
    // huidige pagina, dus maximaal vijftig ids.
    paymentIds.length
      ? supabase
          .from("invoices")
          .select("id, invoice_number, payment_id")
          .eq("profile_id", user.id)
          .eq("status", "finalised")
          .eq("is_test", false)
          .in("payment_id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  logIfError("orders for description", ordersResult.error);
  logIfError("memberships for description", membershipsResult.error);
  logIfError("invoices for download", invoicesResult.error);

  const slugByOrderId = new Map(
    (ordersResult.data ?? []).map((o) => [o.id, o.catalogue_slug]),
  );
  const slugByMembershipId = new Map(
    (membershipsResult.data ?? []).map((m) => [m.id, m.plan_variant]),
  );
  const invoiceIdByPaymentId = new Map(
    (invoicesResult.data ?? [])
      .filter((i) => i.payment_id)
      .map((i) => [i.payment_id as string, i.id]),
  );

  const catalogue = await getCatalogue();

  const rows = payments.map((p) => {
    const slug = p.order_id
      ? slugByOrderId.get(p.order_id)
      : p.membership_id
        ? slugByMembershipId.get(p.membership_id)
        : undefined;
    const description = slug
      ? (catalogue.get(slug)?.display_name ?? p.description)
      : p.description;
    return {
      id: p.id,
      paidAt: p.paid_at,
      createdAt: p.created_at,
      amountCents: p.amount_cents,
      status: p.status as PaymentStatus,
      description,
      method: p.method,
      mollieId: p.mollie_payment_id,
      refundedAmountCents: p.refunded_amount_cents,
      invoiceId: invoiceIdByPaymentId.get(p.id) ?? null,
    };
  });

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

      {/* COPY: confirm met Marlon */}
      <p className="mt-14 text-text-muted text-xs leading-relaxed max-w-prose">
        Niet elke betaling krijgt een factuur: voor particulieren is dat niet
        nodig. Heb je er toch een nodig voor je administratie, bijvoorbeeld
        omdat je zakelijk traint? Vraag het aan en we maken hem voor je.{" "}
        <a
          href={`mailto:${SITE.email}?subject=Factuur%20aanvragen`}
          className="text-accent hover:text-text transition-colors duration-300"
        >
          Vraag een factuur aan
        </a>
        .
      </p>
    </Container>
  );
}
