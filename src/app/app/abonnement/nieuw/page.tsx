import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { formatDateLong } from "@/lib/format-date";
import { EARLY_MEMBER_ALL_ACCESS_DISCOUNT_CENTS } from "@/lib/constants";
import { PlanChooser } from "./PlanChooser";
import { AddressGate } from "./AddressGate";

export const metadata = {
  title: "Kies abonnement | The Movement Club",
  robots: { index: false, follow: false },
};

const PLAN_TYPE_LABELS: Record<string, string> = {
  vrij_trainen: "Vrij Trainen",
  // COPY: confirm met Marlon
  groepslessen: "Groepslessen",
  // COPY: confirm met Marlon
  all_inclusive: "All Access",
  kids: "Kids",
  senior: "Senior 65+",
};

const PLAN_TYPE_ORDER = [
  "vrij_trainen",
  "groepslessen",
  "all_inclusive",
  "kids",
  "senior",
];

interface PlanRow {
  id: string;
  plan_type: string;
  plan_variant: string;
  display_name: string;
  frequency_cap: number | null;
  age_category: string;
  price_per_cycle_cents: number;
  billing_cycle_weeks: number;
  commit_months: number;
  covered_pillars: string[];
  includes: string[];
  is_highlighted: boolean;
  display_order: number;
  early_member_pool: string | null;
}

interface EarlyMemberAvailability {
  pool: string;
  cap: number;
  remaining: number;
  closes_at: string;
  is_open: boolean;
}

