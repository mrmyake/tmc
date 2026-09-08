"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { createOrderAndCheckout } from "@/lib/orders/create-order";
import { trackCheckoutRejected, trackPaymentStart } from "@/lib/analytics";
import { readGaIds } from "@/lib/ga-ids";
import { formatEuro } from "@/lib/format";
import type { CatalogueRow } from "@/lib/catalogue";
import { computeBreakdown, type Selection } from "@/app/abonnement/lib";
import { formatNoticePeriod } from "@/lib/cancellation-notice";
import { paymentContextForProduct } from "@/lib/product-groups";

/**
 * Bevestig-en-betaal-stap, gedeeld door /abonnement (kind "subscription",
 * de default) en /kopen (kind "product"). De abonnementstak is ongewijzigd
 * verplaatst uit src/app/abonnement/PayStage.tsx; de producttak is een
 * aparte, kleinere component in ditzelfde bestand. Beide sturen alleen een
 * selectie naar createOrderAndCheckout, nooit een bedrag: de prijs komt
 * server-side uit tmc._compute_order_price.
 */

interface SubscriptionProps {
  kind?: "subscription";
  plan: CatalogueRow;
  selection: Selection;
  extendedAccessAddon: CatalogueRow | null;
  signupFee: CatalogueRow | null;
  emActive: boolean;
  /** Uit getCancellationNoticeDays(): dezelfde bron als request_membership_cancellation. */
  cancellationNoticeDays: number;
  onBack: () => void;
}

interface ProductProps {
  kind: "product";
  /** Een rij uit tmc.catalogue met kind "product" (rittenkaart of PT-/Duo-pakket). */
  product: CatalogueRow;
  onBack: () => void;
}

type Props = SubscriptionProps | ProductProps;

export function PayStage(props: Props) {
  if (props.kind === "product") {
    return <ProductPayStage product={props.product} onBack={props.onBack} />;
  }
  return <SubscriptionPayStage {...props} />;
}

function SubscriptionPayStage({
  plan,
  selection,
  extendedAccessAddon,
  signupFee,
  emActive,
  cancellationNoticeDays,
  onBack,
}: SubscriptionProps) {
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
      // Conversiebrug (spec-analytics.md): GA4 client/session-id van deze
      // sessie meesturen zodat de Mollie-webhook het purchase-event
      // server-side aan de juiste sessie kan hangen. Best-effort met harde
      // timeout — bij consent denied of niet-geladen gtag zijn beide
      // undefined en gaat de checkout gewoon door.
      const gaIds = await readGaIds();
      const res = await createOrderAndCheckout({
        slug: plan.slug,
        extendedAccess: selection.extendedAccess,
        commit24m: selection.commit24m,
        earlyMember: breakdown.emOpen,
        gaClientId: gaIds.clientId,
        gaSessionId: gaIds.sessionId,
      });
      if (!res.ok) {
        setError(res.error);
        // Tegenhanger van begin_checkout: zonder dit event is een server-side
        // weigering in GA4 niet te onderscheiden van vrijwillig afhaken.
        trackCheckoutRejected({ itemId: plan.slug, reason: res.reason });
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
        SEPA-incasso elke 4 weken. Opzegtermijn:{" "}
        {formatNoticePeriod(cancellationNoticeDays)}, in acht genomen na je
        commitment-periode.
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

/**
 * Producttak (/kopen): eenmalige betaling, geen mandaat. Alleen de slug
 * gaat mee naar createOrderAndCheckout; extendedAccess/commit24m/
 * earlyMember blijven weg, want _compute_order_price weigert die op een
 * product-rij (invalid_product_options). Na Mollie landt de koper op
 * /app/producten?tab=tegoed (redirect bepaald in create-order.ts).
 */
function ProductPayStage({
  product,
  onBack,
}: {
  product: CatalogueRow;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePay() {
    setError(null);
    startTransition(async () => {
      // Zelfde conversiebrug als de abonnementstak: /kopen is een publieke
      // route voor de meetgrens, dus de GA4-id's reizen mee op de orderrij.
      const gaIds = await readGaIds();
      const res = await createOrderAndCheckout({
        slug: product.slug,
        gaClientId: gaIds.clientId,
        gaSessionId: gaIds.sessionId,
      });
      if (!res.ok) {
        setError(res.error);
        trackCheckoutRejected({ itemId: product.slug, reason: res.reason });
        return;
      }
      trackPaymentStart({
        amount: res.amountCents / 100,
        context: paymentContextForProduct(product.slug),
        planVariant: product.slug,
      });
      window.location.href = res.checkoutUrl;
    });
  }

  const needsProfile = error?.toLowerCase().includes("profiel") ?? false;
  const showCredits = product.credits !== null && product.credits > 1;

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
        Je betaalt eenmalig via iDEAL of creditcard. Geen abonnement, geen
        automatische incasso. Je tegoed staat direct na betaling in je
        account.
      </p>

      <div className="border border-bg-subtle bg-bg-elevated p-6 mb-8">
        {/* COPY: confirm met Marlon */}
        <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-3">
          Jouw keuze
        </div>
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <span className="font-[family-name:var(--font-playfair)] text-2xl text-text">
            {product.display_name}
          </span>
          <span className="font-[family-name:var(--font-playfair)] text-2xl text-text shrink-0">
            {formatEuro(Math.round(product.price_cents / 100))}
          </span>
        </div>
        <div className="text-xs text-text-muted">
          {/* COPY: confirm met Marlon */}
          Eenmalig
          {showCredits && <>, {product.credits} ritten</>}
          {product.validity_months !== null && (
            <>, {product.validity_months} maanden geldig</>
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
