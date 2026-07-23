"use server";

import { PaymentMethod } from "@mollie/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { emitEvent } from "@/lib/events/emit";
import { getCatalogue } from "@/lib/catalogue";

export type StartTrialBookingResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

/**
 * Catalogusslug per pillar (geen apart proefles-tarief, besluit
 * spec-community-growth.md §1: de proefles betaalt gewoon het drop-in-
 * tarief). yoga_mobility en kettlebell delen dezelfde 'drop_in'-rij (die
 * twee tarieven zijn altijd gelijk geweest, zie tmc.catalogue-seed).
 * vrij_trainen heeft bewust geen drop-in-slug en is dus niet boekbaar als
 * proefles.
 */
function dropInSlugForPillar(pillar: string): string | null {
  switch (pillar) {
    case "yoga_mobility":
    case "kettlebell":
      return "drop_in";
    case "kids":
      return "drop_in_kids";
    case "senior":
      return "drop_in_senior";
    default:
      return null;
  }
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

interface StartTrialBookingInput {
  sessionId: string;
  name: string;
  email: string;
  phone: string;
}

/**
 * Start een proefles-boeking voor een bezoeker zonder account. Bewust
 * publiek (geen auth.getUser()-check): dit is precies het punt van
 * deze flow, zie spec-community-growth.md §1.
 *
 * Volgorde: valideer sessie + capaciteit, insert pending trial_booking,
 * maak een one-off Mollie-betaling (geen sequenceType, dus Mollie's
 * oneoff-modus, zelfde patroon als de crowdfunding-checkout), koppel
 * het payment-id. Bevestiging via de webhook, niet hier.
 */
export async function startTrialBooking(
  input: StartTrialBookingInput,
): Promise<StartTrialBookingResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!input.sessionId || !name || !email || !phone) {
    return { ok: false, error: "Vul alle velden in." };
  }

  const admin = createAdminClient();

  const { data: session, error: sessionErr } = await admin
    .from("class_sessions")
    .select("id, pillar, start_at, status")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    return { ok: false, error: "Deze sessie bestaat niet (meer)." };
  }
  if (session.status !== "scheduled") {
    return { ok: false, error: "Deze sessie is niet meer beschikbaar." };
  }
  if (new Date(session.start_at) <= new Date()) {
    return { ok: false, error: "Deze sessie is al voorbij." };
  }

  const catalogue = await getCatalogue();
  const dropInSlug = dropInSlugForPillar(session.pillar);
  const priceCents = dropInSlug ? (catalogue.get(dropInSlug)?.price_cents ?? null) : null;
  if (priceCents === null) {
    return {
      ok: false,
      error: "Deze discipline is niet beschikbaar als proefles.",
    };
  }

  const { data: availability } = await admin
    .from("v_session_availability")
    .select("spots_available")
    .eq("id", session.id)
    .maybeSingle();
  // spots_available NULL betekent onbeperkte capaciteit (alleen kettlebell):
  // nooit vol. Geen rij gevonden blijft, net als voorheen, vol.
  const trialSpots =
    availability === null ? 0 : availability.spots_available;
  if (trialSpots !== null && trialSpots <= 0) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Deze sessie is helaas vol." };
  }

  const mollie = getMollieClient();
  if (!mollie) {
    return { ok: false, error: "Betalingsprovider niet geconfigureerd." };
  }

  const { data: trial, error: insertErr } = await admin
    .from("trial_bookings")
    .insert({
      session_id: session.id,
      name,
      email,
      phone,
      price_paid_cents: priceCents,
      status: "pending",
    })
    .select("id, cancel_token")
    .single();

  if (insertErr || !trial) {
    // De databasetrigger (enforce_session_capacity, migratie 20260811) is
    // de harde grens: hij vangt de race af waarin twee bezoekers
    // tegelijk de laatste plek zagen. De view-check hierboven is alleen
    // de vriendelijke voorcheck.
    if (insertErr?.message?.includes("session_capacity_exceeded")) {
      // COPY: confirm met Marlon
      return { ok: false, error: "Deze sessie is helaas vol." };
    }
    console.error("[startTrialBooking] insert failed", insertErr);
    return { ok: false, error: "Kon boeking niet opslaan." };
  }

  const amountValue = (priceCents / 100).toFixed(2);
  const url = siteUrl();

  let payment;
  try {
    payment = await mollie.payments.create({
      amount: { currency: "EUR", value: amountValue },
      description: "The Movement Club | Proefles",
      redirectUrl: `${url}/proefles/boeken/bedankt?trial=${trial.id}`,
      webhookUrl: `${url}/api/trial-bookings/webhook`,
      // Een pending-rij houdt een plek bezet tot Mollie de betaling laat
      // verlopen, en die vervaltijd is per methode: iDEAL 15 min, kaart
      // 30 min, maar Klarna/in3 48 uur en bankoverschrijving 12+ dagen.
      // De Payments API kent geen expiresAt-parameter (alleen Payment
      // Links hebben die), dus we begrenzen de reserveringsduur door de
      // methodekeuze expliciet te beperken tot iDEAL en kaart: maximaal
      // 30 min plek-bezetting per betaalpoging. De expire-orders cron is
      // de backstop voor gemiste webhooks.
      method: [PaymentMethod.ideal, PaymentMethod.creditcard],
      metadata: {
        trialBookingId: trial.id,
        sessionId: session.id,
      },
    });
  } catch (err) {
    console.error("[startTrialBooking] mollie payment create failed", err);
    // Geen betaling gelukt, dus geen echte plek-claim: de pending-rij
    // direct opruimen. Anders houdt een mislukte betaalpoging een
    // "spookplek" bezet in v_session_availability.
    await admin.from("trial_bookings").delete().eq("id", trial.id);
    return { ok: false, error: "Betaling starten lukte niet. Probeer opnieuw." };
  }

  await admin
    .from("trial_bookings")
    .update({ mollie_payment_id: payment.id })
    .eq("id", trial.id);

  await emitEvent({
    type: "trial_booking.created",
    actorType: "visitor",
    actorId: null,
    subjectType: "trial_booking",
    subjectId: trial.id,
    payload: {
      session_id: session.id,
      price_paid_cents: priceCents,
    },
  });

  const checkoutUrl = payment.getCheckoutUrl();
  if (!checkoutUrl) {
    return { ok: false, error: "Kon betaallink niet genereren." };
  }

  return { ok: true, checkoutUrl };
}

