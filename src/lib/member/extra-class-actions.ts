"use server";

import { PaymentMethod } from "@mollie/api-client";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { extraClassWebhookUrl, siteUrl } from "@/lib/site-url";
import { buildReturnUrl, isReturnTarget, type ReturnTarget } from "@/lib/native/return-url";
import { applyExtraClassOutcome } from "@/lib/extra-class/confirm";
import {
  EXTRA_CLASS_HOLD_MINUTES,
  extraClassDescription,
  outcomeForMollieStatus,
  vatSplit,
} from "@/lib/extra-class/core";

/**
 * Extra les bijkopen (spec-weekcap-extra-les.md). De regels en de prijs
 * leven in de database: tmc.start_extra_class_booking draait de gate op het
 * betaalde pad, rekent de prijs uit tmc.extra_class_price en zet de pending
 * rij met een houdtijd van 20 minuten. Hier alleen de Mollie-betaling (het
 * bedrag komt uit de RPC, nooit van de client), de koppeling van het
 * payment-id en de betaalregel. Bevestigen doet de webhook.
 */

export type StartExtraClassResult =
  | { ok: true; checkoutUrl: string; amountCents: number; bookingId: string }
  | { ok: false; message: string; reason?: string };

// COPY: confirm met Marlon
const START_REASON_COPY: Record<string, string> = {
  session_not_found: "Sessie niet gevonden.",
  age_mismatch: "Deze sessie valt buiten jouw leeftijdscategorie.",
  booking_window_closed: "Nog niet open voor boeking.",
  session_not_scheduled: "Deze sessie is niet meer beschikbaar.",
  session_in_past: "Deze sessie is al voorbij.",
  capacity_full: "Deze les is vol.",
  strike_blocked:
    "Door meerdere no-shows is boeken tijdelijk geblokkeerd. Neem contact op als je vragen hebt.",
  daily_cap_reached: "Maximaal twee sessies per dag.",
  already_booked: "Je hebt deze sessie al geboekt.",
  no_coverage: "Bijkopen kan alleen met een actief abonnement.",
  extra_class_unavailable: "Bijkopen is voor jouw abonnement nog niet beschikbaar.",
  extra_class_not_needed: "Deze les kun je gewoon boeken, zonder bij te kopen.",
  slot_required: "Kies een tijdslot om vrij trainen te boeken.",
  slot_invalid: "Kies een starttijd op het kwartier en een duur van 30 tot 90 minuten.",
  slot_outside_session: "Dit tijdslot valt buiten de openingstijden van vrij trainen.",
  slot_not_allowed: "Voor deze les kies je geen tijdslot.",
  slot_full: "Dit tijdslot zit vol. Kies een ander moment.",
  slot_blocked: "Op dit moment is de studio bezet door een les. Kies een ander moment.",
};

type StartRpc = {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  price_cents?: number;
  vat_rate_bp?: number | null;
  is_test?: boolean;
  pillar?: string;
  slot_start_at?: string | null;
};

export async function startExtraClassCheckout(
  sessionId: string,
  options: { slot?: { startAt: string; minutes: number }; returnTarget?: ReturnTarget } = {},
): Promise<StartExtraClassResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpc = await supabase.rpc("start_extra_class_booking", {
    p_session_id: sessionId,
    ...(options.slot
      ? { p_slot_start_at: options.slot.startAt, p_slot_minutes: options.slot.minutes }
      : {}),
  });
  if (rpc.error) {
    console.error("[startExtraClassCheckout] rpc failed", rpc.error);
    return { ok: false, message: "Bijkopen lukte niet. Probeer het opnieuw." };
  }
  const result = rpc.data as StartRpc;
  if (!result.ok || !result.booking_id || !result.price_cents) {
    return {
      ok: false,
      reason: result.reason,
      message: START_REASON_COPY[result.reason ?? ""] ?? "Bijkopen lukte niet. Probeer het opnieuw.",
    };
  }

  const admin = createAdminClient();
  const bookingId = result.booking_id;
  const amountCents = result.price_cents;
  const mode: MollieMode = result.is_test ? "test" : "live";

  async function releaseAfterFailure(reason: string): Promise<void> {
    await admin
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        hold_expires_at: null,
      })
      .eq("id", bookingId)
      .eq("status", "pending_payment");
  }

  const mollie = getMollieClient(mode);
  if (!mollie) {
    await releaseAfterFailure("payment_create_failed");
    return { ok: false, message: "Betalingsprovider niet geconfigureerd." };
  }

  const { data: sessionRow } = await admin
    .from("class_sessions")
    .select("start_at, class_type:class_types(name)")
    .eq("id", sessionId)
    .maybeSingle();
  const ct = sessionRow
    ? ((Array.isArray(sessionRow.class_type) ? sessionRow.class_type[0] : sessionRow.class_type) as
        | { name: string | null }
        | null)
    : null;
  const description = extraClassDescription(
    ct?.name ?? "Les",
    new Date(result.slot_start_at ?? sessionRow?.start_at ?? Date.now()),
  );

  const returnTarget = isReturnTarget(options.returnTarget) ? options.returnTarget : "web";
  let payment;
  try {
    payment = await mollie.payments.create({
      amount: { currency: "EUR", value: (amountCents / 100).toFixed(2) },
      // COPY: confirm met Marlon
      description: "The Movement Club | Extra les",
      redirectUrl: buildReturnUrl(siteUrl(), `/app/boekingen?extra=${bookingId}`, returnTarget),
      webhookUrl: extraClassWebhookUrl(mode),
      // iDEAL en kaart verlopen zelf binnen 15 en 30 minuten; samen met de
      // houdtijd van de rij blijft een plek nooit lang vast (core.ts).
      method: [PaymentMethod.ideal, PaymentMethod.creditcard],
      metadata: { type: "extra_class", bookingId, profileId: user.id, sessionId },
      idempotencyKey: `extra-${bookingId}-p1`,
    });
  } catch (err) {
    console.error("[startExtraClassCheckout] mollie payment create failed", err);
    await releaseAfterFailure("payment_create_failed");
    return { ok: false, message: "Betaling starten lukte niet. Probeer opnieuw." };
  }

  const { error: linkErr } = await admin
    .from("bookings")
    .update({ drop_in_payment_id: payment.id })
    .eq("id", bookingId)
    .eq("status", "pending_payment")
    .is("drop_in_payment_id", null);
  if (linkErr) {
    console.error("[startExtraClassCheckout] link payment failed", linkErr);
  }

  const split = vatSplit(amountCents, result.vat_rate_bp ?? null);
  const { error: payErr } = await admin.from("payments").insert({
    mollie_payment_id: payment.id,
    profile_id: user.id,
    booking_id: bookingId,
    amount_cents: amountCents,
    status: "open",
    kind: "extra_class",
    is_test: result.is_test === true,
    description,
    vat_rate_bp: result.vat_rate_bp ?? null,
    vat_amount_cents: split.vatCents,
    net_amount_cents: split.netCents,
  });
  if (payErr) {
    console.error("[startExtraClassCheckout] payments insert failed", payErr);
  }

  const checkoutUrl = payment.getCheckoutUrl();
  if (!checkoutUrl) {
    await releaseAfterFailure("payment_create_failed");
    return { ok: false, message: "Kon betaallink niet genereren." };
  }
  revalidatePath("/app/rooster");
  revalidatePath("/app/boekingen");
  return { ok: true, checkoutUrl, amountCents, bookingId };
}

