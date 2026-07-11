"use client";

import { useState } from "react";
import type { CatalogueRow } from "@/lib/catalogue";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import {
  EM_ACTIVE,
  PRODUCT_LABELS,
  computeBreakdown,
  resolveSubscriptionPlan,
  type ProductSlug,
  type SubscriptionRowId,
  type SubscriptionRowToggle,
} from "../lib";
import { Stepper } from "./Stepper";
import { KlantStap } from "./KlantStap";
import { ProductStap } from "./ProductStap";
import { VoorwaardenStap, type Voorwaarden } from "./VoorwaardenStap";
import { VerstuurStap, type OrderPayload } from "./VerstuurStap";

export type WizardStep = "klant" | "product" | "voorwaarden" | "versturen";
export type Track = "subscription" | "product";

export type ProductSelection =
  | { kind: "subscription"; rowId: SubscriptionRowId; toggle: SubscriptionRowToggle }
  | { kind: "product"; slug: ProductSlug };

interface BetaalverzoekWizardProps {
  plans: Record<string, CatalogueRow>;
  products: Record<string, CatalogueRow>;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
}

const DEFAULT_VOORWAARDEN: Voorwaarden = {
  waiveSignupFee: false,
  commit24m: false,
};

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

/**
 * WS-5 PR C: de Nieuw-betaalverzoek-wizard. Presentatie boven bewezen
 * fundamenten (searchCustomers/findOrCreateCustomer uit PR B,
 * createPaymentRequest uit PR A); deze component herberekent zelf geen
 * prijzen en maakt geen klanten of orders buiten die server-acties om.
 */
