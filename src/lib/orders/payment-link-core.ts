/**
 * WS-5 PR A, kernlogica van de betaallink (/betaal/[token]).
 *
 * Bewust los van de "use server"-wrapper (payment-link.ts) en zonder
 * server-only imports: de afhankelijkheden (DB, Mollie) komen binnen via een
 * smal deps-interface, zodat de dubbele-betaling-invariant met fakes
 * aantoonbaar te testen is tegen exact deze code.
 *
 * De invariant, in drie lagen:
 *  1. Reuse: is er al een Mollie-payment met status 'open' aan de order
 *     gekoppeld, dan geven we diens checkout-URL terug en minten we niets.
 *     Een nieuwe payment ontstaat alleen als er nog geen bestaat of de vorige
 *     terminaal dood is (failed/expired/canceled, die kunnen bij Mollie
 *     nooit meer betaald worden).
 *  2. Idempotency: de idempotencyKey is deterministisch afgeleid van het
 *     aantal reeds geregistreerde payments voor de order. Twee gelijktijdige
 *     mint-pogingen lezen dezelfde teller, sturen dezelfde key, en krijgen
 *     van Mollie hetzelfde payment-object terug: één payment, geen twee.
 *  3. Statusguard: het koppelen van de payment aan de order muteert alleen
 *     rijen die nog draft/pending zijn. Flipte de webhook de order intussen
 *     naar activated, dan geven we geen checkout-URL terug.
 */

export interface PaymentLinkOrder {
  id: string;
  profile_id: string;
  kind: "subscription" | "product";
  catalogue_slug: string;
  status: string;
  expires_at: string;
  first_charge_cents: number;
  mollie_payment_id: string | null;
  mollie_customer_id: string | null;
}

export interface PaymentLinkProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mollie_customer_id: string | null;
}

export interface MolliePaymentView {
  id: string;
  status: string;
  checkoutUrl: string | null;
}

export interface PaymentLinkDeps {
  db: {
    getOrderByToken(token: string): Promise<PaymentLinkOrder | null>;
    getProfile(profileId: string): Promise<PaymentLinkProfile | null>;
    saveMollieCustomerId(profileId: string, customerId: string): Promise<void>;
    countPaymentsForOrder(orderId: string): Promise<number>;
    /** Koppelt de payment; alleen als de order nog draft/pending is. True = gelukt. */
    markOrderPending(
      orderId: string,
      molliePaymentId: string,
      mollieCustomerId: string,
    ): Promise<boolean>;
    getOrderStatus(orderId: string): Promise<string | null>;
    upsertPaymentRow(row: {
      mollie_payment_id: string;
      profile_id: string;
      order_id: string;
      amount_cents: number;
      status: string;
      description: string;
    }): Promise<void>;
  };
  mollie: {
    getPayment(paymentId: string): Promise<MolliePaymentView>;
    createCustomer(args: {
      name: string;
      email: string;
      profileId: string;
    }): Promise<string>;
    createPayment(args: {
      amountValue: string;
      description: string;
      redirectUrl: string;
      webhookUrl: string;
      customerId: string;
      isSubscription: boolean;
      orderId: string;
      profileId: string;
      idempotencyKey: string;
    }): Promise<MolliePaymentView>;
  };
  urls: { site: string; webhook: string };
}

