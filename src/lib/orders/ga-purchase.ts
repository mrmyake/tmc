import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPurchasePayload, isProductionEnv } from "@/lib/ga-mp/core";
import { postMpEvent, readAdConsent, type MpSendDeps, type MpSendResult } from "@/lib/ga-mp/send";

const LABEL = "sendPurchaseToGa4";

export interface PurchaseDeps extends MpSendDeps {
  admin?: SupabaseClient;
  isProduction?: boolean;
}

/**
 * Conversiebrug (spec-analytics.md, spec-conversiemeting.md): een
 * server-side GA4 `purchase` per geactiveerde order, via het Measurement
 * Protocol.
 *
 * Deze functie throwt NOOIT. Ze wordt ge-awaited binnen de naloop van de
 * activatieketen (activation-chain.ts), die de webhook via after() na de
 * respons draait: de betaalverwerking is dan al klaar, en zonder await kan
 * Vercel de functie bevriezen terwijl het verzoek nog loopt. Een GA4-storing
 * kost hooguit de timeout van vijf seconden in de naloop.
 *
 * Exactly-once komt niet uit deze helper maar uit de call-site: de
 * `!activation.already_activated`-tak, gegarandeerd door de rijlock en de
 * statusovergang in tmc.activate_order. Hier bewust geen eigen dedupe:
 * at-most-once is het geaccepteerde compromis.
 *
 * Geen `user_id` op het event (spec-analytics.md).
 *
 * `value` komt uitsluitend uit amountCents: het bedrag dat Mollie
 * daadwerkelijk verwerkte. Niets wordt herberekend; first_charge_cents dient
 * alleen als controle. items[0] krijgt item_name en item_category uit
 * tmc.catalogue; is die rij niet te lezen, dan gaat alleen item_id mee.
 *
 * ad_consent wordt met een eigen select gelezen (readAdConsent): ontbreekt
 * de kolom nog, dan is het "unknown" (telt als denied) en gaat het event
 * gewoon door.
 *
 * Het resultaat is alleen voor tests en logging; productiecode negeert het.
 */
export async function sendPurchaseToGa4(
  args: { orderId: string; amountCents: number },
  deps: PurchaseDeps = {},
): Promise<MpSendResult> {
  try {
    const apiSecret = "apiSecret" in deps ? deps.apiSecret : process.env.GA4_API_SECRET;
    if (!apiSecret) {
      // Config ontbreekt (bv. lokale dev): stil overslaan, nooit falen.
      console.warn(`[${LABEL}] GA4_API_SECRET ontbreekt, overgeslagen`);
      return "skipped";
    }

    const admin = deps.admin ?? createAdminClient();
    const { data: order, error } = await admin
      .from("orders")
      .select("catalogue_slug, ga_client_id, ga_session_id, first_charge_cents")
      .eq("id", args.orderId)
      .maybeSingle();
    if (error || !order) {
      console.error(`[${LABEL}] order read failed`, args.orderId, error);
      return "failed";
    }

    if (!order.ga_client_id) {
      // Normale situatie, geen fout: member-app-aankoop (/app/producten),
      // admin-betaallink (/betaal/<token>) of consent denied. Geen sessie
      // om aan toe te rekenen, dus geen event.
      return "skipped";
    }

    if (order.first_charge_cents !== args.amountCents) {
      // Alleen signaleren; value blijft het door Mollie verwerkte bedrag.
      console.warn(
        `[${LABEL}] bedrag wijkt af van first_charge_cents: order=${args.orderId} mollie=${args.amountCents} first_charge=${order.first_charge_cents}`,
      );
    }

    const adConsent = await readAdConsent(admin, "orders", args.orderId, LABEL);
    const catalogue = await readCatalogueItem(admin, order.catalogue_slug);

    const payload = buildPurchasePayload({
      orderId: args.orderId,
      amountCents: args.amountCents,
      clientId: order.ga_client_id,
      sessionId: order.ga_session_id,
      adConsent,
      catalogueSlug: order.catalogue_slug,
      catalogue,
      isProduction: deps.isProduction ?? isProductionEnv(),
    });
    if (!payload) return "skipped";

    return await postMpEvent(payload, LABEL, `order ${args.orderId}`, {
      apiSecret,
      fetchImpl: deps.fetchImpl,
    });
  } catch (e) {
    console.error(`[${LABEL}] skipped`, e);
    return "failed";
  }
}

/** Naam en omzetcategorie uit tmc.catalogue; null als de rij niet te lezen is. */
async function readCatalogueItem(
  admin: SupabaseClient,
  slug: string,
): Promise<{ display_name: string | null; revenue_category: string | null } | null> {
  try {
    const { data, error } = await admin
      .from("catalogue")
      .select("display_name, revenue_category")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) {
      console.error(`[${LABEL}] catalogue read failed`, slug, error);
      return null;
    }
    return data as { display_name: string | null; revenue_category: string | null };
  } catch (e) {
    console.error(`[${LABEL}] catalogue read threw`, slug, e);
    return null;
  }
}
