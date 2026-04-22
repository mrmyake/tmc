import { NextResponse } from "next/server";
import { SequenceType } from "@mollie/api-client";
import { getMollieClient } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/ntfy";
import { sendEmail } from "@/lib/email";
import PaymentFailed from "@/emails/payment_failed";
import { formatEuro } from "@/lib/crowdfunding-helpers";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

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
 *  - payment.paid + sequenceType=first   → activeer membership + Mollie
 *    subscription aanmaken voor recurring
 *  - payment.paid + sequenceType=recurring → log payment
 *  - payment.failed/expired/canceled     → status='payment_failed',
 *    ntfy admin
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
    const profileId =
      typeof meta.profileId === "string" ? meta.profileId : undefined;
    const type = typeof meta.type === "string" ? meta.type : undefined;

    // Upsert payment-regel — idempotent, log van wat Mollie heeft.
    await supabase.from("payments").upsert(
      {
        mollie_payment_id: payment.id,
        membership_id: membershipId ?? null,
        pt_booking_id: ptBookingId ?? null,
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
      }
      return NextResponse.json({ ok: true });
    }

    // First payment → activeer membership + maak subscription
    if (
      payment.sequenceType === SequenceType.first &&
      type === "first_payment" &&
      membershipId
    ) {
      const { data: membership } = await supabase
        .from("memberships")
        .select(
          "id,status,price_per_cycle_cents,billing_cycle_weeks,plan_variant,mollie_customer_id,mollie_subscription_id"
        )
        .eq("id", membershipId)
        .maybeSingle();

      if (!membership) {
        console.warn("[mollie/webhook] membership not found", membershipId);
        return NextResponse.json({ ok: true });
      }

      // Status bijwerken bij elke transitie
      if (payment.status === "paid" && membership.status !== "active") {
        const startDate = new Date().toISOString().split("T")[0];
        await supabase
          .from("memberships")
          .update({
            status: "active",
            start_date: startDate,
            registration_fee_paid: true,
          })
          .eq("id", membership.id);

        // Maak Mollie subscription (alleen plan-prijs, zonder inschrijfkosten)
        if (!membership.mollie_subscription_id && membership.mollie_customer_id) {
          try {
            const subStart = new Date();
            subStart.setDate(
              subStart.getDate() + membership.billing_cycle_weeks * 7
            );
            const startDateISO = subStart.toISOString().split("T")[0];

            const siteUrl =
              process.env.NEXT_PUBLIC_SITE_URL ||
              "https://themovementclub.nl";

            const subscription = await mollie.customerSubscriptions.create({
              customerId: membership.mollie_customer_id,
              amount: {
                currency: "EUR",
                value: (membership.price_per_cycle_cents / 100).toFixed(2),
              },
              interval: "28 days",
              description: `TMC ${membership.plan_variant}`,
              startDate: startDateISO,
              webhookUrl: `${siteUrl}/api/mollie/webhook`,
              metadata: {
                membershipId: membership.id,
                type: "recurring",
              },
            });

            await supabase
              .from("memberships")
              .update({ mollie_subscription_id: subscription.id })
              .eq("id", membership.id);
          } catch (e) {
            console.error(
              "[mollie/webhook] subscription create failed",
              e
            );
            // Membership is active, maar subscription mislukt — admin moet
            // handmatig afronden. ntfy hieronder.
          }
        }

        await sendNotification(
          "Nieuw abonnement!",
          `Membership ${membership.id} (${membership.plan_variant}) geactiveerd. €${(Math.round(parseFloat(payment.amount.value) * 100) / 100).toFixed(2)} ontvangen.`,
          "tada,moneybag"
        );
      } else if (
        ["failed", "expired", "canceled"].includes(payment.status) &&
        membership.status === "pending"
      ) {
        await supabase
          .from("memberships")
          .update({ status: "payment_failed" })
          .eq("id", membership.id);
        await sendNotification(
          "Aanmelding gefaald",
          `Membership ${membership.id} (${membership.plan_variant}) — eerste betaling ${payment.status}.`,
          "warning"
        );
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
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /api/mollie/webhook]", e);
    return NextResponse.json({ ok: true });
  }
}