export type PaymentLinkCheckoutResult =
  | { ok: true; checkoutUrl: string }
  | {
      ok: false;
      reason: "not_found" | "expired" | "already_paid" | "processing" | "try_again";
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidOrderToken(token: string): boolean {
  return UUID_RE.test(token);
}

/**
 * Valideert het token en start (of hervat) de Mollie-checkout voor de order.
 * Publiek aanroepbaar: het token is de enige poort, dus elke uitkomst hier
 * lekt niet meer dan de bijbehorende pagina-staat al toont. Een cancelled
 * order gedraagt zich als onbekend token.
 */
export async function startCheckoutCore(
  deps: PaymentLinkDeps,
  token: string,
): Promise<PaymentLinkCheckoutResult> {
  if (!isValidOrderToken(token)) return { ok: false, reason: "not_found" };

  const order = await deps.db.getOrderByToken(token);
  if (!order || order.status === "cancelled") {
    return { ok: false, reason: "not_found" };
  }
  if (order.status === "activated" || order.status === "paid") {
    return { ok: false, reason: "already_paid" };
  }
  // Zachte muur: op een verlopen link minten we niets nieuws, maar een al
  // lopende betaling wordt door activate_order bewust nog gehonoreerd
  // (WS-2 §4), dat pad loopt via de webhook en raakt deze functie niet.
  if (order.status === "expired" || new Date(order.expires_at) <= new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (order.status !== "draft" && order.status !== "pending") {
    return { ok: false, reason: "not_found" };
  }

  // Invariant-laag 1: bestaande payment hergebruiken in plaats van minten.
  if (order.mollie_payment_id) {
    let existing: MolliePaymentView;
    try {
      existing = await deps.mollie.getPayment(order.mollie_payment_id);
    } catch (e) {
      // Status onbekend: NIET doorminten (dat zou een tweede open payment
      // kunnen opleveren), maar de klant vragen het zo nog eens te proberen.
      console.error("[payment-link] bestaande payment ophalen faalde", e);
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
    // failed/expired/canceled: terminaal dood bij Mollie, veilig om een
    // nieuwe poging te minten.
  }

  const profile = await deps.db.getProfile(order.profile_id);
  if (!profile?.email) {
    console.error("[payment-link] profiel zonder e-mail", order.profile_id);
    return { ok: false, reason: "try_again" };
  }

  // De payment hangt ALTIJD onder de Mollie-customer van het doelprofiel
  // (de klant): daar landt het SEPA-mandaat, en activate_order leest de
  // customer terug van de order-rij voor de subscription-aanmaak.
  let customerId = order.mollie_customer_id ?? profile.mollie_customer_id;
  if (!customerId) {
    const name =
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      profile.email;
    customerId = await deps.mollie.createCustomer({
      name,
      email: profile.email,
      profileId: order.profile_id,
    });
    await deps.db.saveMollieCustomerId(order.profile_id, customerId);
  }

  // Invariant-laag 2: attempt-teller uit de payments-log. Gelijktijdige
  // aanroepen zien dezelfde teller en dus dezelfde idempotencyKey; Mollie
  // dedupliceert die naar één payment. '-link-' onderscheidt van de
  // self-service key 'order-<id>-p1' (create-order.ts).
  const attempt = (await deps.db.countPaymentsForOrder(order.id)) + 1;
  const payment = await deps.mollie.createPayment({
    amountValue: (order.first_charge_cents / 100).toFixed(2),
    description: `The Movement Club | ${order.catalogue_slug}`,
    redirectUrl: `${deps.urls.site}/betaal/${token}`,
    webhookUrl: deps.urls.webhook,
    customerId,
    isSubscription: order.kind === "subscription",
    orderId: order.id,
    profileId: order.profile_id,
    idempotencyKey: `order-${order.id}-link-${attempt}`,
  });

  // Invariant-laag 3: koppelen mag alleen zolang de order draft/pending is.
  const linked = await deps.db.markOrderPending(order.id, payment.id, customerId);
  if (!linked) {
    const status = await deps.db.getOrderStatus(order.id);
    if (status === "activated" || status === "paid") {
      return { ok: false, reason: "already_paid" };
    }
    if (status === "expired") return { ok: false, reason: "expired" };
    return { ok: false, reason: "try_again" };
  }

  await deps.db.upsertPaymentRow({
    mollie_payment_id: payment.id,
    profile_id: order.profile_id,
    order_id: order.id,
    amount_cents: order.first_charge_cents,
    status: "open",
    description: `Order ${order.id}, ${order.catalogue_slug}`,
  });

  return payment.checkoutUrl
    ? { ok: true, checkoutUrl: payment.checkoutUrl }
    : { ok: false, reason: "try_again" };
}
