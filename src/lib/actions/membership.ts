"use server";

import { SequenceType } from "@mollie/api-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { getMollieClient } from "@/lib/mollie";

export type StartSignupResult =
  | { ok: true; checkoutUrl: string; amountCents: number }
  | { ok: false; error: string };

export interface StartSignupOptions {
  /**
   * Early Member-signup: reserveert atomair een plek in de pool van het
   * gekozen plan (early_member_pool in de catalogus) en past de Early
   * Member-voorwaarden toe: geen inschrijfkosten, geen commitment (per 4
   * weken opzegbaar) en voor de all_access-pool een prijs-lock.
   */
  earlyMember?: boolean;
  /**
   * Verlengde toegang (06:00-23:00) als 10-euro-add-on. Alleen kiesbaar op
   * vrij_trainen-plannen; all_inclusive heeft het gratis inbegrepen.
   */
  extendedAccess?: boolean;
}

const EM_RESERVE_ERRORS: Record<string, string> = {
  pool_full:
    "De Early Member-plekken voor dit membership zijn vergeven. Je kunt wel het reguliere abonnement kiezen.",
  closed:
    "De Early Member-periode is afgelopen. Je kunt wel het reguliere abonnement kiezen.",
  already_claimed: "Je hebt al een Early Member-plek.",
  pool_not_found: "Dit abonnement doet niet mee aan de Early Member-actie.",
};

/**
 * Start een nieuwe member-signup. Vereist auth + voltooid profiel.
 *
 * 1. Valideer plan + zorg dat er geen actief/pending abbo al is.
 * 2. Bij Early Member: reserveer atomair een pool-plek (45 min hold) via
 *    reserve_early_member_slot; de webhook claimt hem bij betaling.
 * 3. Maak of hergebruik Mollie customer (opgeslagen in memberships rij).
 * 4. Insert pending membership rij (RLS-safe via admin client; insert-
 *    policy bestaat nog niet op memberships).
 * 5. Create Mollie first payment (sequenceType: first) — de klant
 *     rondt af via iDEAL/creditcard en stemt gelijktijdig in met het
 *     SEPA-mandaat voor toekomstige cyclussen.
 * 6. Koppel Mollie payment-id aan de membership en return de checkout-URL.
 */
