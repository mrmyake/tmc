import { redirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { ProductenTabs, type ProductenView } from "./_components/ProductenTabs";
import { KopenPanel } from "./_components/KopenPanel";
import { TegoedPanel, type ProductHistoryRow } from "./_components/TegoedPanel";
import type { CreditMembershipRow } from "./lib";

export const metadata = {
  title: "Producten | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const KOPEN_SLUGS = ["ten_ride_card", "pt_single", "pt_10", "duo_single", "duo_10"];

function parseTab(value: string | undefined): ProductenView {
  return value === "tegoed" ? "tegoed" : "kopen";
}

function logIfError(tag: string, error: { message: string } | null) {
  if (error) {
    console.error(`[/app/producten] ${tag} query failed:`, error.message);
  }
}

export default async function ProductenPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await props.searchParams;
  const tab = parseTab(tabParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (tab === "kopen") {
    const catalogue = await getCatalogue();
    const plans: Record<string, CatalogueRow> = {};
    for (const slug of KOPEN_SLUGS) {
      // getCatalogue() filtert zelf al op is_active=true; hier alleen nog
      // purchasable checken (ten_ride_card_kids/_senior zijn sowieso
      // is_active=false en dus al afwezig uit de Map).
      const row = catalogue.get(slug);
      if (row && row.purchasable) plans[slug] = row;
    }
    return (
      <Container className="py-16 md:py-20">
        <Header />
        <div className="mb-12">
          <ProductenTabs active={tab} />
        </div>
        <KopenPanel plans={plans} />
      </Container>
    );
  }

  // tab === "tegoed"
  const [creditsResult, ordersResult] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, plan_type, plan_variant, credits_remaining, credits_total, credits_expires_at, start_date",
      )
      .eq("profile_id", user.id)
      .eq("status", "active")
      .in("plan_type", ["ten_ride_card", "pt_package"])
      .gt("credits_remaining", 0)
      .order("start_date", { ascending: false }),
    supabase
      .from("orders")
      .select("id, catalogue_slug")
      .eq("profile_id", user.id)
      .eq("kind", "product"),
  ]);

  logIfError("credits", creditsResult.error);
  logIfError("product orders", ordersResult.error);

  const credits: CreditMembershipRow[] = (creditsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      plan_type: row.plan_type,
      plan_variant: row.plan_variant,
      credits_remaining: row.credits_remaining ?? 0,
      credits_total: row.credits_total ?? 0,
      credits_expires_at: row.credits_expires_at,
      start_date: row.start_date,
    }),
  );

  const productOrders = ordersResult.data ?? [];
  const orderIds = productOrders.map((o) => o.id);
  const slugByOrderId = new Map(
    productOrders.map((o) => [o.id, o.catalogue_slug]),
  );

  const paymentsResult = orderIds.length
    ? await supabase
        .from("payments")
        .select("id, paid_at, created_at, amount_cents, status, order_id")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  logIfError("product payments", paymentsResult.error);

  const catalogue = await getCatalogue();
  const history: ProductHistoryRow[] = (paymentsResult.data ?? []).map(
    (payment) => {
      const slug = payment.order_id
        ? slugByOrderId.get(payment.order_id)
        : undefined;
      const description = slug
        ? (catalogue.get(slug)?.display_name ?? slug)
        : "Product"; // COPY: confirm met Marlon
      return {
        id: payment.id,
        date: payment.paid_at ?? payment.created_at,
        description,
        amountCents: payment.amount_cents,
        status: payment.status,
      };
    },
  );

  return (
    <Container className="py-16 md:py-20">
      <Header />
      <div className="mb-12">
        <ProductenTabs active={tab} />
      </div>
      <TegoedPanel credits={credits} history={history} />
    </Container>
  );
}

function Header() {
  return (
    <header className="mb-12">
      {/* COPY: confirm met Marlon */}
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Member app
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
        Producten.
      </h1>
      {/* COPY: confirm met Marlon */}
      <p className="mt-6 text-text-muted text-lg max-w-xl">
        Los van je abonnement. Koop een strippenkaart of een rittenkaart voor
        personal training, en zie hier hoeveel je nog over hebt.
      </p>
    </header>
  );
}
