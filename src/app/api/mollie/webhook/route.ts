import { NextResponse } from "next/server";
import { SequenceType } from "@mollie/api-client";
import { getMollieClient } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import PaymentFailed from "@/emails/payment_failed";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import { siteUrl, mollieWebhookUrl } from "@/lib/site-url";

/** Fire-and-forget payment-failed email. Never throws. */
async function notifyMemberPaymentFailed(args: {
  profileId: string;
  amountCents: number;
  planLabel: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", args.profileId)
      .maybeSingle();
    if (!profile?.email) return;
    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: "Incasso niet gelukt",
      react: PaymentFailed({
        firstName: profile.first_name ?? "",
        amountEuro: formatEuro(Math.round(args.amountCents / 100)),
        planLabel: args.planLabel,
        siteUrl: siteUrl(),
      }),
    });

    // Los kanaal naast de e-mail — geldzaken verdienen een directe melding
    // i.p.v. te wachten tot iemand zijn mail checkt.
    void sendPushToProfile(args.profileId, {
      title: "Incasso niet gelukt",
      body: `${formatEuro(Math.round(args.amountCents / 100))} voor ${args.planLabel} kon niet worden afgeschreven.`,
      data: { type: "payment_failed" },
    });
  } catch (err) {
    console.error("[notifyMemberPaymentFailed] skipped", err);
  }
}

