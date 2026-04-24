"use client";

import { useState, useTransition } from "react";
import { startSignup } from "@/lib/actions/membership";
import { trackPaymentStart } from "@/lib/analytics";

interface Props {
  planVariant: string;
  label?: string;
  highlighted?: boolean;
}

export function PlanChooser({
  planVariant,
  label = "Kies dit abonnement",
  highlighted = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await startSignup(planVariant);
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
