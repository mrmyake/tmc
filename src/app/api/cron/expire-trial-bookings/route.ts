import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendTrialBookingConfirmationEmail } from "@/lib/trial-booking-email";
import { cancelIfSessionCancelled } from "@/lib/trial-booking-paid-on-cancelled-session";
import {
  decideTrialExpiry,
  tripsCircuitBreaker,
  TRIAL_NOT_FOUND_CIRCUIT_BREAKER,
  type MolliePaymentSnapshot,
  type TrialExpiryDecision,
} from "@/lib/trial-expiry";

export const dynamic = "force-dynamic";

/**
 * Vangnet voor pending proeflessen (tmc.trial_bookings met status
 * 'pending' en een mollie_payment_id), elke 15 minuten. Een pending rij
 * telt mee in de bezetting (session_occupancy, v_session_availability,
 * enforce_session_capacity), dus een gemiste of onbestelbare webhook houdt
 * anders een plek bezet tot de les voorbij is. De beslisregels staan in
 * src/lib/trial-expiry.ts (met tests in scripts/trial-expiry/):
 *
 *  - Mollie paid: alsnog bevestigen, hetzelfde vervolg als de webhook
 *    (event, ntfy, bevestigingsmail, bijvangst geannuleerde sessie).
 *  - Mollie expired, failed of canceled: cancelled met de passende reden.
 *  - Nog open voorbij expiresAt plus 15 minuten marge (terugval: 45
 *    minuten na booked_at): cancelled als payment_expired.
 *  - Onbekend bij Mollie (404): alleen cancelled als de vervaltijd voorbij
 *    is en er geen tmc.payments-rij voor dit payment-id bestaat; altijd een
 *    ntfy-waarschuwing per rij. Meer dan TRIAL_NOT_FOUND_CIRCUIT_BREAKER
 *    404's in een run: niets annuleren, run afbreken, alarm. Dat wijst op
 *    een key- of profielprobleem, niet op verlopen betalingen.
 *
 * Wezen zonder payment-id blijven bij /api/cron/expire-orders. Een
 * annulering hier zet via de bestaande trigger trial_bookings_release_code
 * een eventuele proefcode-inwisseling vrij (een pending rij heeft er in de
 * praktijk nooit een: codeboekingen zijn direct paid). Modus per rij uit
 * trial_bookings.is_test, zoals in de webhook.
 */

/** Jongste rij die we bij Mollie nakijken: iDEAL verloopt na 15 minuten. */
const MIN_AGE_MS = 15 * 60_000;

type PendingTrial = {
  id: string;
  mollie_payment_id: string;
  session_id: string;
  name: string;
  email: string;
  phone: string;
  cancel_token: string;
  price_paid_cents: number;
  is_test: boolean;
  booked_at: string;
};

type Lookup =
  | { trial: PendingTrial; payment: MolliePaymentSnapshot; hasPaymentRow: boolean }
  | { trial: PendingTrial; error: unknown };

function isMollieNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { statusCode?: unknown }).statusCode === 404
  );
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_AGE_MS).toISOString();

  const { data: pending, error: queryErr } = await admin
    .from("trial_bookings")
    .select(
      "id, mollie_payment_id, session_id, name, email, phone, cancel_token, price_paid_cents, is_test, booked_at",
    )
    .eq("status", "pending")
    .not("mollie_payment_id", "is", null)
    .lt("booked_at", cutoff)
    .order("booked_at", { ascending: true })
    .returns<PendingTrial[]>();

  if (queryErr) {
    console.error("[cron/expire-trial-bookings] query failed", queryErr);
    return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
  }

  const rows = pending ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0, cancelled: 0, left: 0, notFound: 0, skipped: 0 });
  }

  // Pas 1: alleen lezen. Eerst alle Mollie-statussen ophalen, dan pas
  // schrijven, zodat de circuit breaker over de hele run beslist voordat
  // er iets geannuleerd is.
  const lookups: Lookup[] = [];
  let notFound = 0;
  let skipped = 0;
  for (const trial of rows) {
    const mode = trial.is_test ? "test" : "live";
    const mollie = getMollieClient(mode);
    if (!mollie) {
      console.error(
        `[cron/expire-trial-bookings] mollie not configured (mode=${mode}); trial ${trial.id} left as-is`,
      );
      skipped += 1;
      continue;
    }
    try {
      const payment = await mollie.payments.get(trial.mollie_payment_id);
      lookups.push({
        trial,
        payment: { found: true, status: payment.status, expiresAt: payment.expiresAt ?? null },
        hasPaymentRow: false,
      });
    } catch (err) {
      if (isMollieNotFound(err)) {
        notFound += 1;
        const { data: paymentRow } = await admin
          .from("payments")
          .select("id")
          .eq("mollie_payment_id", trial.mollie_payment_id)
          .maybeSingle();
        lookups.push({ trial, payment: { found: false }, hasPaymentRow: Boolean(paymentRow) });
      } else {
        console.error("[cron/expire-trial-bookings] mollie lookup failed", trial.id, err);
        lookups.push({ trial, error: err });
        skipped += 1;
      }
    }
  }

  if (tripsCircuitBreaker(notFound)) {
    console.error(
      `[cron/expire-trial-bookings] circuit breaker: ${notFound} pending rijen onbekend bij Mollie (grens ${TRIAL_NOT_FOUND_CIRCUIT_BREAKER}); niets geannuleerd`,
    );
    await sendNotification(
      "Proefles-cron afgebroken",
      `${notFound} pending proefles-betalingen zijn onbekend bij Mollie (meer dan ${TRIAL_NOT_FOUND_CIRCUIT_BREAKER}). Dat wijst op een key- of profielprobleem. Er is niets geannuleerd; controleer MOLLIE_API_KEY_LIVE en het Mollie-profiel.`,
      "rotating_light",
    );
    return NextResponse.json(
      { ok: false, error: "circuit_breaker", checked: rows.length, notFound, skipped },
      { status: 500 },
    );
  }

  // Pas 2: beslissen en schrijven.
  let paid = 0;
  let cancelled = 0;
  let left = 0;
  const nowIso = now.toISOString();

  for (const lookup of lookups) {
    if ("error" in lookup) continue;
    const { trial } = lookup;
    const decision: TrialExpiryDecision = decideTrialExpiry({
      bookedAt: trial.booked_at,
      payment: lookup.payment,
      hasPaymentRow: lookup.hasPaymentRow,
      now,
    });

    if (!lookup.payment.found) {
      // Altijd melden, ook als de rij blijft staan: een 404 hoort niet voor
      // te komen zolang key en profiel kloppen.
      await sendNotification(
        "Proefles-betaling onbekend bij Mollie",
        decision.action === "cancel"
          ? `Betaling ${trial.mollie_payment_id} van proefles-boeking ${trial.id} bestaat niet bij Mollie en de vervaltijd is voorbij. De boeking is geannuleerd (payment_expired) en de plek is vrij.`
          : `Betaling ${trial.mollie_payment_id} van proefles-boeking ${trial.id} bestaat niet bij Mollie (${decision.action === "leave" ? decision.detail : ""}). De boeking blijft staan.`,
        "warning",
      );
    }

    if (decision.action === "leave") {
      left += 1;
      continue;
    }

    if (decision.action === "mark_paid") {
      // Gemiste webhook in de goede richting: alsnog bevestigen, met
      // hetzelfde vervolg als de webhook. De statusguard in de WHERE maakt
      // dit idempotent tegen een gelijktijdige webhook-levering.
      const { data: updated, error: upErr } = await admin
        .from("trial_bookings")
        .update({ status: "paid" })
        .eq("id", trial.id)
        .eq("status", "pending")
        .select("id");
      if (upErr || (updated?.length ?? 0) === 0) {
        skipped += 1;
        continue;
      }
      await emitEvent({
        type: "trial_booking.paid",
        actorType: "system",
        actorId: null,
        subjectType: "trial_booking",
        subjectId: trial.id,
        payload: { session_id: trial.session_id, via: "cron_reconcile" },
      });
      if (await cancelIfSessionCancelled(trial)) {
        paid += 1;
        continue;
      }
      await sendNotification(
        "Nieuwe proefles-boeking!",
        `Proefles-boeking ${trial.id} is betaald (via reconciliatie). Zie de sessie in het admin-rooster.`,
        "muscle,fire",
      );
      // Dit is precies het scenario waarin de webhook nooit is aangekomen:
      // zonder deze mail zou de bezoeker zijn cancel_token nooit zien.
      await sendTrialBookingConfirmationEmail(trial);
      paid += 1;
      continue;
    }

    const { data: done, error: cancelErr } = await admin
      .from("trial_bookings")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        cancellation_reason: decision.reason,
      })
      .eq("id", trial.id)
      .eq("status", "pending")
      .select("id");
    if (cancelErr) {
      console.error("[cron/expire-trial-bookings] cancel failed", trial.id, cancelErr);
      skipped += 1;
      continue;
    }
    if ((done?.length ?? 0) === 0) {
      // Intussen door de webhook afgehandeld.
      skipped += 1;
      continue;
    }
    await emitEvent({
      type: "trial_booking.cancelled",
      actorType: "system",
      actorId: null,
      subjectType: "trial_booking",
      subjectId: trial.id,
      payload: {
        session_id: trial.session_id,
        reason: decision.reason,
        via: "cron_expire",
        detail: decision.detail,
        mollie_status: lookup.payment.found ? lookup.payment.status : null,
        mollie_payment_id: trial.mollie_payment_id,
      },
    });
    cancelled += 1;
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    paid,
    cancelled,
    left,
    notFound,
    skipped,
  });
}
