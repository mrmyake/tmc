"use server";

import { SequenceType } from "@mollie/api-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { getMollieClient } from "@/lib/mollie";
import { siteUrl, mollieWebhookUrl } from "@/lib/site-url";

export type CreateOrderAndCheckoutResult =
  | { ok: true; checkoutUrl: string; amountCents: number }
  | { ok: false; error: string; reason: CreateOrderFailureReason };

/**
 * Machine-leesbare tegenhanger van `error`. Bestaat voor analytics: GA4 mag
 * geen Nederlandse foutcopy als dimensie krijgen, want die copy verandert
 * (staat vol `COPY: confirm met Marlon`) zonder dat de meting mag breken.
 * RPC-reasons komen alleen door als ze in REASON_COPY staan — een onbekende
 * DB-reason wordt `unknown_reason`, zodat de cardinaliteit begrensd blijft.
 */
export type CreateOrderFailureReason =
  | keyof typeof REASON_COPY
  | "not_authenticated"
  | "profile_incomplete"
  | "rpc_error"
  | "unknown_reason"
  | "mollie_unavailable"
  | "checkout_url_missing"
  | "unexpected_error";

export interface CreateOrderSelection {
  /** tmc.catalogue slug: a plan (subscription) or a product. */
  slug: string;
  extendedAccess?: boolean;
  commit24m?: boolean;
  /**
   * Intent only, never authoritative: tmc.create_order() applies Early
   * Member only when the row is eligible AND the campaign phase is open
   * right now, checked server-side in the same transaction as the price.
   */
  earlyMember?: boolean;
  /**
   * Conversiebrug (spec-analytics.md): GA4 client/session-id van de
   * checkout-sessie, alleen gezet vanaf de publieke site (PayStage).
   * BuyButton (/app/producten) stuurt ze bewust niet mee — achter de
   * meetgrens. Ze gaan met een losse update op de orderrij (route (b),
   * niet door create_order), en ontbreken is de normale situatie.
   */
  gaClientId?: string;
  gaSessionId?: string;
}

// Vertaalt create_order()'s {ok:false, reason} naar klanttaal. Onbekende
// reasons vallen terug op een generieke melding i.p.v. de ruwe DB-reason
// te tonen.
const REASON_COPY = {
  catalogue_row_not_found: "Dit abonnement is niet (meer) beschikbaar.",
  not_purchasable:
    "Dit is geen abonnement dat je direct kunt afsluiten. Neem contact met ons op.",
  invalid_kind: "Dit abonnement is niet (meer) beschikbaar.",
  em_and_24m_exclusive:
    "Early Member en de 24-maanden-korting zijn niet te combineren.",
  commit_24m_not_offered:
    "24 maanden commitment is niet beschikbaar op dit abonnement.",
  extended_access_not_available:
    "Verlengde toegang is niet beschikbaar op dit abonnement.",
  invalid_product_options: "Deze opties zijn niet geldig voor dit product.",
  product_not_supported:
    "Dit product is niet online te koop. Neem contact met ons op.", // COPY: confirm met Marlon
  existing_membership: "Je hebt al een actief abonnement.",
  existing_open_order:
    "Je hebt al een openstaande aanmelding. Rond die eerst af.",
} satisfies Record<string, string>;

/**
 * Start een order voor de ingelogde gebruiker: creëert de order via de
 * create_order-RPC (die zelf de prijs herberekent uit tmc.catalogue, nooit
 * op basis van deze selectie), maakt (of hergebruikt) de Mollie-klant, en
 * start de eerste betaling.
 *
 * Vervangt startSignup. De RPC is de enige plek die tmc.orders mag
 * inserten; deze functie stuurt alleen een selectie, nooit een bedrag.
 */
