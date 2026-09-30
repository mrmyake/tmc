import { buildReturnUrl, type ReturnTarget } from "@/lib/native/return-url";
import { thanksPath } from "./guest-checkout-core";

/**
 * "Opnieuw proberen" op de publieke bedankpagina (scherm 6): een nieuwe
 * Mollie-betaling op dezelfde intent. Zelfde drie lagen als
 * payment-link-core.ts, vertaald naar de intent:
 *
 *  1. Reuse: hangt er al een betaling aan de intent, dan eerst haar status
 *     bij Mollie. paid -> already_paid; open -> diezelfde checkout-URL;
 *     pending/authorized -> processing. Alleen na failed, expired of
 *     canceled wordt geminted.
 *  2. Idempotency: de key is deterministisch afgeleid van de oude
 *     betaling (checkout-<intent>-after-<oude id>): twee gelijktijdige
 *     retries sturen dezelfde key en krijgen dezelfde payment terug.
 *  3. Statusguard: replace_checkout_intent_payment is een compare-and-swap
 *     op de oude betaling; wie verliest krijgt payment_mismatch en de
 *     bezoeker probeert het zo nog eens.
 *
 * Alle schrijfacties op de intent lopen via RPC's (besluit 2, PR 1b).
 */

export interface RetryIntentView {
  intent_id: string;
  status: string;
  mode: "live" | "test";
  kind: "subscription" | "product";
  catalogue_slug: string;
  first_charge_cents: number;
  mollie_customer_id: string | null;
  mollie_payment_id: string | null;
  return_target: string | null;
  expired: boolean;
}

export interface IntentRetryDeps {
  db: {
    /** checkout_intent_for_retry(p_status_token); null bij not_found. */
    forRetry(statusToken: string): Promise<RetryIntentView | null>;
    /** replace_checkout_intent_payment; geeft de RPC-reason terug. */
    replacePayment(args: {
      intentId: string;
      oldPaymentId: string | null;
      newPaymentId: string;
    }): Promise<{ ok: boolean; reason?: string }>;
  };
  mollie: {
    getPayment(paymentId: string): Promise<{ status: string; checkoutUrl: string | null }>;
    createPayment(args: {
      amountValue: string;
      description: string;
      redirectUrl: string;
      webhookUrl: string;
      customerId: string;
      isSubscription: boolean;
      intentId: string;
      mode: "live" | "test";
      idempotencyKey: string;
    }): Promise<{ id: string; checkoutUrl: string | null }>;
  };
  urls: { site: string; webhook: string };
}

export type IntentRetryResult =
  | { ok: true; checkoutUrl: string }
  | {
      ok: false;
      reason: "not_found" | "expired" | "already_paid" | "processing" | "try_again";
    };

const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isValidStatusToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export async function retryIntentPaymentCore(
  deps: IntentRetryDeps,
  statusToken: string,
): Promise<IntentRetryResult> {
  if (!isValidStatusToken(statusToken)) return { ok: false, reason: "not_found" };

  const intent = await deps.db.forRetry(statusToken);
  if (!intent) return { ok: false, reason: "not_found" };
  if (intent.status === "converted") return { ok: false, reason: "already_paid" };
  if (intent.status === "failed") {
    // failed na paid: geld is binnen, staf rondt af (scherm 7). Zonder paid
    // is de intent dood; geen nieuwe betaling op een mislukte intent.
    return { ok: false, reason: "already_paid" };
  }
  if (intent.status !== "pending" && intent.status !== "cancelled") {
    return { ok: false, reason: intent.status === "expired" ? "expired" : "not_found" };
  }
  if (intent.expired) return { ok: false, reason: "expired" };
  if (!intent.mollie_customer_id) return { ok: false, reason: "try_again" };

  // Laag 1: bestaande betaling hergebruiken.
  if (intent.mollie_payment_id) {
    let existing: { status: string; checkoutUrl: string | null };
    try {
      existing = await deps.mollie.getPayment(intent.mollie_payment_id);
    } catch (e) {
      console.error("[intent-retry] bestaande betaling ophalen faalde", {
        intentId: intent.intent_id,
        code: (e as { statusCode?: number })?.statusCode ?? "unknown",
      });
      return { ok: false, reason: "try_again" };
    }
    if (existing.status === "paid") return { ok: false, reason: "already_paid" };
    if (existing.status === "open") {
      return existing.checkoutUrl
        ? { ok: true, checkoutUrl: existing.checkoutUrl }
        : { ok: false, reason: "try_again" };
    }
    if (existing.status === "pending" || existing.status === "authorized") {
      return { ok: false, reason: "processing" };
    }
  }

  // Laag 2: deterministische key op de oude betaling.
  const returnTarget: ReturnTarget = intent.return_target === "app" ? "app" : "web";
  const payment = await deps.mollie.createPayment({
    amountValue: (intent.first_charge_cents / 100).toFixed(2),
    description: `The Movement Club | ${intent.catalogue_slug}`,
    redirectUrl: buildReturnUrl(deps.urls.site, thanksPath(intent.kind, statusToken), returnTarget),
    webhookUrl: deps.urls.webhook,
    customerId: intent.mollie_customer_id,
    isSubscription: intent.kind === "subscription",
    intentId: intent.intent_id,
    mode: intent.mode,
    idempotencyKey: `checkout-${intent.intent_id}-after-${intent.mollie_payment_id ?? "none"}`,
  });

  // Laag 3: compare-and-swap in de RPC.
  const swapped = await deps.db.replacePayment({
    intentId: intent.intent_id,
    oldPaymentId: intent.mollie_payment_id,
    newPaymentId: payment.id,
  });
  if (!swapped.ok) {
    if (swapped.reason === "expired") return { ok: false, reason: "expired" };
    if (swapped.reason === "invalid_status") return { ok: false, reason: "already_paid" };
    // payment_mismatch (gelijktijdige retry won), payment_in_use, onbekend.
    return { ok: false, reason: "try_again" };
  }

  return payment.checkoutUrl
    ? { ok: true, checkoutUrl: payment.checkoutUrl }
    : { ok: false, reason: "try_again" };
}