export function BetaalverzoekWizard({
  plans,
  products,
  extendedAccessAddon,
  signupFee,
}: BetaalverzoekWizardProps) {
  const [step, setStep] = useState<WizardStep>("klant");
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [selection, setSelection] = useState<ProductSelection | null>(null);
  const [voorwaarden, setVoorwaarden] = useState<Voorwaarden>(
    DEFAULT_VOORWAARDEN,
  );

  function handleCustomerSelect(profile: CustomerProfile) {
    setCustomer(profile);
    setStep("product");
  }

  function handleTrackChange(next: Track) {
    if (next !== track) {
      setSelection(null);
      setVoorwaarden(DEFAULT_VOORWAARDEN);
    }
    setTrack(next);
  }

  function restart() {
    setStep("klant");
    setCustomer(null);
    setTrack(null);
    setSelection(null);
    setVoorwaarden(DEFAULT_VOORWAARDEN);
  }

  // Resolutie van de huidige selectie naar een echte catalogus-rij, zelfde
  // functie als ProductStap gebruikt (resolveSubscriptionPlan, alleen
  // planSlug-lookups, geen optelling).
  const subscriptionPlan =
    selection?.kind === "subscription"
      ? resolveSubscriptionPlan(selection.rowId, selection.toggle, plans)
      : undefined;
  const productRow =
    selection?.kind === "product" ? products[selection.slug] : undefined;

  const isSubscription = selection?.kind === "subscription";
  const canContinueFromProduct = Boolean(subscriptionPlan || productRow);

  // extendedAccess wordt alleen true gestuurd als de rij zelf een addon is
  // en de toggle aan staat -- op een 'na'-rij zou true een
  // extended_access_not_available-afwijzing opleveren
  // (tmc._compute_order_price), op een 'included'-rij regelt de server het
  // zelf via de elsif-tak, ongeacht wat hier gestuurd wordt.
  const extendedAccess =
    subscriptionPlan?.extended_access_mode === "addon" &&
    selection?.kind === "subscription"
      ? selection.toggle.ext
      : false;

  const breakdown = subscriptionPlan
    ? computeBreakdown({
        plan: subscriptionPlan,
        extendedAccessAddon: extendedAccessAddon ?? undefined,
        signupFee: signupFee ?? undefined,
        extendedAccess,
        commit24m: voorwaarden.commit24m,
        emActive: EM_ACTIVE,
      })
    : null;

  // Preview-only: firstCharge = recurring + fee, zelfde optelling als de
  // publieke configurator toont (ConfigureStage) en als
  // tmc._compute_order_price server-side rekent. De waiver-boolean wordt
  // hier triviaal toegepast (nooit een nieuwe korting-berekening) omdat
  // Early Member in de admin-wizard altijd uit staat, dus signup_fee_waiver
  // uit de RPC altijd null is totdat p_waive_signup_fee 'm op 'overstap'
  // zet -- exact wat deze toggle voorstelt.
  const previewAmountCents = breakdown
    ? breakdown.recurringTotalCents +
      (voorwaarden.waiveSignupFee ? 0 : breakdown.signupFeeCents)
    : (productRow?.price_cents ?? 0);

  const productLabel = subscriptionPlan
    ? subscriptionPlan.display_name
    : productRow && selection?.kind === "product"
      ? PRODUCT_LABELS[selection.slug]
      : "";

  const order: OrderPayload = {
    slug: subscriptionPlan?.slug ?? productRow?.slug ?? "",
    extendedAccess,
    commit24m: isSubscription ? voorwaarden.commit24m : false,
    waiveSignupFee: isSubscription ? voorwaarden.waiveSignupFee : false,
  };

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14 max-w-3xl">
      <header className="mb-10">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.02] tracking-[-0.02em]">
          Nieuw betaalverzoek.
        </h1>
        {/* COPY: confirm met Marlon */}
        <p className="tmc-eyebrow mt-4">
          Kies een klant, kies wat ze afnemen, en stuur een betaallink
        </p>
      </header>

      <Stepper current={step} />

      {customer && step !== "klant" && (
        <div className="flex items-center gap-4 bg-text text-bg px-5 py-3.5 mb-4">
          <span
            aria-hidden
            className="w-9 h-9 rounded-full bg-accent text-bg flex items-center justify-center text-sm font-medium shrink-0"
          >
            {initials(customer.firstName, customer.lastName)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-[family-name:var(--font-playfair)] text-sm truncate">
              {customer.firstName} {customer.lastName}
            </div>
            <div className="text-xs text-bg/60 truncate">{customer.email}</div>
          </div>
          <button
            type="button"
            onClick={() => setStep("klant")}
            className="text-xs text-accent underline underline-offset-4 cursor-pointer shrink-0"
          >
            {/* COPY: confirm met Marlon */}
            Andere klant
          </button>
        </div>
      )}

      {step === "klant" && <KlantStap onSelect={handleCustomerSelect} />}

      {step === "product" && (
        <>
          <ProductStap
            plans={plans}
            products={products}
            extendedAccessAddon={extendedAccessAddon}
            signupFee={signupFee}
            track={track}
            onTrackChange={handleTrackChange}
            selection={selection}
            onSelectionChange={setSelection}
          />
          <div className="flex justify-between gap-3 mt-6">
            <button
              type="button"
              onClick={() => setStep("klant")}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Terug
            </button>
            <button
              type="button"
              onClick={() => setStep("voorwaarden")}
              disabled={!canContinueFromProduct}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Volgende
            </button>
          </div>
        </>
      )}

      {step === "voorwaarden" && (
        <>
          <VoorwaardenStap
            isSubscription={isSubscription}
            plan={subscriptionPlan ?? null}
            voorwaarden={voorwaarden}
            onChange={setVoorwaarden}
          />
          <div className="flex justify-between gap-3 mt-6">
            <button
              type="button"
              onClick={() => setStep("product")}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Terug
            </button>
            <button
              type="button"
              onClick={() => setStep("versturen")}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Volgende
            </button>
          </div>
        </>
      )}

      {step === "versturen" && customer && (
        <VerstuurStap
          customer={customer}
          productLabel={productLabel}
          previewAmountCents={previewAmountCents}
          order={order}
          onBack={() => setStep("voorwaarden")}
          onRestart={restart}
        />
      )}
    </div>
  );
}
