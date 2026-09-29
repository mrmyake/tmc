"use server";

import { headers } from "next/headers";
import { PaymentMethod } from "@mollie/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { trialBookingMode } from "@/lib/mollie-mode";
import { trialWebhookUrl } from "@/lib/site-url";
import { emitEvent } from "@/lib/events/emit";
import { getCatalogue } from "@/lib/catalogue";
import { sendNotification } from "@/lib/ntfy";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { sendTrialBookingConfirmationEmail } from "@/lib/trial-booking-email";
import { sendTrialCodeAbuseAlert } from "@/lib/trial-codes/abuse-alert";
import { normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { processPaymentRefund } from "@/lib/refunds/process";
import {
  isCancelTokenFormat,
  isWithinCancelWindow,
  selfCancelMessage,
} from "@/lib/trial-self-cancel";
import { buildReturnUrl, isReturnTarget, type ReturnTarget } from "@/lib/native/return-url";

export type StartTrialBookingResult =
  | { ok: true; free: false; checkoutUrl: string }
  /** Gratis via een geldige proefcode: geen Mollie, direct bevestigd. */
  | { ok: true; free: true; redirectUrl: string }
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
  /** Terugkeerdoel na Mollie (workstream A): "app" of "web"; alleen een enum. */
  returnTarget?: ReturnTarget;
  /**
   * Optionele proefcode (spec-community-growth.md §1 "Proefcodes"). Leeg:
   * de betaalde flow, byte-voor-byte ongewijzigd. Gevuld: de server
   * beslist via tmc.redeem_trial_code of de les gratis is; de prijs wordt
   * nooit client-side bepaald.
   */
  code?: string;
}

// COPY: confirm met Marlon
const CODE_INVALID_MESSAGE = "Deze proefcode is niet geldig.";
// COPY: confirm met Marlon
const CODE_EMAIL_ALREADY_BOOKED_MESSAGE =
  "Dit e-mailadres staat al ingeschreven voor deze les.";
// COPY: confirm met Marlon
const CODE_RATE_LIMITED_MESSAGE = "Te veel pogingen. Probeer het later opnieuw.";