export default async function AbonnementNieuwPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/abonnement/nieuw");

  // Als je al een lopend/actief abbo hebt, niet opnieuw kiezen.
  const { data: existing } = await supabase
    .from("memberships")
    .select("id,status")
    .eq("profile_id", user.id)
    .in("status", [
      "pending",
      "active",
      "paused",
      "cancellation_requested",
    ])
    .maybeSingle();
  if (existing) redirect("/app/abonnement");

  // Vier onafhankelijke reads — parallel.
  const [
    { data: profileAddress },
    { data: plans },
    { data: settings },
    // Early Member-beschikbaarheid per pool. Bij een fout gewoon zonder
    // Early Member-aanbod renderen; startSignup valideert sowieso atomair.
    { data: emRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("street_address, postal_code, city")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("membership_plan_catalogue")
      .select(
        "id,plan_type,plan_variant,display_name,frequency_cap,age_category,price_per_cycle_cents,billing_cycle_weeks,commit_months,covered_pillars,includes,is_highlighted,display_order,early_member_pool"
      )
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("booking_settings")
      .select("registration_fee_cents, extended_access_price_cents")
      .eq("id", "singleton")
      .maybeSingle(),
    supabase.rpc("get_early_member_availability"),
  ]);

  const addressComplete = Boolean(
    profileAddress?.street_address?.trim() &&
      profileAddress?.postal_code?.trim() &&
      profileAddress?.city?.trim(),
  );

  const regFee = settings?.registration_fee_cents ?? 3900;
  const extendedAccessPrice = settings?.extended_access_price_cents ?? 1000;
  const emByPool = new Map<string, EarlyMemberAvailability>(
    ((emRows ?? []) as EarlyMemberAvailability[]).map((r) => [r.pool, r])
  );

  const plansByType = (plans ?? []).reduce<Record<string, PlanRow[]>>(
    (acc, p) => {
      const key = p.plan_type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    },
    {}
  );

  return (
    <Container className="py-12">
      <Link
        href="/app/abonnement"
        className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors mb-8"
      >
        <ChevronLeft size={14} />
        Terug naar abonnement
      </Link>

      <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
        Kies jouw plan
      </span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        Welk abonnement past bij jou?
      </h1>
      <p className="text-text-muted mb-4 max-w-xl">
        Alle prijzen zijn per 4 weken. Eenmalige inschrijfkosten van{" "}
        {formatEuro(regFee / 100)} worden bij de eerste betaling bijgeteld —
        als Early Member vervallen die.
      </p>
      <p className="text-xs text-text-muted mb-12 max-w-xl">
        Na betaling (iDEAL of creditcard) machtig je Mollie voor automatische
        SEPA-incasso elke 4 weken. Opzegtermijn: 4 weken, in acht genomen na
        je commitment-periode.
      </p>

      {!addressComplete && (
        <AddressGate
          initial={{
            street_address: profileAddress?.street_address ?? null,
            postal_code: profileAddress?.postal_code ?? null,
            city: profileAddress?.city ?? null,
          }}
        />
      )}

      <div
        className={`space-y-14 ${!addressComplete ? "opacity-40 pointer-events-none" : ""}`}
        aria-disabled={!addressComplete}
      >
        {PLAN_TYPE_ORDER.map((type) => {
          const typePlans = plansByType[type];
          if (!typePlans || typePlans.length === 0) return null;

          return (
            <section key={type}>
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6">
                {PLAN_TYPE_LABELS[type] ?? type}
              </h2>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {typePlans.map((plan) => {
                  const em = plan.early_member_pool
                    ? emByPool.get(plan.early_member_pool)
                    : undefined;
                  const emOpen = em?.is_open === true;
                  // Toon dezelfde korting als startSignup daadwerkelijk
                  // rekent, anders klopt de kaart niet met wat er bij
                  // Mollie wordt afgeschreven.
                  const isAllAccessEm = emOpen && plan.plan_type === "all_inclusive";
                  const signupPriceCents = isAllAccessEm
                    ? Math.max(
                        0,
                        plan.price_per_cycle_cents -
                          EARLY_MEMBER_ALL_ACCESS_DISCOUNT_CENTS
                      )
                    : plan.price_per_cycle_cents;
                  const priceEuro = formatEuro(
                    Math.round(signupPriceCents / 100)
                  );
                  const catalogueEuro = isAllAccessEm
                    ? formatEuro(Math.round(plan.price_per_cycle_cents / 100))
                    : null;
                  return (
                    <div
                      key={plan.id}
                      className={`border p-6 md:p-7 flex flex-col h-full ${
                        plan.is_highlighted
                          ? "border-accent bg-bg-elevated shadow-[0_0_40px_-12px_var(--color-accent)]"
                          : "border-bg-subtle bg-bg-elevated"
                      }`}
                    >
                      {plan.is_highlighted && (
                        <span className="inline-block self-start text-[10px] uppercase tracking-[0.2em] bg-accent text-bg px-2 py-1 mb-4">
                          Populair
                        </span>
                      )}
                      <h3 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-2">
                        {plan.display_name}
                      </h3>
                      <div className="mb-5">
                        {catalogueEuro && (
                          <span className="text-text-muted text-lg line-through mr-2">
                            {catalogueEuro}
                          </span>
                        )}
                        <span className="font-[family-name:var(--font-playfair)] text-3xl text-text">
                          {priceEuro}
                        </span>
                        <span className="text-text-muted text-sm ml-2">
                          / {plan.billing_cycle_weeks}wk
                        </span>
                      </div>

                      {plan.includes && plan.includes.length > 0 && (
                        <ul className="space-y-2 mb-6 flex-1">
                          {plan.includes.map((item, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-text"
                            >
                              <Check
                                className="text-accent flex-shrink-0 mt-0.5"
                                size={14}
                              />
                              <span>{item}</span>
                            </li>
                          ))}
                          {/* Alleen All Access Onbeperkt heeft verlengde
                              toegang gratis inbegrepen; op 2x/3x is het een
                              betaalde add-on via de checkbox hieronder. */}
                          {plan.plan_variant === "all_inclusive_unl" && (
                            <li className="flex items-start gap-2 text-sm text-text">
                              <Check
                                className="text-accent flex-shrink-0 mt-0.5"
                                size={14}
                              />
                              <span>Verlengde toegang 06:00–23:00</span>
                            </li>
                          )}
                        </ul>
                      )}

                      {emOpen && (
                        <div className="border border-accent/30 bg-bg px-4 py-3 mb-4">
                          <div className="flex items-baseline justify-between gap-2 mb-2">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-accent">
                              Early Member
                            </span>
                            {/* COPY: confirm met Marlon. Geen plek-telling
                                meer ("nog X van Y"): Early Member is puur
                                deadline-gebaseerd, zie
                                20260712000000_early_member_time_only_gate.sql. */}
                            <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
                              Nog beschikbaar tot {formatDateLong(new Date(em!.closes_at))}
                            </span>
                          </div>
                          <ul className="space-y-1 text-xs text-text-muted">
                            <li>Geen inschrijfkosten</li>
                            <li>Per 4 weken opzegbaar — geen jaarcommitment</li>
                            {plan.plan_type === "all_inclusive" && (
                              <li>Jouw tarief blijft vast zolang je lid bent</li>
                            )}
                          </ul>
                        </div>
                      )}

                      <div className="text-xs text-text-muted mb-4">
                        {emOpen
                          ? "Geen commitment — per 4 weken opzegbaar"
                          : `Commitment: ${plan.commit_months} maanden`}
                      </div>

                      <PlanChooser
                        planVariant={plan.plan_variant}
                        highlighted={plan.is_highlighted}
                        label={`Kies ${plan.display_name}`}
                        earlyMember={emOpen}
                        extendedAccessPriceCents={
                          plan.plan_type === "vrij_trainen" ||
                          (plan.plan_type === "all_inclusive" &&
                            plan.plan_variant !== "all_inclusive_unl")
                            ? extendedAccessPrice
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Container>
  );
}