interface TrialBookingSummary {
  id: string;
  name: string;
  status: string;
  cancelledAt: string | null;
  sessionStartAt: string;
  sessionEndAt: string;
  sessionClassName: string;
  cancellationWindowHours: number;
  canCancel: boolean;
  /**
   * True wanneer deze boeking via een trial_code is ontstaan en die code
   * (na de release-trigger uit community-growth PR B) weer 'active' en
   * niet verlopen is. Community-growth PR D §7: de annuleerpagina moet
   * expliciet tonen dat de code weer bruikbaar is.
   */
  codeStillUsable: boolean;
}

export async function getTrialBookingByToken(
  token: string,
): Promise<TrialBookingSummary | null> {
  const admin = createAdminClient();

  // trial_bookings en trial_codes hebben twee FK's naar elkaar
  // (trial_bookings.trial_code_id en trial_codes.trial_booking_id);
  // PostgREST kan de relatie niet raden zonder de expliciete FK-naam
  // (zie PR #118). Deze select gaat van trial_bookings naar trial_codes
  // via trial_bookings.trial_code_id, dus de constraint hier is
  // trial_bookings_trial_code_id_fkey (niet de omgekeerde
  // trial_codes_trial_booking_id_fkey uit PR #118).
  const { data: trial } = await admin
    .from("trial_bookings")
    .select(
      `
        id, name, status, cancelled_at,
        session:class_sessions(start_at, end_at, class_type:class_types(name)),
        trial_code:trial_codes!trial_bookings_trial_code_id_fkey(status, expires_at)
      `,
    )
    .eq("cancel_token", token)
    .maybeSingle();

  if (!trial) return null;

  const { data: settings } = await admin
    .from("booking_settings")
    .select("cancellation_window_hours")
    .limit(1)
    .maybeSingle();
  const windowHours = settings?.cancellation_window_hours ?? 6;

  type SessionRel = {
    start_at: string;
    end_at: string;
    class_type: { name: string } | { name: string }[] | null;
  } | null;
  const session = trial.session as unknown as SessionRel;
  const startAt = session?.start_at ?? new Date().toISOString();
  const endAt = session?.end_at ?? startAt;
  const classTypeRaw = session?.class_type;
  const className = Array.isArray(classTypeRaw)
    ? (classTypeRaw[0]?.name ?? "Proefles")
    : (classTypeRaw?.name ?? "Proefles");

  const hoursUntil =
    (new Date(startAt).getTime() - Date.now()) / (1000 * 60 * 60);

  type TrialCodeRel = { status: string; expires_at: string } | { status: string; expires_at: string }[] | null;
  const trialCodeRaw = trial.trial_code as unknown as TrialCodeRel;
  const trialCode = Array.isArray(trialCodeRaw)
    ? (trialCodeRaw[0] ?? null)
    : trialCodeRaw;
  const codeStillUsable = Boolean(
    trialCode &&
      trialCode.status === "active" &&
      new Date(trialCode.expires_at) > new Date(),
  );

  return {
    id: trial.id,
    name: trial.name,
    status: trial.status,
    cancelledAt: trial.cancelled_at,
    sessionStartAt: startAt,
    sessionEndAt: endAt,
    sessionClassName: className,
    cancellationWindowHours: windowHours,
    canCancel:
      trial.status === "paid" &&
      !trial.cancelled_at &&
      hoursUntil >= windowHours,
    codeStillUsable,
  };
}