// Weigeringen van tmc.redeem_trial_code (jsonb-reason, conventie
// book_class_session). Bestaat-niet, ingetrokken en op komen alle drie als
// code_invalid terug: de bezoeker mag niet kunnen afleiden welke codes
// bestaan. Alleen een dubbele inschrijving op dezelfde les krijgt een
// eigen tekst.
// COPY: confirm met Marlon
const REDEEM_REASON_MESSAGE: Record<string, string> = {
  code_invalid: CODE_INVALID_MESSAGE,
  email_already_booked: CODE_EMAIL_ALREADY_BOOKED_MESSAGE,
  missing_fields: "Vul alle velden in.",
  capacity_full: "Deze sessie is helaas vol.",
  session_not_found: "Deze sessie bestaat niet (meer).",
  session_not_scheduled: "Deze sessie is niet meer beschikbaar.",
  session_in_past: "Deze sessie is al voorbij.",
  session_not_trial_eligible: "Deze discipline is niet beschikbaar als proefles.",
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

interface RedeemArgs {
  code: string;
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  isTest: boolean;
}

/**
 * Gratis pad: rate limiting per IP (tmc.register_trial_code_attempt, het
 * patroon van register_kiosk_pin_attempt), daarna de atomaire
 * inwissel-RPC. Bij succes wordt de pogingenteller gewist, de bezoeker
 * krijgt dezelfde bevestigingsmail als een betaalde proefles (zonder
 * prijsregel) en bij een herhaalde gratis proefles van hetzelfde
 * e-mailadres gaat de misbruikmelding naar Marlon en Ilja. Mail en
 * melding lopen na de commit van de boeking en draaien die nooit terug.
 */
async function redeemTrialCodeBooking(args: RedeemArgs): Promise<StartTrialBookingResult> {
  const admin = createAdminClient();
  const ip = await clientIp();

  const { data: attempt, error: attemptErr } = await admin.rpc(
    "register_trial_code_attempt",
    { p_ip: ip },
  );
  if (attemptErr) {
    console.error("[startTrialBooking] register_trial_code_attempt failed", attemptErr);
    return { ok: false, error: CODE_INVALID_MESSAGE };
  }
  if (!(attempt as { allowed?: boolean } | null)?.allowed) {
    return { ok: false, error: CODE_RATE_LIMITED_MESSAGE };
  }

  const { data, error } = await admin.rpc("redeem_trial_code", {
    p_code: args.code,
    p_session_id: args.sessionId,
    p_name: args.name,
    p_email: args.email,
    p_phone: args.phone,
    p_is_test: args.isTest,
  });
  if (error) {
    console.error("[startTrialBooking] redeem_trial_code failed", error);
    // COPY: confirm met Marlon
    return { ok: false, error: "Boeken lukte niet. Probeer het opnieuw." };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    trial_booking_id?: string;
    cancel_token?: string;
    code_id?: string;
    code?: string;
    session_id?: string;
    session_start_at?: string;
    prior_free_count?: number;
  };

  if (!result.ok) {
    return {
      ok: false,
      error:
        REDEEM_REASON_MESSAGE[result.reason ?? ""] ??
        // COPY: confirm met Marlon
        "Boeken lukte niet. Probeer het opnieuw.",
    };
  }

  // Geslaagd: de teller van dit IP mag weg (zelfde patroon als de kiosk).
  const { error: clearErr } = await admin.from("trial_code_attempts").delete().eq("ip", ip);
  if (clearErr) console.error("[startTrialBooking] teller-reset", clearErr);

  const trialBookingId = result.trial_booking_id ?? "";
  const cancelToken = result.cancel_token ?? "";

  await sendTrialBookingConfirmationEmail({
    id: trialBookingId,
    session_id: args.sessionId,
    name: args.name,
    email: args.email,
    cancel_token: cancelToken,
    price_paid_cents: 0,
  });

  // Staf-melding zonder persoonsgegevens (PR #205): het topic is openbaar.
  void sendNotification(
    "Proefles geboekt met code!",
    `Proefles-boeking ${trialBookingId} is gratis geboekt met code ${result.code ?? "?"}. Zie de sessie in het admin-rooster.`,
    "ticket,muscle",
  );

  if ((result.prior_free_count ?? 0) > 0) {
    const { data: session } = await admin
      .from("class_sessions")
      .select("start_at, end_at, class_type:class_types(name)")
      .eq("id", args.sessionId)
      .maybeSingle();
    type ClassTypeRel = { name: string } | { name: string }[] | null;
    const classTypeRaw = session?.class_type as ClassTypeRel;
    const className = Array.isArray(classTypeRaw)
      ? (classTypeRaw[0]?.name ?? "Proefles")
      : (classTypeRaw?.name ?? "Proefles");
    const startAt = new Date(session?.start_at ?? result.session_start_at ?? Date.now());
    const endAt = session?.end_at ? new Date(session.end_at) : startAt;

    await sendTrialCodeAbuseAlert({
      trialBookingId,
      codeId: result.code_id ?? "",
      code: result.code ?? args.code,
      name: args.name,
      email: args.email,
      phone: args.phone,
      className,
      whenLabel: `${formatWeekdayDate(startAt)} · ${formatTimeRange(startAt, endAt)}`,
    });
  }

  return {
    ok: true,
    free: true,
    redirectUrl: `/proefles/boeken/bedankt?trial=${trialBookingId}`,
  };
}

/**
 * Start een proefles-boeking voor een bezoeker zonder account. Bewust
 * publiek (geen auth.getUser()-check): dit is precies het punt van
 * deze flow, zie spec-community-growth.md §1.
 *
 * Volgorde: valideer sessie + capaciteit, insert pending trial_booking,
 * maak een one-off Mollie-betaling (geen sequenceType, dus Mollie's
 * oneoff-modus), koppel het payment-id. Bevestiging via de webhook,
 * niet hier.
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

  // Publieke route: de deployment bepaalt de modus (mollie-mode.ts).
  const mode = trialBookingMode();

  // Proefcode ingevuld: het gratis pad. Alle checks hierboven (sessie,
  // discipline, capaciteits-voorcheck) gelden ook hier; de RPC herhaalt ze
  // onder de rijlocks en beslist als enige of de les gratis is.
  const code = normalizeTrialCode(input.code ?? "");
  if (code) {
    return redeemTrialCodeBooking({
      code,
      sessionId: session.id,
      name,
      email,
      phone,
      isTest: mode === "test",
    });
  }

  const mollie = getMollieClient(mode);
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
      // Snapshot van de deployment-modus (PR 5): testrijen tellen niet mee
      // in de bezetting en niet in de omzet.
      is_test: mode === "test",
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
      redirectUrl: buildReturnUrl(
        url,
        `/proefles/boeken/bedankt?trial=${trial.id}`,
        isReturnTarget(input.returnTarget) ? input.returnTarget : "web",
      ),
      webhookUrl: trialWebhookUrl(mode),
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

  return { ok: true, free: false, checkoutUrl };
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
  /**
   * De knop mag getoond worden: status 'paid' en de les is nog niet
   * begonnen. Sinds de zelfservice-refund ook na de termijn (zoals leden),
   * dan zonder terugbetaling; zie withinWindow.
   */
  canCancel: boolean;
  /** Nu binnen de annuleringstermijn (inclusief de grens). Alleen weergave; de RPC beslist. */
  withinWindow: boolean;
  /** 0 bij een codeboeking. */
  pricePaidCents: number;
  /**
   * True wanneer deze boeking via een proefcode is ontstaan en die code na
   * de release-trigger weer bruikbaar is (niet ingetrokken en niet op).
   * De annuleerpagina toont dan expliciet dat de code opnieuw te gebruiken is.
   */
  codeStillUsable: boolean;
}

