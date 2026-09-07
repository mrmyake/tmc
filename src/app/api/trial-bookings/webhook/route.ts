import { NextResponse } from "next/server";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { sendTrialBookingConfirmationEmail } from "@/lib/trial-booking-email";

export async function POST(request: Request) {
  try {
    // Mollie stuurt application/x-www-form-urlencoded met veld "id".
    const formData = await request.formData();
    const paymentId = String(formData.get("id") ?? "");
    if (!paymentId) {
      return NextResponse.json({ ok: true });
    }

    // Modus uit de eigen URL, zelfde whitelist als /api/mollie/webhook:
    // alles wat niet exact "test" is, is live (spec-facturatie.md 6.5).
    const mode: MollieMode =
      new URL(request.url).searchParams.get("mode") === "test"
        ? "test"
        : "live";
    const mollie = getMollieClient(mode);
    if (!mollie) {
      console.error(`[trial-bookings/webhook] mollie not configured (mode=${mode})`);
      return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();
    let payment;
    try {
      payment = await mollie.payments.get(paymentId);
    } catch (e) {
      console.error(
        `[trial-bookings/webhook] payments.get failed (id=${paymentId}, mode=${mode})`,
        e,
      );
      return NextResponse.json({ ok: true });
    }
    const newStatus = payment.status;

    const { data: trial, error: readErr } = await admin
      .from("trial_bookings")
      .select(
        "id, status, session_id, name, email, phone, cancel_token, price_paid_cents, is_test",
      )
      .eq("mollie_payment_id", paymentId)
      .maybeSingle();

    if (readErr || !trial) {
      console.warn("[trial-bookings/webhook] row not found", paymentId);
      return NextResponse.json({ ok: true });
    }

    // Payments-spiegel (PR 5, dicht het omzetlek uit spec-facturatie.md
    // 2.9): elke statusovergang geupsert, zelfde patroon als de
    // hoofdwebhook. is_test komt uit de trial-rij (het snapshot van de
    // aanmaak), niet uit de mode-parameter. BTW-snapshot tegen het
    // drop_in-tarief, zelfde formule als PR 3 (bruto leidend, 3.1).
    const amountCents = Math.round(parseFloat(payment.amount.value) * 100);
    const { data: dropIn } = await admin
      .from("catalogue")
      .select("vat_rate_bp")
      .eq("slug", "drop_in")
      .maybeSingle();
    const rate = dropIn?.vat_rate_bp ?? null;
    const vatCents =
      rate === null ? null : Math.round((amountCents * rate) / (10000 + rate));
    const { error: upsertErr } = await admin.from("payments").upsert(
      {
        mollie_payment_id: payment.id,
        amount_cents: amountCents,
        status: payment.status,
        method: payment.method ?? null,
        description: payment.description ?? null,
        paid_at: payment.paidAt ?? null,
        kind: "trial_booking",
        trial_booking_id: trial.id,
        is_test: trial.is_test === true,
        vat_rate_bp: rate,
        vat_amount_cents: vatCents,
        net_amount_cents: vatCents === null ? null : amountCents - vatCents,
      },
      { onConflict: "mollie_payment_id" },
    );
    if (upsertErr) {
      console.error(
        `[trial-bookings/webhook] payments upsert failed (id=${paymentId}, mode=${mode})`,
        upsertErr,
      );
    }

    // Idempotent: al in een eindstatus, en niet opnieuw naar pending.
    if (trial.status !== "pending") {
      return NextResponse.json({ ok: true });
    }

    if (newStatus === "paid") {
      // .select("id") + de rijtelling checken is de eigenlijke guard, niet
      // upErr: een UPDATE ... WHERE status='pending' die niets raakt geeft
      // GEEN error terug, alleen nul rijen. Zonder deze check zou een
      // race met de expire-orders-cron (die dezelfde rij tussen onze read
      // hierboven en deze update al naar paid kan hebben gereconcilieerd)
      // hier stilzwijgend doorlopen naar event/ntfy/mail en dus dubbel
      // versturen. De WHERE-clausule zelf is atomair op rijniveau: als
      // deze en de cron-update elkaar overlappen, serialiseert Postgres
      // ze en wint precies één kant de nul-naar-een-rij-overgang; de
      // ander ziet hier 0 affected rows. Zelfde patroon als de
      // reconciliatiestap in expire-orders/route.ts.
      const { data: updated, error: upErr } = await admin
        .from("trial_bookings")
        .update({ status: "paid" })
        .eq("id", trial.id)
        .eq("status", "pending")
        .select("id");

      if (upErr) {
        console.error("[trial-bookings/webhook] update failed", upErr);
        return NextResponse.json({ ok: true });
      }
      if ((updated?.length ?? 0) === 0) {
        console.warn(
          "[trial-bookings/webhook] pending->paid race lost (already reconciled elsewhere), skipping side effects",
          trial.id,
        );
        return NextResponse.json({ ok: true });
      }

      await emitEvent({
        type: "trial_booking.paid",
        actorType: "visitor",
        actorId: null,
        subjectType: "trial_booking",
        subjectId: trial.id,
        payload: { session_id: trial.session_id },
      });

      await sendNotification(
        "Nieuwe proefles-boeking!",
        `${trial.name} (${trial.email}, ${trial.phone}) heeft betaald voor een proefles.`,
        "muscle,fire",
      );

      // Bevestiging naar de bezoeker zelf: datum/tijd/lestype, adres,
      // annuleerlink op cancel_token en het annuleringsvenster. Ontbrak
      // hiervoor volledig — zie src/lib/trial-booking-email.ts.
      await sendTrialBookingConfirmationEmail(trial);
    } else if (newStatus === "failed" || newStatus === "canceled" || newStatus === "expired") {
      await admin
        .from("trial_bookings")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", trial.id)
        .eq("status", "pending");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /trial-bookings/webhook]", e);
    // Mollie herhaalt bij een niet-2xx-respons; we willen geen retry-spam.
    return NextResponse.json({ ok: true });
  }
}
