"use client";

import { useState, useTransition } from "react";
import { startSignup } from "@/lib/actions/membership";
import { trackPaymentStart } from "@/lib/analytics";
import { formatEuro } from "@/lib/crowdfunding-helpers";

interface Props {
  planVariant: string;
  label?: string;
  highlighted?: boolean;
  /** Start de signup als Early Member (pool-plek wordt gereserveerd). */
  earlyMember?: boolean;
  /**
   * Toon de verlengde-toegang-opt-in (alleen vrij_trainen); het bedrag is
   * de add-on-prijs per 4 weken uit booking_settings.
   */
  extendedAccessPriceCents?: number;
}

export function PlanChooser({
  planVariant,
  label = "Kies dit abonnement",
  highlighted = false,
  earlyMember = false,
  extendedAccessPriceCents,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [extendedAccess, setExtendedAccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await startSignup(planVariant, {
        earlyMember,
        extendedAccess,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      trackPaymentStart({
        amount: res.amountCents / 100,
        context: "first_membership",
        planVariant,
      });
      window.location.href = res.checkoutUrl;
    });
  }

  return (
    <>
      {typeof extendedAccessPriceCents === "number" && (
        <label className="flex items-start gap-2.5 mb-4 text-sm text-text cursor-pointer select-none">
          <input
            type="checkbox"
            checked={extendedAccess}
            onChange={(e) => setExtendedAccess(e.target.checked)}
            className="mt-0.5 accent-[color:var(--color-accent)]"
          />
          <span>
            Verlengde toegang 06:00–23:00
            <span className="text-text-muted">
              {" "}
              (+{formatEuro(extendedAccessPriceCents / 100)}/4wk)
            </span>
          </span>
        </label>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`w-full inline-flex items-center justify-center px-6 py-3 text-sm font-medium uppercase tracking-[0.15em] transition-colors cursor-pointer ${
          highlighted
            ? "bg-accent text-bg hover:bg-accent-hover"
            : "border border-accent text-accent hover:bg-accent hover:text-bg"
        } ${pending ? "opacity-50 pointer-events-none" : ""}`}
      >
        {pending ? "Doorsturen..." : label}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-3 text-xs text-[color:var(--danger)] border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 px-3 py-2"
        >
          {error}
        </p>
      )}
    </>
  );
}
