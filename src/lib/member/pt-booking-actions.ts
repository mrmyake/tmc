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

type BookPtCreditsResult = {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  membership_id?: string;
};

type BookPtPendingPaymentResult = {
  ok: boolean;
  reason?: string;
  booking_id?: string;
  price_cents?: number;
  is_intake_discount?: boolean;
  reused?: boolean;
  trainer_name?: string;
  start_at?: string;
};

const PT_REASON_COPY: Record<string, string> = {
  session_unavailable: "Deze sessie is niet meer beschikbaar.",
  session_in_past: "Deze sessie is al voorbij.",
  profile_not_found: "Profiel niet gevonden.",
  no_credits: "Geen PT-pakket met beschikbare credits gevonden.",
  already_booked: "Je hebt deze sessie al geboekt.",
};

/**
 * Book a PT session using credits from an active pt_package membership.
 * Direct path — no Mollie. Sessie-checks, pakket-keuze en credit-aftrek
 * zitten atomair in de SECURITY DEFINER RPC (audit-fix #3 + #1 deel 2);
 * credits_used_from is dus nooit client-supplied.
 */
export async function createPtBookingFromCredits(
  ptSessionId: string,
): Promise<PtActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("book_pt_credits", {
    p_pt_session_id: ptSessionId,
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
      pt_session_id: ptSessionId,
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
 * Book a PT session with Mollie payment. De SECURITY DEFINER RPC maakt (of
 * hergebruikt) de pending pt_booking-rij en berekent price_paid_cents +
 * is_intake_discount server-side (audit-fix #3: de intake-korting is niet
 * langer client-side manipuleerbaar). Daarna opent deze action de Mollie-
 * betaling en koppelt het payment-id via de admin-client — leden hebben
 * geen write-toegang meer op pt_bookings.
 */
export async function createPtBookingWithPayment(
  ptSessionId: string,
): Promise<PtActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const rpcResult = await supabase.rpc("book_pt_pending_payment", {
    p_pt_session_id: ptSessionId,
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
  const isIntake = Boolean(result.is_intake_discount);
  const trainerName = result.trainer_name ?? "coach";

  if (!result.reused) {
    await emitEvent({
      type: "pt_booking.created",
      actorType: "member",
      actorId: user.id,
      subjectType: "pt_booking",
      subjectId: bookingId,
      payload: {
        profile_id: user.id,
        pt_session_id: ptSessionId,
        funded: "payment",
        price_paid_cents: priceCents,
      },
    });
  }

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
        isIntakeDiscount: isIntake ? "true" : "false",
      },
    });
  } catch (e) {
    console.error("[createPtBookingWithPayment] Mollie create:", e);
    return { ok: false, message: "Betaling aanmaken lukte niet." };
  }

  // Store Mollie payment id on the booking row for webhook correlation.
  // Via de admin-client: pt_bookings heeft geen self-write-policy meer.
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