export async function startSignup(
  planVariant: string,
  options?: StartSignupOptions
): Promise<StartSignupResult> {
  const admin = createAdminClient();
  let emReservationId: string | null = null;

  /** Geef de pool-plek direct terug bij een fout ná het reserveren. */
  async function releaseReservation(): Promise<void> {
    if (!emReservationId) return;
    try {
      await admin.rpc("cancel_early_member_reservation", {
        p_reservation_id: emReservationId,
      });
    } catch (e) {
      // Hold verloopt sowieso na het hold-window; alleen loggen.
      console.error("[startSignup] release reservation failed", e);
    }
  }

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
    const { data: plan, error: planErr } = await admin
      .from("membership_plan_catalogue")
      .select("*")
      .eq("plan_variant", planVariant)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr || !plan) {
      return { ok: false, error: "Dit abonnement is niet (meer) beschikbaar." };
    }

    // Inschrijfkosten + add-on-prijs uit booking_settings
    const { data: settings } = await admin
      .from("booking_settings")
      .select("registration_fee_cents, extended_access_price_cents")
      .eq("id", "singleton")
      .single();

    // Verlengde toegang: gratis inbegrepen bij all_inclusive, betaalde
    // add-on op vrij_trainen. Andere plan-types hebben geen vrij-trainen-
    // entitlement eronder, dus daar bestaat de add-on niet.
    const includesExtendedAccess = plan.plan_type === "all_inclusive";
    let extendedAccessPriceCents = 0;
    if (options?.extendedAccess && !includesExtendedAccess) {
      if (plan.plan_type !== "vrij_trainen") {
        return {
          ok: false,
          error: "Verlengde toegang is alleen beschikbaar bij Vrij Trainen.",
        };
      }
      extendedAccessPriceCents = settings?.extended_access_price_cents ?? 1000;
    }
    const extendedAccess =
      includesExtendedAccess ||
      (options?.extendedAccess === true && plan.plan_type === "vrij_trainen");

    // Early Member: atomaire slot-reservering vóór de betaal-flow. De RPC
    // lockt de pool-rij en is idempotent per profiel-per-pool, dus een
    // dubbele klik of retry krijgt dezelfde hold terug.
    const earlyMember = options?.earlyMember === true;
    const emPool: string | null = plan.early_member_pool ?? null;
    if (earlyMember) {
      if (!emPool) {
        return {
          ok: false,
          error: "Dit abonnement doet niet mee aan de Early Member-actie.",
        };
      }
      const { data: reservation, error: reserveErr } = await admin.rpc(
        "reserve_early_member_slot",
        { p_pool: emPool, p_profile_id: user.id }
      );
      if (reserveErr || !reservation) {
        console.error("[startSignup] reserve slot failed", reserveErr);
        return { ok: false, error: "Kon geen Early Member-plek reserveren." };
      }
      if (!reservation.ok) {
        return {
          ok: false,
          error:
            EM_RESERVE_ERRORS[String(reservation.reason)] ??
            "Kon geen Early Member-plek reserveren.",
        };
      }
      emReservationId = String(reservation.reservation_id);
    }

    // Early Member: geen inschrijfkosten.
    const registrationFeeCents: number = earlyMember
      ? 0
      : (settings?.registration_fee_cents ?? 3900);
    const totalCents: number =
      plan.price_per_cycle_cents + extendedAccessPriceCents + registrationFeeCents;

    // Mollie + env
    const mollie = getMollieClient();
    if (!mollie) {
      await releaseReservation();
      return { ok: false, error: "Betalingsprovider niet geconfigureerd." };
    }
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.themovementclub.nl";

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

    // Pending membership. Early Member-voorwaarden:
    //  - commit_months 0: de commit_end_date-trigger zet die op start_date,
    //    waardoor request_membership_cancellation via greatest(commit_end_date,
    //    current_date + 28) neerkomt op puur 4 weken opzegtermijn.
    //  - all_access-pool: prijs-lock via de bestaande lock_in_*-kolommen;
    //    de expire-on-cancel-trigger ruimt de lock op bij opzegging.
    const isAllAccessEm = earlyMember && emPool === "all_access";
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
        commit_months: earlyMember ? 0 : plan.commit_months,
        start_date: today,
        status: "pending",
        mollie_customer_id: mollieCustomerId,
        covered_pillars: plan.covered_pillars,
        source: earlyMember ? "early_member" : "direct",
        extended_access: extendedAccess,
        extended_access_price_cents: extendedAccessPriceCents,
        ...(isAllAccessEm
          ? {
              lock_in_active: true,
              lock_in_source: "early_member",
              lock_in_price_cents:
                plan.price_per_cycle_cents + extendedAccessPriceCents,
            }
          : {}),
      })
      .select("id")
      .single();
    if (insertErr || !membership) {
      console.error("[startSignup] insert membership", insertErr);
      await releaseReservation();
      return { ok: false, error: "Kon aanmelding niet opslaan." };
    }

    // Mollie first payment
    const descriptionParts = [plan.display_name];
    if (extendedAccessPriceCents > 0) descriptionParts.push("verlengde toegang");
    if (registrationFeeCents > 0) descriptionParts.push("inschrijfkosten");
    const amountValue = (totalCents / 100).toFixed(2);
    const payment = await mollie.payments.create({
      amount: { currency: "EUR", value: amountValue },
      description: `The Movement Club | ${descriptionParts.join(" + ")}`,
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
        ...(emReservationId
          ? { earlyMemberReservationId: emReservationId, earlyMemberPool: emPool }
          : {}),
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

    await emitEvent({
      type: "membership.signup_started",
      actorType: "member",
      actorId: user.id,
      subjectType: "membership",
      subjectId: membership.id,
      payload: {
        profile_id: user.id,
        membership_id: membership.id,
        plan_variant: plan.plan_variant,
        price_per_cycle_cents: plan.price_per_cycle_cents,
        early_member: earlyMember,
        early_member_pool: emPool,
        early_member_reservation_id: emReservationId,
        extended_access: extendedAccess,
      },
    });

    const checkoutUrl = payment.getCheckoutUrl();
    if (!checkoutUrl) {
      await releaseReservation();
      return { ok: false, error: "Kon betaallink niet genereren." };
    }
    return { ok: true, checkoutUrl, amountCents: totalCents };
  } catch (e) {
    console.error("[startSignup]", e);
    await releaseReservation();
    return { ok: false, error: "Er ging iets mis. Probeer opnieuw." };
  }
}
