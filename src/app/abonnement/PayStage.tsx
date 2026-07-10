"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createOrderAndCheckout } from "@/lib/orders/create-order";
import { trackPaymentStart } from "@/lib/analytics";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import type { CatalogueRow } from "@/lib/catalogue";
import { computeBreakdown, type Selection } from "./lib";

interface Props {
  plan: CatalogueRow;
  selection: Selection;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  emActive: boolean;
  onBack: () => void;
}

export function PayStage({
  plan,
  selection,
  extendedAccessAddon,
  signupFee,
  emActive,
  onBack,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Weergave-only, catalogus-afgeleid: createOrderAndCheckout retourneert
  // alleen {checkoutUrl, amountCents} na create_order + Mollie in één stap,
  // dus er is geen server-snapshot om hier vooraf te tonen. amountCents uit
  // de respons is en blijft de enige autoritatieve waarde (besluit WS-4
  // Phase 2 §1); er komt bewust geen preview-RPC bij.
  const breakdown = computeBreakdown({
    plan,
    extendedAccessAddon: extendedAccessAddon ?? undefined,
    signupFee: signupFee ?? undefined,
    extendedAccess: selection.extendedAccess,
    commit24m: selection.commit24m,
    emActive,
  });

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const res = await createOrderAndCheckout({
        slug: plan.slug,
        extendedAccess: selection.extendedAccess,
        commit24m: selection.commit24m,
        earlyMember: breakdown.emOpen,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      trackPaymentStart({
        amount: res.amountCents / 100,
        context: "first_membership",
        planVariant: plan.slug,
      });
      window.location.href = res.checkoutUrl;
    });
  }

  const needsProfile = error?.toLowerCase().includes("profiel") ?? false;

  return (
    <div>
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
        Stap 03 · Bevestigen
      </span>
      {/* COPY: confirm met Marlon */}
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text mb-3">
        Controleer je keuze.
      </h1>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted mb-8 max-w-xl">
        Na betaling (iDEAL of creditcard) machtig je Mollie voor automatische
        SEPA-incasso elke 4 weken. Opzegtermijn: 4 weken, in acht genomen na
        je commitment-periode.
      </p>

      <div className="border border-bg-subtle bg-bg-elevated p-6 mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-3">
          Jouw plan
        </div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-[family-name:var(--font-playfair)] text-2xl text-text">
            {plan.display_name}
          </span>
          <span className="font-[family-name:var(--font-playfair)] text-2xl text-text">
            {formatEuro(Math.round(breakdown.recurringTotalCents / 100))}
            <span className="text-text-muted text-sm ml-1">/4wk</span>
          </span>
        </div>
        {breakdown.extendedAccessCents > 0 && (
          // COPY: confirm met Marlon
          <div className="text-xs text-text-muted mb-1">
            incl. verlengde toegang +
            {formatEuro(Math.round(breakdown.extendedAccessCents / 100))}/4wk
          </div>
        )}
        <div className="text-xs text-text-muted mb-1">
          {breakdown.signupFeeCents > 0 ? (
            // COPY: confirm met Marlon
            <>
              + {formatEuro(Math.round(breakdown.signupFeeCents / 100))}{" "}
              inschrijfkosten, eenmalig
            </>
          ) : (
            // COPY: confirm met Marlon
            <>Geen inschrijfkosten</>
          )}
        </div>
        <div className="text-xs text-text-muted">
          {breakdown.emOpen ? (
            // COPY: confirm met Marlon
            "Geen commitment, per 4 weken opzegbaar"
          ) : (
            // COPY: confirm met Marlon
            `Commitment: ${breakdown.commitMonths} maanden`
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-6 text-sm text-[color:var(--danger)] border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 px-4 py-3"
        >
          {error}
          {needsProfile && (
            <>
              {" "}
              {/* COPY: confirm met Marlon */}
              <a href="/app/profiel" className="underline">
                Naar je profiel
              </a>
            </>
          )}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Terug
        </button>
        <Button
          type="button"
          onClick={handlePay}
          className={pending ? "opacity-50 pointer-events-none" : ""}
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Doorsturen..." : "Betaal nu"}
        </Button>
      </div>
    </div>
  );
}