export async function getTrialBookingByToken(
  token: string,
): Promise<TrialBookingSummary | null> {
  const admin = createAdminClient();

  // Sinds proefcodes v2 is er nog een FK tussen de twee tabellen
  // (trial_bookings.trial_code_id); de expliciete naam blijft staan als
  // documentatie van de joinrichting.
  const { data: trial } = await admin
    .from("trial_bookings")
    .select(
      `
        id, name, status, cancelled_at, price_paid_cents,
        session:class_sessions(start_at, end_at, class_type:class_types(name)),
        trial_code:trial_codes!trial_bookings_trial_code_id_fkey(revoked_at, max_uses, uses_count)
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

  const now = new Date();
  const withinWindow = isWithinCancelWindow(new Date(startAt), windowHours, now);
  const notStarted = new Date(startAt).getTime() > now.getTime();

  type TrialCodeRow = {
    revoked_at: string | null;
    max_uses: number | null;
    uses_count: number;
  };
  type TrialCodeRel = TrialCodeRow | TrialCodeRow[] | null;
  const trialCodeRaw = trial.trial_code as unknown as TrialCodeRel;
  const trialCode = Array.isArray(trialCodeRaw)
    ? (trialCodeRaw[0] ?? null)
    : trialCodeRaw;
  const codeStillUsable = Boolean(
    trialCode &&
      trialCode.revoked_at === null &&
      (trialCode.max_uses === null || trialCode.uses_count < trialCode.max_uses),
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
    canCancel: trial.status === "paid" && !trial.cancelled_at && notStarted,
    withinWindow,
    pricePaidCents: trial.price_paid_cents ?? 0,
    codeStillUsable,
  };
}

export type CancelTrialBookingResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Zelfservice-annulering via de annuleerlink, beleid identiek aan leden
 * (spec-community-growth.md §1, cancel_class_booking): binnen de termijn
 * uit booking_settings volledige terugbetaling, daarna annuleren zonder
 * terugbetaling (reden 'late'). Een no-show verbeurt de betaalde prijs.
 */
export async function cancelTrialBooking(
  token: string,
): Promise<CancelTrialBookingResult> {
  // COPY: confirm met Marlon
  const NOT_FOUND = "Boeking niet gevonden.";
  if (!isCancelTokenFormat(token)) {
    return { ok: false, message: NOT_FOUND };
  }

  // De database beslist: termijn uit booking_settings (inclusief de grens,
  // zoals cancel_class_booking voor leden), annulering, reden en
  // refund-intentie in een transactie (tmc.visitor_cancel_trial_booking,
  // alleen service_role). Na de termijn annuleert hij zonder intentie.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("visitor_cancel_trial_booking", {
    p_token: token,
  });

  if (error) {
    console.error("[cancelTrialBooking] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Annuleren lukte niet. Probeer opnieuw." };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    price_paid_cents?: number;
    refund_id?: string | null;
    refund_skipped?: string | null;
    within_window?: boolean;
    cancellation_window_hours?: number;
  };

  if (!result.ok) {
    if (result.reason === "booking_not_open") {
      return {
        ok: false,
        // COPY: confirm met Marlon
        message: "Deze boeking staat niet (meer) open om te annuleren.",
      };
    }
    if (result.reason === "booking_not_found") {
      return { ok: false, message: NOT_FOUND };
    }
    console.error("[cancelTrialBooking] refused", result.reason);
    // COPY: confirm met Marlon
    return { ok: false, message: "Annuleren lukte niet. Probeer opnieuw." };
  }

  // Terugbetaling via het enige refund-pad. Een mislukking laat de
  // intentie als failed staan met retry-knop voor de admin; de bezoeker
  // krijgt de toezegging hoe dan ook, zonder termijn. Geen mail bij
  // zelfservice (besluit spec-community-growth.md §1).
  if (result.refund_id) {
    const refund = await processPaymentRefund(result.refund_id);
    if (!refund.ok) {
      console.error("[cancelTrialBooking] refund niet ingediend", result.refund_id, refund.message);
    }
  }

  // Verse read na de update: de release-trigger heeft het gebruik intussen
  // al teruggegeven aan de code (released_at gezet, uses_count omlaag).
  const refreshed = await getTrialBookingByToken(token);

  return {
    ok: true,
    message: selfCancelMessage({
      withinWindow: Boolean(result.within_window),
      pricePaidCents: result.price_paid_cents ?? 0,
      refundRequested:
        Boolean(result.refund_id) || result.refund_skipped === "refund_already_active",
      codeStillUsable: Boolean(refreshed?.codeStillUsable),
      windowHours: result.cancellation_window_hours ?? refreshed?.cancellationWindowHours ?? 6,
    }),
  };
}
