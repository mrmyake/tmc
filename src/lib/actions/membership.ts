"use server";

import { SequenceType } from "@mollie/api-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";

export type StartSignupResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

/**
 * Start een nieuwe member-signup. Vereist auth + voltooid profiel.
 *
 * 1. Valideer plan + zorg dat er geen actief/pending abbo al is.
 * 2. Maak of hergebruik Mollie customer (opgeslagen in memberships rij).
 * 3. Insert pending membership rij (RLS-safe via admin client; insert-
 *    policy bestaat nog niet op memberships).
 * 4. Create Mollie first payment (sequenceType: first) — de klant
 *     rondt af via iDEAL/creditcard en stemt gelijktijdig in met het
 *     SEPA-mandaat voor toekomstige cyclussen.
 * 5. Koppel Mollie payment-id aan de membership en return de checkout-URL.
 */
export async function startSignup(
  planVariant: string
): Promise<StartSignupResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return { ok: false, error: "Niet ingelogd." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name,last_name,health_intake_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.first_name || !profile?.last_name) {
      return {
        ok: false,
        error: "Vul eerst je profiel in (voor- en achternaam).",
      };
    }

    // Active/pending abbo check
    const { data: existing } = await supabase
      .from("memberships")
      .select("id,status")
      .eq("profile_id", user.id)
      .in("status", [
        "pending",
        "active",
        "paused",
        "cancellation_requested",
      ])
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        error:
          existing.status === "pending"
            ? "Je hebt al een openstaande aanmelding. Rond die eerst af."
            : "Je hebt al een actief abonnement.",
      };
    }

    // Plan uit catalog
    const admin = createAdminClient();
    const { data: plan, error: planErr } = await admin
      .from("membership_plan_catalogue")
      .select("*")
      .eq("plan_variant", planVariant)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr || !plan) {
      return { ok: false, error: "Dit abonnement is niet (meer) beschikbaar." };
    }

    // Inschrijfkosten uit booking_settings
    const { data: settings } = await admin
      .from("booking_settings")
      .select("registration_fee_cents")
      .eq("id", "singleton")
      .single();
    const registrationFeeCents: number = settings?.registration_fee_cents ?? 3900;
    const totalCents: number = plan.price_per_cycle_cents + registrationFeeCents;

    // Mollie + env
    const mollie = getMollieClient();
    if (!mollie) {
      return { ok: false, error: "Betalingsprovider niet geconfigureerd." };
    }
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://themovementclub.nl";

    // Mollie customer — hergebruik als er al eerder een gemaakt is.
    const { data: priorMembership } = await admin
      .from("memberships")
      .select("mollie_customer_id")
      .eq("profile_id", user.id)
      .not("mollie_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let mollieCustomerId: string | null =
      priorMembership?.mollie_customer_id ?? null;
    if (!mollieCustomerId) {
      const customer = await mollie.customers.create({
        name: `${profile.first_name} ${profile.last_name}`.trim(),
        email: user.email,
        metadata: { profile_id: user.id },
      });
      mollieCustomerId = customer.id;
    }

    // Pending membership
    const today = new Date().toISOString().split("T")[0];
    const { data: membership, error: insertErr } = await admin
      .from("memberships")
      .insert({
        profile_id: user.id,
        plan_type: plan.plan_type,
        plan_variant: plan.plan_variant,
        frequency_cap: plan.frequency_cap,
        age_category: plan.age_category,
        price_per_cycle_cents: plan.price_per_cycle_cents,
        billing_cycle_weeks: plan.billing_cycle_weeks,
        commit_months: plan.commit_months,
        start_date: today,
        status: "pending",
        mollie_customer_id: mollieCustomerId,
        covered_pillars: plan.covered_pillars,
        source: "direct",
      })
      .select("id")
      .single();
    if (insertErr || !membership) {
      console.error("[startSignup] insert membership", insertErr);
      return { ok: false, error: "Kon aanmelding niet opslaan." };
    }

    // Mollie first payment
    const amountValue = (totalCents / 100).toFixed(2);
    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value: amountValue },
      description: `The Movement Club | ${plan.display_name} + inschrijfkosten`,
      redirectUrl: `${siteUrl}/app/abonnement/bedankt?membership=${membership.id}`,
      webhookUrl: `${siteUrl}/api/mollie/webhook`,
      customerId: mollieCustomerId,
      sequenceType: SequenceType.first,
      // Geen method-restrictie: Mollie toont alle beschikbare methods die
      // een recurring-mandaat ondersteunen (iDEAL, creditcard, SEPA).
      metadata: {
        membershipId: membership.id,
        profileId: user.id,
        type: "first_payment",
        planVariant: plan.plan_variant,
        registrationFeeCents,
      },
    });

    // Koppel payment-id aan membership (voor webhook idempotentie) + log payment
    await admin
      .from("memberships")
      .update({ notes: `first_payment:${payment.id}` })
      .eq("id", membership.id);
    await admin.from("payments").insert({
      mollie_payment_id: payment.id,
      profile_id: user.id,
      membership_id: membership.id,
      amount_cents: totalCents,
      status: "open",
      description: `First payment — ${plan.display_name}`,
    });

    const checkoutUrl = payment.getCheckoutUrl();
    if (!checkoutUrl) {
      return { ok: false, error: "Kon betaallink niet genereren." };
    }
    return { ok: true, checkoutUrl };
  } catch (e) {
    console.error("[startSignup]", e);
    return { ok: false, error: "Er ging iets mis. Probeer opnieuw." };
  }
}