export async function createOrderAndCheckout(
  selection: CreateOrderSelection,
): Promise<CreateOrderAndCheckoutResult> {
  let admin: ReturnType<typeof createAdminClient> | null = null;
  let orderId: string | null = null;

  /** Zet een gecreëerde order op cancelled als de flow daarna strandt. */
  async function abandonOrder(): Promise<void> {
    if (!orderId || !admin) return;
    try {
      await admin
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId)
        .in("status", ["draft", "pending"]);
    } catch (e) {
      console.error("[createOrderAndCheckout] abandon order failed", e);
    }
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return { ok: false, error: "Niet ingelogd.", reason: "not_authenticated" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name,last_name,mollie_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.first_name || !profile?.last_name) {
      return {
        ok: false,
        error: "Vul eerst je profiel in (voor- en achternaam).",
        reason: "profile_incomplete",
      };
    }

    // Prijs, Early Member-toepassing en alle guards zitten in de RPC; hier
    // gaat alleen de selectie heen, nooit een bedrag.
    const { data: orderResult, error: rpcError } = await supabase.rpc(
      "create_order",
      {
        p_slug: selection.slug,
        p_extended_access: selection.extendedAccess ?? false,
        p_commit_24m: selection.commit24m ?? false,
        p_early_member: selection.earlyMember ?? false,
      },
    );
    if (rpcError) {
      console.error("[createOrderAndCheckout] create_order rpc", rpcError);
      return {
        ok: false,
        error: "Kon aanmelding niet opslaan.",
        reason: "rpc_error",
      };
    }
    if (!orderResult?.ok) {
      // Alleen bekende reasons doorgeven; een onbekende DB-reason valt hier
      // net als voorheen terug op de generieke melding, en op een vaste code.
      const known: keyof typeof REASON_COPY | null =
        typeof orderResult?.reason === "string" &&
        orderResult.reason in REASON_COPY
          ? (orderResult.reason as keyof typeof REASON_COPY)
          : null;
      return {
        ok: false,
        error: known ? REASON_COPY[known] : "Kon aanmelding niet opslaan.",
        reason: known ?? "unknown_reason",
      };
    }

    orderId = orderResult.order_id as string;
    const firstChargeCents = orderResult.first_charge_cents as number;
    const isSubscription = orderResult.recurring_cents !== null;

    admin = createAdminClient();

    // Conversiebrug: GA4-attributie op de orderrij, ná create_order als
    // losse write (route (b), spec-analytics.md) — analytics-metadata hoort
    // niet door de autoritatieve prijsfunctie. Mag de checkout nooit
    // blokkeren: eigen try/catch (de omhullende catch zou de order
    // abandonnen, en dat mag een analytics-write nooit veroorzaken),
    // error alleen gelogd, flow gaat door.
    if (selection.gaClientId) {
      try {
        const { error: gaError } = await admin
          .from("orders")
          .update({
            ga_client_id: selection.gaClientId,
            ga_session_id: selection.gaSessionId ?? null,
          })
          .eq("id", orderId);
        if (gaError) {
          console.error("[createOrderAndCheckout] ga attribution write", gaError);
        }
      } catch (gaErr) {
        console.error("[createOrderAndCheckout] ga attribution write", gaErr);
      }
    }

    const mollie = getMollieClient();
    if (!mollie) {
      await abandonOrder();
      return {
        ok: false,
        error: "Betalingsprovider niet geconfigureerd.",
        reason: "mollie_unavailable",
      };
    }

    // Eén Mollie-klant per profiel (profiles.mollie_customer_id), niet
    // meer afgeleid uit de laatste membership-rij.
    let mollieCustomerId: string | null = profile.mollie_customer_id ?? null;
    if (!mollieCustomerId) {
      const customer = await mollie.customers.create({
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        email: user.email,
        metadata: { profile_id: user.id },
      });
      mollieCustomerId = customer.id;
      await admin
        .from("profiles")
        .update({ mollie_customer_id: mollieCustomerId })
        .eq("id", user.id);
    }

    // Subscription: sequenceType 'first' captureert het SEPA-mandaat samen
    // met de eerste betaling. Product: gewone oneoff-betaling, geen mandaat.
    const amountValue = (firstChargeCents / 100).toFixed(2);
    // Redirect na Mollie-checkout: subscriptions blijven op de bestaande
    // bedankt-pagina (ongewijzigd gedrag); een product-order landt op Mijn
    // tegoed, waar het nieuwe saldo verschijnt zodra de webhook
    // activate_order heeft laten lopen. isSubscription is al hierboven
    // berekend uit orderResult.recurring_cents (WS-2), geen nieuw veld.
    const redirectUrl = isSubscription
      ? `${siteUrl()}/app/abonnement/bedankt?order=${orderId}`
      : `${siteUrl()}/app/producten?tab=tegoed`;
    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value: amountValue },
      description: `The Movement Club | ${selection.slug}`,
      redirectUrl,
      webhookUrl: mollieWebhookUrl(),
      customerId: mollieCustomerId,
      ...(isSubscription ? { sequenceType: SequenceType.first } : {}),
      metadata: {
        type: "order",
        orderId,
        profileId: user.id,
      },
      idempotencyKey: `order-${orderId}-p1`,
    });

    // Koppel payment aan order (guarded: alleen vanuit draft) + log payment.
    await admin
      .from("orders")
      .update({
        status: "pending",
        mollie_payment_id: payment.id,
        mollie_customer_id: mollieCustomerId,
      })
      .eq("id", orderId)
      .eq("status", "draft");
    await admin.from("payments").insert({
      mollie_payment_id: payment.id,
      profile_id: user.id,
      order_id: orderId,
      amount_cents: firstChargeCents,
      status: "open",
      description: `Order ${orderId} — ${selection.slug}`,
    });

    await emitEvent({
      type: "order.created",
      actorType: "member",
      actorId: user.id,
      subjectType: "order",
      subjectId: orderId,
      payload: {
        profile_id: user.id,
        order_id: orderId,
        slug: selection.slug,
        first_charge_cents: firstChargeCents,
        early_member: orderResult.early_member,
      },
    });

    const checkoutUrl = payment.getCheckoutUrl();
    if (!checkoutUrl) {
      await abandonOrder();
      return {
        ok: false,
        error: "Kon betaallink niet genereren.",
        reason: "checkout_url_missing",
      };
    }
    return { ok: true, checkoutUrl, amountCents: firstChargeCents };
  } catch (e) {
    console.error("[createOrderAndCheckout]", e);
    await abandonOrder();
    return {
      ok: false,
      error: "Er ging iets mis. Probeer opnieuw.",
      reason: "unexpected_error",
    };
  }
}
