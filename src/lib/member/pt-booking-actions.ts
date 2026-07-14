"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { getMollieClient } from "@/lib/mollie";

export type PtActionResult =
  | { ok: true; action: "booked"; bookingId: string }
  | { ok: true; action: "redirect"; url: string }
  | { ok: false; message: string };

export type PtSlotInput = {
  trainerId: string;
  startAt: string;
  format?: "one_on_one" | "duo";
};

type BookPtCreditsResult = {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  pt_session_id?: string;
  membership_id?: string;
  start_at?: string;
  end_at?: string;
};

type BookPtPendingPaymentResult = {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  pt_session_id?: string;
  price_cents?: number;
  trainer_name?: string;
  start_at?: string;
  end_at?: string;
};

const PT_REASON_COPY: Record<string, string> = {
  slot_unavailable: "Dit moment is net bezet geraakt. Kies een ander slot.", // COPY: confirm met Marlon
  session_in_past: "Dit moment is al voorbij.",
  outside_horizon: "Je kunt maximaal 8 weken vooruit boeken.", // COPY: confirm met Marlon
  trainer_unavailable: "Deze trainer is niet beschikbaar voor PT.",
  no_active_membership:
    "PT boeken kan met een actief lidmaatschap of tegoed. Neem contact op met Marlon.", // COPY: confirm met Marlon
  no_credits: "Geen passend PT-pakket met beschikbare credits gevonden.",
  insufficient_credits: "Geen passend PT-pakket met beschikbare credits gevonden.",
  credits_expired: "Je rittenkaart is verlopen.", // COPY: confirm met Marlon
  membership_not_active: "Je pakket is niet actief.", // COPY: confirm met Marlon
  format_not_supported:
    "Dit format kan niet met een rittenkaart geboekt worden.", // COPY: confirm met Marlon
};

/**
 * Book a PT session using credits from an active pt_package membership.
 * Direct path — no Mollie. Create-on-book (PT-agenda PR A): de SECURITY
 * DEFINER RPC valideert venster plus vrij onder een advisory lock, maakt
 * de pt_session plus pt_booking atomair aan en debiteert via de
 * geauditeerde credit-kern; credits_used_from is nooit client-supplied.
 */
export async function createPtBookingFromCredits(
  slot: PtSlotInput,
): Promise<PtActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("book_pt_credits", {
    p_trainer_id: slot.trainerId,
    p_start_at: slot.startAt,
    p_format: slot.format ?? "one_on_one",
  });

  if (rpcResult.error) {
    console.error("[createPtBookingFromCredits] rpc:", rpcResult.error);
    return { ok: false, message: "Boeken lukte niet. Probeer opnieuw." };
  }

  const result = rpcResult.data as BookPtCreditsResult;
  if (!result.ok || !result.booking_id) {
    return {
      ok: false,
      message:
        PT_REASON_COPY[result.reason ?? ""] ??
        "Boeken lukte niet. Probeer opnieuw.",
    };
  }

  await emitEvent({
    type: "pt_booking.created",
    actorType: "member",
    actorId: user.id,
    subjectType: "pt_booking",
    subjectId: result.booking_id,
    payload: {
      profile_id: user.id,
      pt_session_id: result.pt_session_id ?? null,
      funded: "credits",
      price_paid_cents: 0,
    },
  });

  revalidatePath("/app/pt");
  revalidatePath("/app");
  revalidatePath("/app/boekingen");
  revalidatePath("/app/abonnement");

  return { ok: true, action: "booked", bookingId: result.booking_id };
}

/**
 * Book a PT session with Mollie payment. Create-on-book met hold
 * (PT-agenda PR A): de RPC maakt de pt_session (hold van 20 minuten)
 * plus een pending pt_booking en berekent de prijs server-side uit de
 * catalogus. Daarna opent deze action de Mollie-betaling en koppelt het
 * payment-id via de admin-client — leden hebben geen write-toegang op
 * pt_bookings. De webhook flipt naar 'booked' en wist de hold; een
 * verlopen hold wordt door de cleanup-cron opgeruimd.
 */
export async function createPtBookingWithPayment(
  slot: PtSlotInput,
): Promise<PtActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("book_pt_pending_payment", {
    p_trainer_id: slot.trainerId,
    p_start_at: slot.startAt,
    p_format: slot.format ?? "one_on_one",
  });

  if (rpcResult.error) {
    console.error("[createPtBookingWithPayment] rpc:", rpcResult.error);
    return { ok: false, message: "Boeken lukte niet. Probeer opnieuw." };
  }

  const result = rpcResult.data as BookPtPendingPaymentResult;
  if (
    !result.ok ||
    !result.booking_id ||
    typeof result.price_cents !== "number" ||
    !result.start_at
  ) {
    return {
      ok: false,
      message:
        PT_REASON_COPY[result.reason ?? ""] ??
        "Boeken lukte niet. Probeer opnieuw.",
    };
  }

  const bookingId = result.booking_id;
  const priceCents = result.price_cents;
  const trainerName = result.trainer_name ?? "coach";

  await emitEvent({
    type: "pt_booking.created",
    actorType: "member",
    actorId: user.id,
    subjectType: "pt_booking",
    subjectId: bookingId,
    payload: {
      profile_id: user.id,
      pt_session_id: result.pt_session_id ?? null,
      funded: "payment",
      price_paid_cents: priceCents,
    },
  });

  const mollie = getMollieClient();
  if (!mollie) {
    console.error("[createPtBookingWithPayment] Mollie not configured");
    return { ok: false, message: "Betalingen zijn tijdelijk niet beschikbaar." };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
  const whenLabel = new Date(result.start_at).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
  });

  let payment;
  try {
    payment = await mollie.payments.create({
      amount: { currency: "EUR", value: (priceCents / 100).toFixed(2) },
      description: `TMC · PT · ${trainerName} · ${whenLabel}`,
      redirectUrl: `${siteUrl}/app/pt/bedankt?booking=${bookingId}`,
      webhookUrl: `${siteUrl}/api/mollie/webhook`,
      metadata: {
        type: "pt_booking",
        ptBookingId: bookingId,
        profileId: user.id,
      },
    });
  } catch (e) {
    console.error("[createPtBookingWithPayment] Mollie create:", e);
    return { ok: false, message: "Betaling aanmaken lukte niet." };
  }

  // Store Mollie payment id on the booking row for webhook correlation.
  // Via de admin-client: pt_bookings heeft geen self-write-policy.
  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("pt_bookings")
    .update({ mollie_payment_id: payment.id })
    .eq("id", bookingId);
  if (updateErr) {
    console.error("[createPtBookingWithPayment] attach payment id:", updateErr);
  }

  // Also log the payment row so /app/facturen picks it up later.
  await admin.from("payments").upsert(
    {
      mollie_payment_id: payment.id,
      profile_id: user.id,
      pt_booking_id: bookingId,
      amount_cents: priceCents,
      status: "open",
      description: `TMC · PT · ${trainerName} · ${whenLabel}`,
    },
    { onConflict: "mollie_payment_id" },
  );

  const checkoutUrl = payment.getCheckoutUrl?.() ?? payment._links?.checkout?.href;
  if (!checkoutUrl) {
    return { ok: false, message: "Geen checkout-link ontvangen." };
  }
  return { ok: true, action: "redirect", url: checkoutUrl };
}
