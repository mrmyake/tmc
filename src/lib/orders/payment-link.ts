"use server";

import { SequenceType } from "@mollie/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { siteUrl, mollieWebhookUrl } from "@/lib/site-url";
import {
  startCheckoutCore,
  type PaymentLinkCheckoutResult,
  type PaymentLinkDeps,
  type PaymentLinkOrder,
  type PaymentLinkProfile,
} from "./payment-link-core";

/**
 * Publieke server action achter /betaal/[token]: valideert het token
 * (de enige poort, geen login) en start of hervat de Mollie-checkout.
 * Alle logica en de dubbele-betaling-invariant zitten in
 * payment-link-core.ts; dit bestand bindt alleen de echte clients.
 */
export async function startPaymentLinkCheckout(
  token: string,
): Promise<PaymentLinkCheckoutResult> {
  const mollie = getMollieClient();
  if (!mollie) {
    console.error("[payment-link] Mollie niet geconfigureerd");
    return { ok: false, reason: "try_again" };
  }
  const admin = createAdminClient();

  const deps: PaymentLinkDeps = {
    db: {
      async getOrderByToken(t) {
        const { data } = await admin
          .from("orders")
          .select(
            "id, profile_id, kind, catalogue_slug, status, expires_at, first_charge_cents, mollie_payment_id, mollie_customer_id",
          )
          .eq("token", t)
          .maybeSingle();
        return (data as PaymentLinkOrder | null) ?? null;
      },
      async getProfile(profileId) {
        const { data } = await admin
          .from("profiles")
          .select("first_name, last_name, email, mollie_customer_id")
          .eq("id", profileId)
          .maybeSingle();
        return (data as PaymentLinkProfile | null) ?? null;
      },
      async saveMollieCustomerId(profileId, customerId) {
        await admin
          .from("profiles")
          .update({ mollie_customer_id: customerId })
          .eq("id", profileId);
      },
      async countPaymentsForOrder(orderId) {
        const { count } = await admin
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("order_id", orderId);
        return count ?? 0;
      },
      async markOrderPending(orderId, molliePaymentId, mollieCustomerId) {
        const { data } = await admin
          .from("orders")
          .update({
            status: "pending",
            mollie_payment_id: molliePaymentId,
            mollie_customer_id: mollieCustomerId,
          })
          .eq("id", orderId)
          .in("status", ["draft", "pending"])
          .select("id");
        return (data?.length ?? 0) > 0;
      },
      async getOrderStatus(orderId) {
        const { data } = await admin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .maybeSingle();
        return data?.status ?? null;
      },
      async upsertPaymentRow(row) {
        await admin
          .from("payments")
          .upsert(row, { onConflict: "mollie_payment_id" });
      },
    },
    mollie: {
      async getPayment(paymentId) {
        const p = await mollie.payments.get(paymentId);
        return { id: p.id, status: p.status, checkoutUrl: p.getCheckoutUrl() };
      },
      async createCustomer({ name, email, profileId }) {
        const customer = await mollie.customers.create({
          name,
          email,
          metadata: { profile_id: profileId },
        });
        return customer.id;
      },
      async createPayment(args) {
        const p = await mollie.payments.create({
          amount: { currency: "EUR", value: args.amountValue },
          description: args.description,
          redirectUrl: args.redirectUrl,
          webhookUrl: args.webhookUrl,
          customerId: args.customerId,
          ...(args.isSubscription
            ? { sequenceType: SequenceType.first }
            : {}),
          metadata: {
            type: "order",
            orderId: args.orderId,
            profileId: args.profileId,
          },
          idempotencyKey: args.idempotencyKey,
        });
        return { id: p.id, status: p.status, checkoutUrl: p.getCheckoutUrl() };
      },
    },
    urls: { site: siteUrl(), webhook: mollieWebhookUrl() },
  };

  try {
    return await startCheckoutCore(deps, token);
  } catch (e) {
    console.error("[startPaymentLinkCheckout]", e);
    return { ok: false, reason: "try_again" };
  }
}
