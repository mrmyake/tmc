import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { createClient } from "@/lib/supabase/server";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { getCampaignDeadline, getCampaignPhase } from "@/lib/campaign";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { PlanChooser } from "./PlanChooser";
import { AddressGate } from "./AddressGate";

export const metadata = {
  title: "Kies abonnement | The Movement Club",
  robots: { index: false, follow: false },
};

const FAMILY_LABELS: Record<string, string> = {
  vrij_trainen: "Vrij Trainen",
  // COPY: confirm met Marlon
  groepslessen: "Groepslessen",
  // COPY: confirm met Marlon
  all_inclusive: "All Access",
};

const FAMILY_ORDER = ["vrij_trainen", "groepslessen", "all_inclusive"];

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

  const [{ data: profileAddress }, catalogue, campaignDeadlineIso] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("street_address, postal_code, city")
        .eq("id", user.id)
        .maybeSingle(),
      getCatalogue(),
      getCampaignDeadline(),
    ]);

  const addressComplete = Boolean(
    profileAddress?.street_address?.trim() &&
      profileAddress?.postal_code?.trim() &&
      profileAddress?.city?.trim(),
  );

  // Eén fasebron (src/lib/campaign.ts): Early Member is alleen actief
  // terwijl de campagne open is EN de catalogusrij zelf eligible is. Zelfde
  // gate als tmc._compute_order_price(), dus wat hier getoond wordt kan
  // niet afwijken van wat create_order() daadwerkelijk toepast.
  const emActive = getCampaignPhase(new Date(campaignDeadlineIso)) === "open-em";
  const extendedAccessAddon = catalogue.get("extended_access");
  const signupFee = catalogue.get("signup_fee");

  const plansByFamily = new Map<string, CatalogueRow[]>();
  for (const row of catalogue.values()) {
    if (row.kind !== "plan" || !row.family) continue;
    const list = plansByFamily.get(row.family) ?? [];
    list.push(row);
    plansByFamily.set(row.family, list);
  }
  for (const list of plansByFamily.values()) {
    // Onbeperkt (frequency_cap null) laatst.
    list.sort((a, b) => (a.frequency_cap ?? Infinity) - (b.frequency_cap ?? Infinity));
  }

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
        Alle prijzen zijn per 4 weken. Eenmalige inschrijfkosten worden bij de
        eerste betaling bijgeteld — als Early Member vervallen die.
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
        {FAMILY_ORDER.map((family) => {
          const familyPlans = plansByFamily.get(family);
          if (!familyPlans || familyPlans.length === 0) return null;

          return (
            <section key={family}>
              <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-6">
                {FAMILY_LABELS[family] ?? family}
              </h2>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {familyPlans.map((plan) => {
                  const emOpen = emActive && plan.early_member_eligible;
                  // Zelfde coalesce als tmc._compute_order_price(): alleen
                  // een strikethrough tonen als de EM-prijs echt afwijkt
                  // (bv. all_inclusive_unl); Groepslessen heeft geen eigen
                  // EM-prijs, alleen de fee-waiver en commit 0 hieronder.
                  const hasEmDiscount =
                    emOpen &&
                    plan.early_member_price_cents !== null &&
                    plan.early_member_price_cents !== plan.price_cents;
                  const signupPriceCents = hasEmDiscount
                    ? plan.early_member_price_cents!
                    : plan.price_cents;
                  const priceEuro = formatEuro(
                    Math.round(signupPriceCents / 100),
                  );
                  const catalogueEuro = hasEmDiscount
                    ? formatEuro(Math.round(plan.price_cents / 100))
                    : null;

                  return (
                    <div
                      key={plan.slug}
                      className="border border-bg-subtle bg-bg-elevated p-6 md:p-7 flex flex-col h-full"
                    >
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

                      {/* Inschrijfkosten expliciet tonen vóór de keuze, niet
                          pas als totaalbedrag op het Mollie-scherm. Alleen
                          bij Early Member al gedekt door de "Geen
                          inschrijfkosten"-regel hieronder. */}
                      {!emOpen && signupFee && signupFee.price_cents > 0 && (
                        <p className="text-text-muted text-xs mb-4">
                          {/* COPY: confirm met Marlon */}
                          + {formatEuro(Math.round(signupFee.price_cents / 100))}{" "}
                          inschrijfkosten, eenmalig bij de eerste betaling
                        </p>
                      )}

                      {plan.extended_access_mode === "included" && (
                        <ul className="space-y-2 mb-6 flex-1">
                          <li className="flex items-start gap-2 text-sm text-text">
                            <Check
                              className="text-accent flex-shrink-0 mt-0.5"
                              size={14}
                            />
                            {/* COPY: confirm met Marlon */}
                            <span>Verlengde toegang 06:00-23:00</span>
                          </li>
                        </ul>
                      )}

                      {emOpen && (
                        <div className="border border-accent/30 bg-bg px-4 py-3 mb-4">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-accent block mb-2">
                            Early Member
                          </span>
                          <ul className="space-y-1 text-xs text-text-muted">
                            {/* COPY: confirm met Marlon */}
                            <li>Geen inschrijfkosten</li>
                            <li>Per 4 weken opzegbaar — geen jaarcommitment</li>
                            {hasEmDiscount && (
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
                        planVariant={plan.slug}
                        label={`Kies ${plan.display_name}`}
                        earlyMember={emOpen}
                        extendedAccessPriceCents={
                          plan.extended_access_mode === "addon"
                            ? extendedAccessAddon?.price_cents
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
