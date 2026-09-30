"use server";

import { PaymentMethod } from "@mollie/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { trialBookingMode } from "@/lib/mollie-mode";
import { trialWebhookUrl } from "@/lib/site-url";
import { emitEvent } from "@/lib/events/emit";
import { getCatalogue } from "@/lib/catalogue";
import { sendNotification } from "@/lib/ntfy";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { bookingTimes } from "@/lib/member/booking-times";
import { sendTrialBookingConfirmationEmail } from "@/lib/trial-booking-email";
import { sendTrialCodeAbuseAlert } from "@/lib/trial-codes/abuse-alert";
import {
  clearTrialCodeCookie,
  clientIp,
  readTrialCodeCookie,
} from "@/lib/trial-codes/server";
import {
  CODE_INVALID_MESSAGE,
  CODE_NOT_AVAILABLE_MESSAGE,
  CODE_RATE_LIMITED_MESSAGE,
} from "@/lib/trial-codes/messages";
import { processPaymentRefund } from "@/lib/refunds/process";
import {
  isCancelTokenFormat,
  isFreeAfterReschedule,
  isWithinCancelWindow,
  selfCancelMessage,
} from "@/lib/trial-self-cancel";
import { buildReturnUrl, isReturnTarget, type ReturnTarget } from "@/lib/native/return-url";

export type StartTrialBookingResult =
  | { ok: true; free: false; checkoutUrl: string }
  /** Gratis via een geldige proefcode: geen Mollie, direct bevestigd. */
  | { ok: true; free: true; redirectUrl: string }
  /**
   * step: waar de code-modus naartoe terug moet. "code" = de code is niet
   * (meer) geldig, terug naar de codestap; "session" = de sessie is vol of
   * niet meer boekbaar, terug naar de sessiekiezer (code blijft geldig).
   */
  | { ok: false; error: string; step?: "code" | "session" };

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
   * Alleen code-modus met een vrij-trainen-code: de starttijd van het proefuur
   * (ISO). De duur is altijd 60 minuten en wordt, net als de scope, het
   * kwartier en de aanwezigheid van Marlon, server-side afgedwongen door
   * tmc.redeem_trial_code. Nooit een eindtijd uit de client.
   */
  slotStartAt?: string;
  /**
   * "paid" (standaard): de betaalde flow, negeert een aanwezig codecookie
   * volledig. "code": de gratis flow van /proefles/code; de code komt
   * uitsluitend uit het ondertekende httpOnly-cookie (nooit uit de input) en
   * tmc.redeem_trial_code beslist bij het boeken of de les gratis is. De
   * prijs en het overslaan van Mollie worden nooit client-side bepaald.
   */
  mode?: "paid" | "code";
}

// COPY: confirm met Marlon
const CODE_EMAIL_ALREADY_BOOKED_MESSAGE =
  "Dit e-mailadres staat al ingeschreven voor deze les.";
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
  // COPY: confirm met Marlon
  scope_mismatch: "Je code is niet geldig voor deze les. Kies een les uit de lijst.",
  scope_not_available: CODE_NOT_AVAILABLE_MESSAGE,
  // Vrij trainen via een code (PR 2): de server beslist over het slot.
  // COPY: confirm met Marlon
  slot_required: "Kies eerst een starttijd.",
  // COPY: confirm met Marlon
  slot_invalid: "Deze starttijd is niet beschikbaar. Kies een andere.",
  // COPY: confirm met Marlon
  slot_in_past: "Deze starttijd is al voorbij. Kies een andere.",
  // COPY: confirm met Marlon
  slot_outside_session: "Deze starttijd is niet beschikbaar. Kies een andere.",
  // COPY: confirm met Marlon
  outside_presence: "Vrij trainen met een proefcode kan alleen als Marlon er is. Kies een andere starttijd.",
  // COPY: confirm met Marlon
  slot_blocked: "Op dat moment is er een les. Kies een andere starttijd.",
  // COPY: confirm met Marlon
  slot_full: "Net iemand je voor: dit uur is niet meer vrij. Kies een andere starttijd.",
  slot_not_allowed: "Boeken lukte niet. Probeer het opnieuw.",
};

