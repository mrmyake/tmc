import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";
const MP_ENDPOINT = "https://www.google-analytics.com/mp/collect";

/**
 * Conversiebrug (spec-analytics.md): één server-side GA4 `purchase` per
 * geactiveerde order, via het Measurement Protocol.
 *
 * Contract identiek aan notifyMemberPaymentFailed in de Mollie-webhook:
 * deze functie throwt NOOIT en wordt fire-and-forget aangeroepen
 * (`void sendPurchaseToGa4(...).catch(...)`), buiten het idempotentiepad.
 * Een GA4-storing mag geen betaling laten hangen; een gemiste meting is
 * een rapportageprobleem, een gemiste order-activatie een klantprobleem.
 *
 * Exactly-once komt niet uit deze helper maar uit de call-site: de
 * `!activation.already_activated`-tak van de webhook, gegarandeerd door de
 * rijlock + statusovergang in tmc.activate_order. Hier bewust geen eigen
 * dedupe-machinerie — at-most-once (een crash tussen activatie en dit
 * verzoek verliest het event; Mollie's retry ziet already_activated en
 * vuurt terecht niet opnieuw) is het geaccepteerde compromis.
 *
 * Geen `user_id` op het event — bewuste beslissing conform
 * spec-analytics.md ("GA4 user_id — verwijderd"); cohortanalyse hoort op
 * tmc.events, waar de profile_id al staat.
 *
 * `value` komt uitsluitend uit amountCents: het bedrag dat Mollie
 * daadwerkelijk verwerkte (webhook, uit payment.amount.value). Niets wordt
 * herberekend; first_charge_cents dient alleen als controle en levert bij
 * afwijking uitsluitend een log-regel op.
 */
export async function sendPurchaseToGa4(args: {
  orderId: string;
  amountCents: number;
}): Promise<void> {
  try {
    const apiSecret = process.env.GA4_API_SECRET;
    if (!apiSecret) {
      // Config ontbreekt (bv. lokale dev): stil overslaan, nooit falen.
      console.warn("[sendPurchaseToGa4] GA4_API_SECRET ontbreekt — overgeslagen");
      return;
    }

    const admin = createAdminClient();
    const { data: order, error } = await admin
      .from("orders")
      .select("catalogue_slug, ga_client_id, ga_session_id, first_charge_cents")
      .eq("id", args.orderId)
      .maybeSingle();
    if (error || !order) {
      console.error("[sendPurchaseToGa4] order read failed", args.orderId, error);
      return;
    }

    if (!order.ga_client_id) {
      // Normale situatie, geen fout: member-app-aankoop (/app/producten),
      // admin-betaallink (/betaal/<token>) of consent denied. Geen sessie
      // om aan toe te rekenen → geen event.
      return;
    }

    if (order.first_charge_cents !== args.amountCents) {
      // Alleen signaleren; value blijft het door Mollie verwerkte bedrag.
      console.warn(
        `[sendPurchaseToGa4] bedrag wijkt af van first_charge_cents: order=${args.orderId} mollie=${args.amountCents} first_charge=${order.first_charge_cents}`,
      );
    }

    const body = {
      client_id: order.ga_client_id,
      events: [
        {
          name: "purchase",
          params: {
            ...(order.ga_session_id ? { session_id: order.ga_session_id } : {}),
            transaction_id: args.orderId,
            currency: "EUR",
            value: args.amountCents / 100,
            items: [{ item_id: order.catalogue_slug, quantity: 1 }],
          },
        },
      ],
    };

    // Let op: de URL bevat het api_secret — nooit de URL of de respons-body
    // loggen, alleen status en order-id.
    const res = await fetch(
      `${MP_ENDPOINT}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      console.error(
        `[sendPurchaseToGa4] MP-status ${res.status} voor order ${args.orderId}`,
      );
    }
  } catch (e) {
    console.error("[sendPurchaseToGa4] skipped", e);
  }
}
