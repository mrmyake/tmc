import { NextResponse } from "next/server";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { sendTrialBookingConfirmationEmail } from "@/lib/trial-booking-email";
import { syncPaymentRefundsFromMollie } from "@/lib/refunds/process";
import { cancelIfSessionCancelled } from "@/lib/trial-booking-paid-on-cancelled-session";
import { cancellationReasonForMollieStatus } from "@/lib/trial-expiry";

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
      // Geen 2xx: Mollie herhaalt een webhook alleen na een niet-2xx-
      // respons. Een key die wegvalt (of een vangrail in mollie.ts die
      // weigert) mag geen betalingsbevestigingen stil laten verdwijnen;
      // met een 500 blijft Mollie proberen tot de configuratie klopt.
      console.error(`[trial-bookings/webhook] mollie not configured (mode=${mode})`);
      return NextResponse.json({ ok: false, error: "mollie_not_configured" }, { status: 500 });
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

    // Wat de spiegel al wist, voordat we hem bijwerken: nodig om een
    // betaling die binnenkomt op een al geannuleerde proefles te
    // onderscheiden van een refund-update op een eerder al betaalde en
    // daarna door de studio geannuleerde proefles (zie hieronder).
    const { data: previousMirror } = await admin
      .from("payments")
      .select("status")
      .eq("mollie_payment_id", payment.id)
      .maybeSingle();
    const previouslyPaid = previousMirror?.status === "paid";

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

    // Restitutiespiegel (spec-facturatie.md 4.7 stap 3): Mollie roept deze
    // webhook ook aan als een refund van status verandert. De payment-
    // status blijft dan 'paid'; alleen amountRefunded beweegt. Schrijf die
    // naar refunded_amount_cents/refunded_at en werk onze refund-intenties
    // bij, zodat v_revenue_lines en de retry-knop de werkelijkheid zien.
    const { data: paymentRow } = await admin
      .from("payments")
      .select("id")
      .eq("mollie_payment_id", payment.id)
      .maybeSingle();
    if (paymentRow) {
      await syncPaymentRefundsFromMollie({
        paymentRowId: paymentRow.id,
        molliePaymentId: payment.id,
        amountRefundedValue: payment.amountRefunded?.value ?? null,
        isTest: trial.is_test === true,
      });
    }

    // Betaling komt alsnog binnen op een proefles die al geannuleerd is
    // (door de cron expire-trial-bookings, een eerdere expired-webhook of
    // de studio). Geen automatische actie: de plek is misschien al weg en
    // terugbetalen is een beslissing van Marlon. Wel een alarm en een
    // event, een keer per betaling. Een refund-update op een betaling die
    // al 'paid' in de spiegel stond is geen nieuwe betaling en slaat dit
    // over.
    if (trial.status === "cancelled" && newStatus === "paid" && !previouslyPaid) {
      const { data: alreadyFlagged } = await admin
        .from("events")
        .select("id")
        .eq("type", "trial_booking.paid_after_cancel")
        .eq("subject_id", trial.id)
        .limit(1)
        .maybeSingle();
      if (!alreadyFlagged) {
        await emitEvent({
          type: "trial_booking.paid_after_cancel",
          actorType: "visitor",
          actorId: null,
          subjectType: "trial_booking",
          subjectId: trial.id,
          payload: {
            session_id: trial.session_id,
            trial_booking_id: trial.id,
            mollie_payment_id: payment.id,
            amount_cents: amountCents,
          },
        });
        await sendNotification(
          "Proefles betaald na annulering",
          `Betaling ${payment.id} kwam binnen voor proefles-boeking ${trial.id}, maar die was al geannuleerd. Niets automatisch gedaan: controleer de plek en beslis over terugbetaling.`,
          "rotating_light",
        );
      }
      return NextResponse.json({ ok: true });
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

      // Bijvangst: is de sessie intussen door de studio geannuleerd, dan
      // meteen weer annuleren met refund en annuleringsmail, en geen
      // bevestiging sturen.
      if (await cancelIfSessionCancelled(trial)) {
        await sendNotification(
          "Proefles betaald op geannuleerde sessie",
          `Proefles-boeking ${trial.id} kwam binnen op een geannuleerde sessie en is direct geannuleerd met terugbetaling.`,
          "warning",
        );
        return NextResponse.json({ ok: true });
      }

      await sendNotification(
        "Nieuwe proefles-boeking!",
        `Proefles-boeking ${trial.id} is betaald. Zie de sessie in het admin-rooster.`,
        "muscle,fire",
      );

      // Bevestiging naar de bezoeker zelf: datum/tijd/lestype, adres,
      // annuleerlink op cancel_token en het annuleringsvenster. Ontbrak
      // hiervoor volledig, zie src/lib/trial-booking-email.ts.
      await sendTrialBookingConfirmationEmail(trial);
    } else {
      // Definitief niet betaald: de plek komt vrij, met de reden uit de
      // Mollie-status (payment_expired, payment_failed, payment_canceled).
      // De cron expire-trial-bookings is het vangnet als deze webhook
      // niet aankomt. Statusguard in de WHERE, zoals bij paid.
      const reason = cancellationReasonForMollieStatus(newStatus);
      if (reason) {
        const { data: cancelled } = await admin
          .from("trial_bookings")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: reason,
          })
          .eq("id", trial.id)
          .eq("status", "pending")
          .select("id");
        if ((cancelled?.length ?? 0) > 0) {
          await emitEvent({
            type: "trial_booking.cancelled",
            actorType: "system",
            actorId: null,
            subjectType: "trial_booking",
            subjectId: trial.id,
            payload: {
              session_id: trial.session_id,
              reason,
              via: "webhook",
              mollie_status: newStatus,
              mollie_payment_id: payment.id,
            },
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /trial-bookings/webhook]", e);
    // Mollie herhaalt bij een niet-2xx-respons; we willen geen retry-spam.
    return NextResponse.json({ ok: true });
  }
}
