"use client";

import { useState, useTransition } from "react";
import { createOrderAndCheckout } from "@/lib/orders/create-order";
import { trackPaymentStart, trackCTA } from "@/lib/analytics";

interface Props {
  slug: string;
  /** Alleen voor analytics-context, geen invloed op de prijs (die komt
   * server-side uit create_order/_compute_order_price). */
  productLabel: string;
}

export function BuyButton({ slug, productLabel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleBuy() {
    setError(null);
    trackCTA(`Koop ${productLabel}`, "/app/producten");
    startTransition(async () => {
      // Alleen de slug: geen extendedAccess/commit24m/earlyMember, die
      // gelden uitsluitend voor abonnementen en worden door
      // _compute_order_price sowieso geweigerd op een product-rij.
      const res = await createOrderAndCheckout({ slug });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      trackPaymentStart({
        amount: res.amountCents / 100,
        context: slug.startsWith("ten_ride_card")
          ? "ten_ride_card"
          : "pt_package",
        planVariant: slug,
      });
      window.location.href = res.checkoutUrl;
    });
  }

  const needsProfile = error?.toLowerCase().includes("profiel") ?? false;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleBuy}
        disabled={pending}
        className={`border border-text text-text text-sm font-medium px-5 py-2.5 cursor-pointer transition-colors duration-300 hover:bg-text hover:text-bg ${
          pending ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {/* COPY: confirm met Marlon */}
        {pending ? "Bezig..." : "Koop"}
      </button>
      {error && (
        <p
          role="alert"
          className="text-xs text-[color:var(--danger)] text-right max-w-[16rem]"
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
    </div>
  );
}