export type CancelTrialBookingResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Zelfde annuleringsbeleid als leden (spec-community-growth.md §1):
 * zelfde cancellation window, en een no-show verbeurt gewoon de al
 * betaalde prijs. Geen aparte handhaving nodig, alleen dit venster.
 */
export async function cancelTrialBooking(
  token: string,
): Promise<CancelTrialBookingResult> {
  const summary = await getTrialBookingByToken(token);
  if (!summary) {
    return { ok: false, message: "Boeking niet gevonden." };
  }
  if (summary.status !== "paid") {
    return {
      ok: false,
      message: "Deze boeking staat niet (meer) open om te annuleren.",
    };
  }
  if (!summary.canCancel) {
    return {
      ok: false,
      message: `Annuleren kan tot ${summary.cancellationWindowHours} uur van tevoren. Neem contact op als er iets tussenkomt.`,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("trial_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", summary.id)
    .eq("status", "paid");

  if (error) {
    console.error("[cancelTrialBooking] update failed", error);
    return { ok: false, message: "Annuleren lukte niet. Probeer opnieuw." };
  }

  await emitEvent({
    type: "trial_booking.cancelled",
    actorType: "visitor",
    actorId: null,
    subjectType: "trial_booking",
    subjectId: summary.id,
    payload: {},
  });

  // Verse read na de update: de release-trigger (PR B) heeft de code
  // intussen al teruggezet naar 'active' als hij niet verlopen was.
  const refreshed = await getTrialBookingByToken(token);
  const message = refreshed?.codeStillUsable
    ? // COPY: confirm met Marlon
      "Je proefles is geannuleerd. Je code is weer te gebruiken voor een andere les."
    : // COPY: confirm met Marlon
      "Je proefles is geannuleerd.";

  return { ok: true, message };
}