/**
 * Mollie webhook voor het member-system. Ontvangt payment-id's via form
 * encoded body. Apart van /api/crowdfunding/webhook omdat die al een
 * eigen flow heeft.
 *
 * Handled:
 *  - payment.paid + sequenceType=first + metadata.type='order' → de order
 *    pipeline (WS-2): tmc.activate_order() (service-role only, idempotent
 *    onder een rijlock) activeert de order, daarna bij een subscription-
 *    order de Mollie-subscription voor recurring.
 *  - payment.paid + sequenceType=recurring → log payment, reactiveer bij
 *    een eerder mislukte incasso
 *  - payment.failed/expired/canceled op recurring → status='payment_failed',
 *    ntfy + e-mail naar het lid
 *  - metadata.type='pt_booking' → ongewijzigd (nog niet op de order-pipeline)
 *
 * Altijd 2xx terug richting Mollie, ook bij onbekende payloads — anders
 * blijft Mollie retrying en spammen we onszelf.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const paymentId = String(formData.get("id") ?? "");
    if (!paymentId) {
      return NextResponse.json({ ok: true });
    }

    const mollie = getMollieClient();
    const supabase = createAdminClient();
    if (!mollie) {
      console.error("[mollie/webhook] mollie not configured");
      return NextResponse.json({ ok: true });
    }

    const payment = await mollie.payments.get(paymentId);
    const meta = (payment.metadata ?? {}) as Record<string, unknown>;
    const membershipId =
      typeof meta.membershipId === "string" ? meta.membershipId : undefined;
    const ptBookingId =
      typeof meta.ptBookingId === "string" ? meta.ptBookingId : undefined;
    const orderId =
      typeof meta.orderId === "string" ? meta.orderId : undefined;
    const profileId =
      typeof meta.profileId === "string" ? meta.profileId : undefined;
    const type = typeof meta.type === "string" ? meta.type : undefined;

    // Upsert payment-regel — idempotent, log van wat Mollie heeft.
    await supabase.from("payments").upsert(
      {
        mollie_payment_id: payment.id,
        membership_id: membershipId ?? null,
        pt_booking_id: ptBookingId ?? null,
        order_id: orderId ?? null,
        profile_id: profileId ?? null,
        amount_cents: Math.round(parseFloat(payment.amount.value) * 100),
        status: payment.status,
        method: payment.method ?? null,
        description: payment.description ?? null,
        paid_at: payment.paidAt ?? null,
        mollie_subscription_id: payment.subscriptionId ?? null,
      },
      { onConflict: "mollie_payment_id" }
    );

    // Money-fact events. dedupe_key = Mollie payment-id op een vaste plek in de
    // payload; webhook-retries kunnen dit event dubbel vuren, dedupe-bij-lezen
    // op payload.dedupe_key. Alleen terminale statussen vuren.
    const amountCents = Math.round(parseFloat(payment.amount.value) * 100);
    if (payment.status === "paid") {
      await emitEvent({
        type: "payment.received",
        actorType: "system",
        subjectType: "payment",
        subjectId: null,
        payload: {
          dedupe_key: payment.id,
          payment_id: payment.id,
          profile_id: profileId ?? null,
          membership_id: membershipId ?? null,
          pt_booking_id: ptBookingId ?? null,
          order_id: orderId ?? null,
          amount_cents: amountCents,
          sequence: payment.sequenceType ?? null,
        },
      });
    } else if (["failed", "expired", "canceled"].includes(payment.status)) {
      await emitEvent({
        type: "payment.failed",
        actorType: "system",
        subjectType: "payment",
        subjectId: null,
        payload: {
          dedupe_key: payment.id,
          payment_id: payment.id,
          profile_id: profileId ?? null,
          membership_id: membershipId ?? null,
          pt_booking_id: ptBookingId ?? null,
          order_id: orderId ?? null,
          amount_cents: amountCents,
          status: payment.status,
          sequence: payment.sequenceType ?? null,
        },
      });
    }

    // PT booking payment — flip pt_booking status + set intake discount flag
    if (type === "pt_booking" && ptBookingId) {
      if (payment.status === "paid") {
        const { data: booking } = await supabase
          .from("pt_bookings")
          .select("id, profile_id, is_intake_discount")
          .eq("id", ptBookingId)
          .maybeSingle();
        if (booking) {
          await supabase
            .from("pt_bookings")
            .update({ status: "booked" })
            .eq("id", ptBookingId);
          if (booking.is_intake_discount) {
            await supabase
              .from("profiles")
              .update({ has_used_pt_intake_discount: true })
              .eq("id", booking.profile_id);
          }
          await sendNotification(
            "Nieuwe PT-boeking",
            `PT sessie betaald. Booking ${ptBookingId}, €${(Math.round(parseFloat(payment.amount.value) * 100) / 100).toFixed(2)}.`,
            "tada",
          );
          await emitEvent({
            type: "pt_booking.confirmed",
            actorType: "system",
            subjectType: "pt_booking",
            subjectId: ptBookingId,
            payload: {
              profile_id: booking.profile_id,
              pt_booking_id: ptBookingId,
              payment_id: payment.id,
              amount_cents: amountCents,
            },
          });
        }
      } else if (
        ["failed", "expired", "canceled"].includes(payment.status)
      ) {
        // Betaling mislukt — zet de booking op cancelled zodat slot vrijkomt.
        await supabase
          .from("pt_bookings")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
          })
          .eq("id", ptBookingId);
        await emitEvent({
          type: "pt_booking.cancelled",
          actorType: "system",
          subjectType: "pt_booking",
          subjectId: ptBookingId,
          payload: {
            profile_id: profileId ?? null,
            pt_booking_id: ptBookingId,
            payment_id: payment.id,
          },
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Order pipeline: first payment → activate_order (service-role only,
    // idempotent onder een rijlock in tmc.activate_order()). Alleen
    // aangeroepen op status 'paid': op failed/expired/canceled blijft de
    // order gewoon 'pending' staan (opnieuw betaalbaar tot expires_at,
    // zie ws2-order-pipeline-design.md §4), geen statuswijziging nodig.
    if (
      payment.sequenceType === SequenceType.first &&
      type === "order" &&
      orderId
    ) {
      if (payment.status !== "paid") {
        await sendNotification(
          "Eerste betaling niet gelukt",
          `Order ${orderId} — eerste betaling ${payment.status}. Blijft openstaand tot de order verloopt; de klant kan het opnieuw proberen.`,
          "warning"
        );
        return NextResponse.json({ ok: true });
      }

      const { data: activation, error: activateErr } = await supabase.rpc(
        "activate_order",
        { p_order_id: orderId, p_mollie_payment_id: payment.id }
      );

      if (activateErr || !activation) {
        console.error("[mollie/webhook] activate_order failed", activateErr);
        await sendNotification(
          "Order-activatie gefaald",
          `Order ${orderId}: activate_order gaf een fout terug. Betaling is binnen — handmatig naklopen.`,
          "warning"
        );
        return NextResponse.json({ ok: true });
      }

      if (!activation.ok) {
        // blocked_duplicate_membership = conditie 2: geld binnen, geen
        // membership aangemaakt omdat het profiel er via een andere order
        // al één heeft. orders.blocked_reason markeert de rij persistent
        // (ops kan hem terugvinden); deze alert is het directe signaal —
        // geen stille 'paid'-rij. order_not_found / payment_order_mismatch
        // / invalid_status zijn onverwacht en vragen ook om een mens.
        const isDuplicate = activation.reason === "blocked_duplicate_membership";
        await sendNotification(
          isDuplicate ? "Order betaald maar geblokkeerd" : "Order-activatie geweigerd",
          `Order ${orderId} → ${activation.reason}.${
            isDuplicate
              ? " Betaling is binnen zonder nieuw membership — refund of tegoed regelen."
              : " Handmatig naklopen."
          }`,
          "warning"
        );
        return NextResponse.json({ ok: true });
      }

      if (activation.late_payment) {
        await sendNotification(
          "Order geactiveerd na verlopen deadline",
          `Order ${orderId}: betaling kwam binnen na expires_at maar is gehonoreerd.`,
          "warning"
        );
      }

      if (!activation.already_activated) {
        await sendNotification(
          "Nieuw abonnement!",
          `Order ${orderId} geactiveerd (membership ${activation.membership_id}). €${(amountCents / 100).toFixed(2)} ontvangen.`,
          "tada,moneybag"
        );
        await emitEvent({
          type: "order.activated",
          actorType: "system",
          subjectType: "order",
          subjectId: orderId,
          payload: {
            profile_id: profileId ?? null,
            order_id: orderId,
            membership_id: activation.membership_id,
            payment_id: payment.id,
          },
        });
      }

      // Subscription-order: maak de Mollie-subscription één cyclus na de
      // eerste betaling. idempotencyKey + de unique constraint op
      // memberships.mollie_subscription_id voorkomen een dubbele
      // subscription bij een webhook-retry; needs_subscription is ook
      // true op een already_activated-retry waarvan het eerdere
      // subscription-aanmaken mislukte, dus dit is meteen het herstelpad.
      if (activation.needs_subscription && activation.mollie_customer_id) {
        try {
          const subStart = new Date();
          subStart.setDate(
            subStart.getDate() + activation.billing_cycle_weeks * 7
          );
          const startDateISO = subStart.toISOString().split("T")[0];

          const subscription = await mollie.customerSubscriptions.create({
            customerId: activation.mollie_customer_id,
            amount: {
              currency: "EUR",
              value: (activation.recurring_cents / 100).toFixed(2),
            },
            interval: "28 days",
            description: `TMC order ${orderId}`,
            startDate: startDateISO,
            webhookUrl: mollieWebhookUrl(),
            metadata: {
              membershipId: activation.membership_id,
              type: "recurring",
            },
            idempotencyKey: `order-${orderId}-sub`,
          });

          await supabase
            .from("memberships")
            .update({ mollie_subscription_id: subscription.id })
            .eq("id", activation.membership_id)
            .is("mollie_subscription_id", null);
        } catch (e) {
          console.error("[mollie/webhook] subscription create failed", e);
          await sendNotification(
            "Subscription aanmaken mislukt",
            `Membership ${activation.membership_id} is actief, maar de Mollie-subscription kon niet aangemaakt worden. De volgende webhook-retry probeert dit opnieuw; anders handmatig afronden.`,
            "warning"
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Recurring payment (via subscription)
    if (
      payment.sequenceType === SequenceType.recurring &&
      payment.subscriptionId
    ) {
      const { data: membership } = await supabase
        .from("memberships")
        .select("id,status,profile_id,plan_variant")
        .eq("mollie_subscription_id", payment.subscriptionId)
        .maybeSingle();

      if (!membership) {
        // Unknown subscription — ignore but log
        console.warn(
          "[mollie/webhook] unknown subscription",
          payment.subscriptionId
        );
        return NextResponse.json({ ok: true });
      }

      // Payment row al geüpsert boven; hier alleen status-shifts op de
      // membership zelf afhandelen.
      if (payment.status === "paid") {
        // Payment goed: als status was payment_failed, terug naar active
        if (membership.status === "payment_failed") {
          await supabase
            .from("memberships")
            .update({ status: "active" })
            .eq("id", membership.id);
          await emitEvent({
            type: "membership.reactivated",
            actorType: "system",
            subjectType: "membership",
            subjectId: membership.id,
            payload: {
              profile_id: membership.profile_id,
              membership_id: membership.id,
              payment_id: payment.id,
            },
          });
        }
        // profile_id op payment-rij vullen (was mogelijk null)
        await supabase
          .from("payments")
          .update({ profile_id: membership.profile_id })
          .eq("mollie_payment_id", payment.id);
      } else if (["failed", "expired", "canceled"].includes(payment.status)) {
        if (membership.status === "active") {
          await supabase
            .from("memberships")
            .update({ status: "payment_failed" })
            .eq("id", membership.id);
          await sendNotification(
            "Incasso gefaald",
            `Membership ${membership.id} (${membership.plan_variant}) — recurring ${payment.status}.`,
            "warning"
          );
          // Fire-and-forget member email.
          void notifyMemberPaymentFailed({
            profileId: membership.profile_id,
            amountCents: Math.round(Number(payment.amount?.value ?? "0") * 100),
            planLabel: membership.plan_variant ?? "abonnement",
          });
          await emitEvent({
            type: "membership.payment_failed",
            actorType: "system",
            subjectType: "membership",
            subjectId: membership.id,
            payload: {
              profile_id: membership.profile_id,
              membership_id: membership.id,
              payment_id: payment.id,
              sequence: "recurring",
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /api/mollie/webhook]", e);
    return NextResponse.json({ ok: true });
  }
}
