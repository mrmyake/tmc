"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import {
  calculatePtPriceCents,
  qualifiesForIntakeDiscount,
  type PtTier,
} from "./pt-pricing";

export type PtActionResult =
  | { ok: true; action: "booked"; bookingId: string }
  | { ok: true; action: "redirect"; url: string }
  | { ok: false; message: string };

/**
 * Book a PT session using credits from an active pt_package membership.
 * Direct path — no Mollie. Decrements credits on success.
 */
export async function createPtBookingFromCredits(
  ptSessionId: string,
): Promise<PtActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const [sessionRes, memRes] = await Promise.all([
    supabase
      .from("pt_sessions")
      .select("id, status, start_at, format, trainer_id")
      .eq("id", ptSessionId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, plan_type, credits_remaining, credits_total")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .eq("plan_type", "pt_package")
      .gt("credits_remaining", 0)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const session = sessionRes.data;
  const membership = memRes.data;
  if (!session || session.status !== "scheduled")
    return { ok: false, message: "Deze sessie is niet meer beschikbaar." };
  if (new Date(session.start_at) <= new Date())
    return { ok: false, message: "Deze sessie is al voorbij." };
  if (!membership)
    return {
      ok: false,
      message: "Geen PT-pakket met beschikbare credits gevonden.",
    };

  const insertRes = await supabase
    .from("pt_bookings")
    .insert({
      profile_id: user.id,
      pt_session_id: ptSessionId,
      price_paid_cents: 0,
      credits_used_from: membership.id,
      is_intake_discount: false,
      status: "booked",
    })
    .select("id")
    .single();

  if (insertRes.error) {
    if (insertRes.error.code === "23505") {
      return { ok: false, message: "Je hebt deze sessie al geboekt." };
    }
    console.error("[createPtBookingFromCredits] insert:", insertRes.error);
    return { ok: false, message: "Boeken lukte niet. Probeer opnieuw." };
  }

  await supabase
    .from("memberships")
    .update({
      credits_remaining: (membership.credits_remaining ?? 1) - 1,
    })
    .eq("id", membership.id);

  revalidatePath("/app/pt");
  revalidatePath("/app");
  revalidatePath("/app/boekingen");
  revalidatePath("/app/abonnement");

  return { ok: true, action: "booked", bookingId: insertRes.data.id };
}

/**
 * Book a PT session with Mollie payment. Creates a pending pt_booking row,
 * opens a Mollie payment with metadata.type='pt_booking', returns the
 * checkout URL. Webhook flips status to 'booked' on payment.paid.
 */
export async function createPtBookingWithPayment(
  ptSessionId: string,
): Promise<PtActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: session } = await supabase
    .from("pt_sessions")
    .select(
      "id, status, start_at, format, trainer_id, trainer:trainers(display_name, pt_tier)",
    )
    .eq("id", ptSessionId)
    .maybeSingle();

  if (!session || session.status !== "scheduled")
    return { ok: false, message: "Deze sessie is niet meer beschikbaar." };
  if (new Date(session.start_at) <= new Date())
    return { ok: false, message: "Deze sessie is al voorbij." };

  const trainerRow = Array.isArray(session.trainer)
    ? session.trainer[0]
    : session.trainer;
  const tier = (trainerRow?.pt_tier as PtTier | undefined) ?? "standard";
  const trainerName = trainerRow?.display_name ?? "coach";

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, first_name, last_name, has_used_pt_intake_discount")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { ok: false, message: "Profiel niet gevonden." };

  const { data: activeSub } = await supabase
    .from("memberships")
    .select("id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .neq("plan_type", "pt_package")
    .limit(1)
    .maybeSingle();

  const isIntake = qualifiesForIntakeDiscount({
    hasUsedIntakeDiscount: profile.has_used_pt_intake_discount,
    trainerTier: tier,
    format: (session.format as PtTier extends never ? never : "one_on_one") ?? "one_on_one",
    purchaseType: "single",
  });

  const priceCents = calculatePtPriceCents({
    tier,
    format: "one_on_one",
    purchaseType: "single",
    memberHasActiveSub: Boolean(activeSub),
    isIntakeSession: isIntake,
  });

  // Insert pending booking first — so we can reference it from Mollie metadata.
  // Idempotency: the unique(profile_id, pt_session_id) constraint stops
  // duplicates; if a previous pending booking exists we reuse it.
  const { data: existing } = await supabase
    .from("pt_bookings")
    .select("id, status, mollie_payment_id")
    .eq("profile_id", user.id)
    .eq("pt_session_id", ptSessionId)
    .maybeSingle();

  let bookingId: string;
  if (existing) {
    if (existing.status === "booked") {
      return { ok: false, message: "Je hebt deze sessie al geboekt." };
    }
    bookingId = existing.id;
  } else {
    const insertRes = await supabase
      .from("pt_bookings")
      .insert({
        profile_id: user.id,
        pt_session_id: ptSessionId,
        price_paid_cents: priceCents,
        is_intake_discount: isIntake,
        status: "booked", // we use 'booked' at insert; webhook keeps it on paid, flips to 'cancelled' on failure
      })
      .select("id")
      .single();
    if (insertRes.error) {
      if (insertRes.error.code === "23505") {
        return { ok: false, message: "Je hebt deze sessie al geboekt." };
      }
      console.error("[createPtBookingWithPayment] insert:", insertRes.error);
      return { ok: false, message: "Boeken lukte niet. Probeer opnieuw." };
    }
    bookingId = insertRes.data.id;
  }

  const mollie = getMollieClient();
  if (!mollie) {
    console.error("[createPtBookingWithPayment] Mollie not configured");
    return { ok: false, message: "Betalingen zijn tijdelijk niet beschikbaar." };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://themovementclub.nl";
  const whenLabel = new Date(session.start_at).toLocaleDateString("nl-NL", {
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
  const { error: updateErr } = await supabase
    .from("pt_bookings")
    .update({ mollie_payment_id: payment.id })
    .eq("id", bookingId);
  if (updateErr) {
    console.error("[createPtBookingWithPayment] attach payment id:", updateErr);
  }

  // Also log the payment row so /app/facturen picks it up later.
  const admin = createAdminClient();
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