/** Terug naar de codestap of de sessiekiezer, per weigering van de RPC. */
function stepForReason(reason: string | undefined): "code" | "session" | undefined {
  if (reason === "code_invalid" || reason === "scope_not_available") return "code";
  if (
    reason === "capacity_full" ||
    reason === "session_not_found" ||
    reason === "session_not_scheduled" ||
    reason === "session_in_past" ||
    reason === "session_not_trial_eligible" ||
    reason === "scope_mismatch" ||
    reason === "slot_required" ||
    reason === "slot_invalid" ||
    reason === "slot_in_past" ||
    reason === "slot_outside_session" ||
    reason === "outside_presence" ||
    reason === "slot_blocked" ||
    reason === "slot_full" ||
    reason === "slot_not_allowed"
  ) {
    return "session";
  }
  return undefined;
}

interface RedeemArgs {
  code: string;
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  isTest: boolean;
  /** Vrij-trainen-code: start van het proefuur (ISO), anders null. */
  slotStartAt: string | null;
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
    p_slot_start_at: args.slotStartAt,
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
    slot_start_at?: string | null;
    slot_end_at?: string | null;
    prior_free_count?: number;
  };

  if (!result.ok) {
    const step = stepForReason(result.reason);
    // Code niet (meer) geldig: cookie weg, de bezoeker begint bij de
    // codestap. Bij capacity_full en session_* blijft het cookie staan.
    if (step === "code") await clearTrialCodeCookie();
    return {
      ok: false,
      error:
        REDEEM_REASON_MESSAGE[result.reason ?? ""] ??
        // COPY: confirm met Marlon
        "Boeken lukte niet. Probeer het opnieuw.",
      step,
    };
  }

  // Geslaagd: het cookie is verbruikt (een volgende boeking vraagt weer
  // om een codestap).
  await clearTrialCodeCookie();

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
  // Bij een proefuur vrij trainen alleen dat er een proefuur is geboekt, met
  // datum en tijd van het slot; geen naam, code of boeking-id.
  if (result.slot_start_at && result.slot_end_at) {
    const slotStart = new Date(result.slot_start_at);
    const slotEnd = new Date(result.slot_end_at);
    void sendNotification(
      // COPY: confirm met Marlon
      "Proefuur vrij trainen geboekt!",
      // COPY: confirm met Marlon
      `Proefuur vrij trainen geboekt: ${formatWeekdayDate(slotStart)} · ${formatTimeRange(slotStart, slotEnd)}. Zie Proefuren vandaag in het admin-rooster.`,
      "ticket,muscle",
    );
  } else {
    void sendNotification(
      "Proefles geboekt met code!",
      `Proefles-boeking ${trialBookingId} is gratis geboekt met code ${result.code ?? "?"}. Zie de sessie in het admin-rooster.`,
      "ticket,muscle",
    );
  }

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
    const times = bookingTimes(
      { slot_start_at: result.slot_start_at, slot_end_at: result.slot_end_at },
      {
        start_at: session?.start_at ?? result.session_start_at ?? new Date().toISOString(),
        end_at: session?.end_at ?? session?.start_at ?? result.session_start_at ?? new Date().toISOString(),
      },
    );
    const startAt = new Date(times.startAt);
    const endAt = new Date(times.endAt);

    await sendTrialCodeAbuseAlert({
      trialBookingId,
      codeId: result.code_id ?? "",
      code: result.code ?? args.code,
      name: args.name,
      email: args.email,
      phone: args.phone,
      // COPY: confirm met Marlon
      className: result.slot_start_at ? "Vrij trainen" : className,
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

  // Code-modus: de code komt alleen uit het ondertekende cookie. Zonder
  // geldig cookie is er geen gratis pad, dan terug naar de codestap.
  const codeMode = input.mode === "code";
  let code: string | null = null;
  if (codeMode) {
    code = await readTrialCodeCookie();
    if (!code) {
      return { ok: false, error: CODE_INVALID_MESSAGE, step: "code" };
    }
  }

  const admin = createAdminClient();

  const { data: session, error: sessionErr } = await admin
    .from("class_sessions")
    .select("id, pillar, start_at, status")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    return { ok: false, error: "Deze sessie bestaat niet (meer).", step: "session" };
  }
  if (session.status !== "scheduled") {
    return { ok: false, error: "Deze sessie is niet meer beschikbaar.", step: "session" };
  }
  // Een vrij-trainen-dagsessie begint 's ochtends; het proefuur zelf wordt
  // server-side tegen nu gecontroleerd (slot_in_past), dus hier geen
  // sessiestartcheck voor de code-modus op vrij trainen.
  const freeTrainingViaCode = codeMode && session.pillar === "vrij_trainen";
  if (!freeTrainingViaCode && new Date(session.start_at) <= new Date()) {
    return { ok: false, error: "Deze sessie is al voorbij.", step: "session" };
  }

  // Vrij trainen via een code: geen drop-in-prijs, geen sessiecapaciteit (de
  // RPC telt het maximum per kwartier onder de sessielock). Alles wat de
  // toegang bepaalt (scope, slot, aanwezigheid, maximum) beslist de RPC.
  if (freeTrainingViaCode && code) {
    return redeemTrialCodeBooking({
      code,
      sessionId: session.id,
      name,
      email,
      phone,
      isTest: trialBookingMode() === "test",
      slotStartAt: input.slotStartAt ?? null,
    });
  }

  const catalogue = await getCatalogue();
  const dropInSlug = dropInSlugForPillar(session.pillar);
  const priceCents = dropInSlug ? (catalogue.get(dropInSlug)?.price_cents ?? null) : null;
  if (priceCents === null) {
    return {
      ok: false,
      error: "Deze discipline is niet beschikbaar als proefles.",
      step: "session",
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
    return { ok: false, error: "Deze sessie is helaas vol.", step: "session" };
  }

  // Publieke route: de deployment bepaalt de modus (mollie-mode.ts).
  const mode = trialBookingMode();

  // Code-modus: het gratis pad. Alle checks hierboven (sessie, discipline,
  // capaciteits-voorcheck) gelden ook hier; de RPC herhaalt ze onder de
  // rijlocks en beslist als enige of de les gratis is. De betaalde modus
  // komt hier nooit, ook niet met een codecookie.
  if (codeMode && code) {
    return redeemTrialCodeBooking({
      code,
      sessionId: session.id,
      name,
      email,
      phone,
      isTest: mode === "test",
      slotStartAt: null,
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
  /**
   * Nu kosteloos te annuleren: binnen de annuleringstermijn (inclusief de
   * grens), of de les is na de boeking verschoven en nog niet begonnen.
   * Alleen weergave; de RPC beslist.
   */
  withinWindow: boolean;
  /** De les is na deze boeking eenmalig verschoven (kosteloos tot de start). */
  freeAfterReschedule: boolean;
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
        id, name, status, cancelled_at, price_paid_cents, booked_at,
        slot_start_at, slot_end_at,
        session:class_sessions(start_at, end_at, rescheduled_at, class_type:class_types(name)),
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
    rescheduled_at: string | null;
    class_type: { name: string } | { name: string }[] | null;
  } | null;
  const session = trial.session as unknown as SessionRel;
  // Een proefuur vrij trainen rekent en toont het slot, niet de dagsessie.
  const nowIso = new Date().toISOString();
  const times = bookingTimes(
    { slot_start_at: trial.slot_start_at, slot_end_at: trial.slot_end_at },
    { start_at: session?.start_at ?? nowIso, end_at: session?.end_at ?? session?.start_at ?? nowIso },
  );
  const startAt = times.startAt;
  const endAt = times.endAt;
  const classTypeRaw = session?.class_type;
  const className = trial.slot_start_at
    ? // COPY: confirm met Marlon
      "Vrij trainen"
    : Array.isArray(classTypeRaw)
      ? (classTypeRaw[0]?.name ?? "Proefles")
      : (classTypeRaw?.name ?? "Proefles");

  const now = new Date();
  // Zelfde regel als visitor_cancel_trial_booking: binnen de termijn, of
  // geboekt voor een verschuiving en de les is nog niet begonnen.
  const freeAfterReschedule = isFreeAfterReschedule({
    bookedAt: new Date(trial.booked_at),
    rescheduledAt: session?.rescheduled_at ? new Date(session.rescheduled_at) : null,
    startAt: new Date(startAt),
    now,
  });
  const withinWindow =
    isWithinCancelWindow(new Date(startAt), windowHours, now) || freeAfterReschedule;
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
    freeAfterReschedule,
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
