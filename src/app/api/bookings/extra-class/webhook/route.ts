import { NextResponse } from "next/server";
import { SequenceType } from "@mollie/api-client";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { writePaymentWithTransition } from "@/lib/payments/payment-write-core";
import { syncPaymentRefundsFromMollie } from "@/lib/refunds/process";
import {
  CHARGEBACK_ROW_SELECT,
  syncPaymentChargebacksFromMollie,
  type ChargebackRowDb,
} from "@/lib/chargebacks/process";
import { classifyFailure, describeError } from "@/lib/orders/activation-failure";
import { applyExtraClassOutcome } from "@/lib/extra-class/confirm";
import { outcomeForMollieStatus, vatSplit } from "@/lib/extra-class/core";

/**
 * Mollie-webhook voor bijgekochte extra lessen (spec-weekcap-extra-les.md),
 * naar het model van /api/trial-bookings/webhook. Modus uit de eigen URL
 * (alles wat niet exact "test" is, is live; spec-facturatie.md 6.5). De
 * boeking wordt gevonden op bookings.drop_in_payment_id.
 *
 * Volgorde: betaling ophalen, betaalregel spiegelen (drie stappen, zodat een
 * herlevering niets dubbel doet), refunds en chargebacks spiegelen, daarna
 * de uitkomst toepassen via tmc.confirm_extra_class_booking (idempotent met
 * statusguard). Een te late betaling op een al vrijgegeven plek wordt daar
 * alsnog bevestigd als het nog past, anders terugbetaald.
 *
 * Responscodes: 200 op alles wat verwerkt is of waarvan herhaling dezelfde
 * uitkomst geeft; 500 op transiënte fouten (Mollie niet bereikbaar, key
 * ontbreekt) zodat Mollie herhaalt en er geen bevestiging verloren gaat.
 */
export async function POST(request: Request) {
  let paymentId = "";
  try {
    const formData = await request.formData();
    paymentId = String(formData.get("id") ?? "");
    if (!paymentId) return NextResponse.json({ ok: true });

    const mode: MollieMode =
      new URL(request.url).searchParams.get("mode") === "test" ? "test" : "live";
    const mollie = getMollieClient(mode);
    if (!mollie) {
      console.error(`[extra-class/webhook] mollie not configured (mode=${mode})`);
      return NextResponse.json({ ok: false, error: "mollie_not_configured" }, { status: 500 });
    }

    const admin = createAdminClient();
    let payment;
    try {
      payment = await mollie.payments.get(paymentId);
    } catch (e) {
      console.error(`[extra-class/webhook] payments.get failed (id=${paymentId}, mode=${mode})`, e);
      if (classifyFailure(e) === "transient") {
        return NextResponse.json({ ok: false, error: "payments_get_transient" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    const { data: booking, error: readErr } = await admin
      .from("bookings")
      .select(
        "id, status, profile_id, session_id, drop_in_price_cents, profile:profiles(is_test, age_category)",
      )
      .eq("drop_in_payment_id", payment.id)
      .maybeSingle();
    if (readErr || !booking) {
      console.warn("[extra-class/webhook] booking not found for payment", payment.id);
      return NextResponse.json({ ok: true });
    }
    const profile = (Array.isArray(booking.profile) ? booking.profile[0] : booking.profile) as
      | { is_test: boolean; age_category: string }
      | null;

    // BTW-snapshot uit dezelfde prijsfunctie als de checkout.
    const amountCents = Math.round(parseFloat(payment.amount.value) * 100);
    const { data: priceRows } = await admin.rpc("extra_class_price", {
      p_age_category: profile?.age_category ?? "adult",
    });
    const priceRow = (Array.isArray(priceRows) ? priceRows[0] : null) as
      | { vat_rate_bp: number | null }
      | null;
    const rate = priceRow?.vat_rate_bp ?? null;
    const split = vatSplit(amountCents, rate);

    const paymentFields = {
      profile_id: booking.profile_id,
      booking_id: booking.id,
      amount_cents: amountCents,
      status: payment.status,
      method: payment.method ?? null,
      description: payment.description ?? null,
      paid_at: payment.paidAt ?? null,
      kind: "extra_class",
      is_test: profile?.is_test === true,
      vat_rate_bp: rate,
      vat_amount_cents: split.vatCents,
      net_amount_cents: split.netCents,
    };
    const { row: paymentRow } = await writePaymentWithTransition<ChargebackRowDb>({
      transition: async () => {
        const { data, error } = await admin
          .from("payments")
          .update(paymentFields)
          .eq("mollie_payment_id", payment.id)
          .neq("status", payment.status)
          .select(CHARGEBACK_ROW_SELECT)
          .maybeSingle<ChargebackRowDb>();
        if (error) {
          console.error("[extra-class/webhook] payments transition failed", error);
          return null;
        }
        return data ?? null;
      },
      insertIfAbsent: async () => {
        const { data, error } = await admin
          .from("payments")
          .upsert(
            { mollie_payment_id: payment.id, ...paymentFields },
            { onConflict: "mollie_payment_id", ignoreDuplicates: true },
          )
          .select(CHARGEBACK_ROW_SELECT)
          .maybeSingle<ChargebackRowDb>();
        if (error) {
          console.error("[extra-class/webhook] payments insert failed", error);
          return null;
        }
        return data ?? null;
      },
      read: async () => {
        const { data } = await admin
          .from("payments")
          .select(CHARGEBACK_ROW_SELECT)
          .eq("mollie_payment_id", payment.id)
          .maybeSingle<ChargebackRowDb>();
        return data ?? null;
      },
    });

    if (paymentRow) {
      await syncPaymentRefundsFromMollie({
        paymentRowId: paymentRow.id,
        molliePaymentId: payment.id,
        amountRefundedValue: payment.amountRefunded?.value,
        isTest: profile?.is_test === true,
      });
      await syncPaymentChargebacksFromMollie({
        mollie,
        row: paymentRow,
        view: {
          amountChargedBackCents: payment.amountChargedBack
            ? Math.round(parseFloat(payment.amountChargedBack.value) * 100)
            : 0,
          sequenceType: payment.sequenceType === SequenceType.oneoff ? "oneoff" : null,
          subscriptionId: null,
          metadataType: "extra_class",
        },
      });
    }

    const outcome = outcomeForMollieStatus(payment.status);
    if (!outcome) {
      // open, pending of authorized: nog niets te beslissen.
      return NextResponse.json({ ok: true });
    }

    const result = await applyExtraClassOutcome({
      admin,
      bookingId: booking.id,
      molliePaymentId: payment.id,
      outcome,
      amountCents,
      via: "webhook",
    });
    if (result === "error") {
      // De statusovergang zelf is niet gelukt (database niet bereikbaar of
      // een weigering): laat Mollie herhalen in plaats van een betaling
      // zonder bevestiging te laten.
      return NextResponse.json({ ok: false, error: "confirm_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[API /bookings/extra-class/webhook]", paymentId, describeError(e).message);
    if (classifyFailure(e) === "transient") {
      return NextResponse.json({ ok: false, error: "unhandled_transient" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
}