export type ResumeExtraClassResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; message: string; state: "booked" | "cancelled" | "pending" | "unknown" };

/**
 * Terug naar de open Mollie-checkout van een pending extra les (bijvoorbeeld
 * na het sluiten van het betaalscherm). Staat de betaling bij Mollie al in
 * een eindstatus, of is de houdtijd voorbij, dan wordt de uitkomst meteen
 * toegepast en krijgt het lid de reden te zien.
 */
export async function resumeExtraClassCheckout(bookingId: string): Promise<ResumeExtraClassResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd.", state: "unknown" };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, drop_in_payment_id, hold_expires_at, drop_in_price_cents, profile:profiles(is_test)")
    .eq("id", bookingId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!booking) return { ok: false, message: "Boeking niet gevonden.", state: "unknown" };
  if (booking.status === "booked") {
    // COPY: confirm met Marlon
    return { ok: false, message: "Deze extra les is al betaald en staat vast.", state: "booked" };
  }
  if (booking.status !== "pending_payment") {
    // COPY: confirm met Marlon
    return { ok: false, message: "Deze betaling is niet meer open. Boek de les opnieuw.", state: "cancelled" };
  }
  const profile = (Array.isArray(booking.profile) ? booking.profile[0] : booking.profile) as
    | { is_test: boolean }
    | null;
  const mode: MollieMode = profile?.is_test ? "test" : "live";

  if (!booking.drop_in_payment_id) {
    await applyExtraClassOutcome({
      admin,
      bookingId,
      molliePaymentId: null,
      outcome: "expired",
      amountCents: booking.drop_in_price_cents ?? null,
      via: "resume",
    });
    revalidatePath("/app/rooster");
    revalidatePath("/app/boekingen");
    // COPY: confirm met Marlon
    return { ok: false, message: "De betaling is niet gestart. Boek de les opnieuw.", state: "cancelled" };
  }

  const mollie = getMollieClient(mode);
  if (!mollie) return { ok: false, message: "Betalingsprovider niet geconfigureerd.", state: "pending" };
  let payment;
  try {
    payment = await mollie.payments.get(booking.drop_in_payment_id);
  } catch (err) {
    console.error("[resumeExtraClassCheckout] payments.get failed", err);
    return { ok: false, message: "Betaalstatus ophalen lukte niet. Probeer het opnieuw.", state: "pending" };
  }

  const outcome = outcomeForMollieStatus(payment.status);
  const holdExpired = booking.hold_expires_at
    ? Date.parse(booking.hold_expires_at) < Date.now()
    : false;
  if (outcome === null && !holdExpired) {
    const url = payment.getCheckoutUrl();
    if (url) return { ok: true, checkoutUrl: url };
  }
  const applied = await applyExtraClassOutcome({
    admin,
    bookingId,
    molliePaymentId: booking.drop_in_payment_id,
    outcome: outcome ?? "expired",
    amountCents: booking.drop_in_price_cents ?? null,
    via: "resume",
  });
  revalidatePath("/app/rooster");
  revalidatePath("/app/boekingen");
  if (applied === "confirmed" || applied === "confirmed_late" || applied === "already_confirmed") {
    // COPY: confirm met Marlon
    return { ok: false, message: "Je betaling is binnen. De extra les staat.", state: "booked" };
  }
  return {
    ok: false,
    // COPY: confirm met Marlon
    message: `De betaling is verlopen (de plek stond ${EXTRA_CLASS_HOLD_MINUTES} minuten voor je vast). Boek de les opnieuw.`,
    state: "cancelled",
  };
}

export type ExtraClassBookingState = "pending" | "booked" | "cancelled" | "unknown";

/** Voor de terugkeermelding op /app/boekingen: huidige status van de eigen extra les. */
export async function getExtraClassBookingState(bookingId: string): Promise<ExtraClassBookingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "unknown";
  const { data } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!data) return "unknown";
  if (data.status === "booked") return "booked";
  if (data.status === "pending_payment") return "pending";
  return "cancelled";
}
