import { NextResponse } from "next/server";
import { getMollieClient } from "@/lib/mollie";
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

    const mollie = getMollieClient();
    if (!mollie) {
      console.error("[trial-bookings/webhook] mollie not configured");
      return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();
    const payment = await mollie.payments.get(paymentId);
    const newStatus = payment.status;

    const { data: trial, error: readErr } = await admin
      .from("trial_bookings")
      .select(
        "id, status, session_id, name, email, phone, cancel_token, price_paid_cents",
      )
      .eq("mollie_payment_id", paymentId)
      .maybeSingle();

    if (readErr || !trial) {
      console.warn("[trial-bookings/webhook] row not found", paymentId);
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
