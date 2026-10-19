import "server-only";
import type { MollieClient } from "@mollie/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { notifyMemberPaymentFailed } from "@/lib/payments/payment-failed-notify";
import {
  syncChargebackMirror,
  type ChargebackDeps,
  type ChargebackLike,
  type ChargebackOutcome,
  type ChargebackPaymentRow,
  type ChargebackPaymentView,
} from "./core";

/**
 * Wiring van de chargeback-spiegel op de echte service-role-client, Mollie
 * en ntfy. Aangeroepen door beide webhookroutes direct na hun
 * payments-write. Throwt nooit: een fout in de spiegel mag de verwerking
 * van de betaling zelf niet raken; de uitkomst is dan null met een log.
 */

/** Kolommen die de webhooks na hun write terugvragen en hier binnenbrengen. */
export const CHARGEBACK_ROW_SELECT =
  "id, mollie_payment_id, amount_cents, charged_back_amount_cents, profile_id, membership_id, order_id, pt_booking_id, trial_booking_id, kind, description, is_test";

export interface ChargebackRowDb {
  id: string;
  mollie_payment_id: string;
  amount_cents: number;
  charged_back_amount_cents: number;
  profile_id: string | null;
  membership_id: string | null;
  order_id: string | null;
  pt_booking_id: string | null;
  trial_booking_id: string | null;
  kind: string | null;
  description: string | null;
  is_test: boolean;
}

export function chargebackRowFromDb(row: ChargebackRowDb): ChargebackPaymentRow {
  return {
    id: row.id,
    molliePaymentId: row.mollie_payment_id,
    amountCents: row.amount_cents,
    chargedBackAmountCents: row.charged_back_amount_cents ?? 0,
    profileId: row.profile_id,
    membershipId: row.membership_id,
    orderId: row.order_id,
    ptBookingId: row.pt_booking_id,
    trialBookingId: row.trial_booking_id,
    kind: row.kind,
    description: row.description,
    isTest: Boolean(row.is_test),
  };
}

function mapChargeback(c: {
  id: string;
  amount: { value: string };
  reason?: { code?: string; description?: string } | null;
  createdAt: string;
  reversedAt?: string | null;
}): ChargebackLike {
  return {
    id: c.id,
    amountCents: Math.round(parseFloat(c.amount.value) * 100),
    reasonCode: c.reason?.code ?? null,
    reasonDescription: c.reason?.description ?? null,
    createdAt: c.createdAt,
    reversedAt: c.reversedAt ?? null,
  };
}

function buildDeps(mollie: MollieClient): ChargebackDeps {
  const admin = createAdminClient();
  return {
    async mirror({ paymentRowId, previousCents, nextCents, chargedBackAt }) {
      const { data, error } = await admin
        .from("payments")
        .update({ charged_back_amount_cents: nextCents, charged_back_at: chargedBackAt })
        .eq("id", paymentRowId)
        .eq("charged_back_amount_cents", previousCents)
        .select("id");
      if (error) {
        console.error("[chargebacks] mirror write failed", { paymentRowId, previousCents, nextCents }, error);
        return false;
      }
      return (data?.length ?? 0) > 0;
    },
    async fetchChargebacks(molliePaymentId) {
      try {
        const page = await mollie.paymentChargebacks.page({ paymentId: molliePaymentId });
        return Array.from(page).map((c) => mapChargeback(c));
      } catch (err) {
        console.error("[chargebacks] paymentChargebacks.page failed", { molliePaymentId }, err);
        return [];
      }
    },
    async findMembership({ subscriptionId, membershipId, orderId }) {
      const select = "id, status, profile_id, plan_variant";
      let data: { id: string; status: string; profile_id: string; plan_variant: string | null } | null = null;
      if (subscriptionId) {
        const res = await admin.from("memberships").select(select).eq("mollie_subscription_id", subscriptionId).maybeSingle();
        data = res.data;
      }
      if (!data && membershipId) {
        const res = await admin.from("memberships").select(select).eq("id", membershipId).maybeSingle();
        data = res.data;
      }
      if (!data && orderId) {
        const { data: order } = await admin.from("orders").select("membership_id").eq("id", orderId).maybeSingle();
        if (order?.membership_id) {
          const res = await admin.from("memberships").select(select).eq("id", order.membership_id).maybeSingle();
          data = res.data;
        }
      }
      if (!data) return null;
      return { id: data.id, status: data.status, profileId: data.profile_id, planVariant: data.plan_variant };
    },
    async setMembershipStatus({ membershipId, from, to }) {
      const { data, error } = await admin
        .from("memberships")
        .update({ status: to })
        .eq("id", membershipId)
        .eq("status", from)
        .select("id");
      if (error) {
        console.error("[chargebacks] membership status write failed", { membershipId, from, to }, error);
        return false;
      }
      return (data?.length ?? 0) > 0;
    },
    async lastPaymentFailedCause(membershipId) {
      const { data } = await admin
        .from("events")
        .select("payload")
        .eq("type", "membership.payment_failed")
        .eq("subject_id", membershipId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const p = (data.payload ?? {}) as Record<string, unknown>;
      return {
        reason: typeof p.reason === "string" ? p.reason : null,
        chargebackId: typeof p.chargeback_id === "string" ? p.chargeback_id : null,
        paymentId: typeof p.payment_id === "string" ? p.payment_id : null,
      };
    },
    emit(event) {
      return emitEvent({
        type: event.type,
        actorType: "system",
        actorId: null,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        payload: event.payload,
      });
    },
    notifyStaff(title, message, tags) {
      return sendNotification(title, message, tags);
    },
    notifyMember(args) {
      return notifyMemberPaymentFailed(args);
    },
    now: () => new Date(),
  };
}

export async function syncPaymentChargebacksFromMollie(args: {
  mollie: MollieClient;
  row: ChargebackRowDb;
  view: ChargebackPaymentView;
}): Promise<ChargebackOutcome | null> {
  try {
    return await syncChargebackMirror(buildDeps(args.mollie), chargebackRowFromDb(args.row), args.view);
  } catch (err) {
    console.error("[chargebacks] sync threw", { molliePaymentId: args.row.mollie_payment_id }, err);
    return null;
  }
}
