"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { trialBookingMode } from "@/lib/mollie-mode";
import { sendNotification } from "@/lib/ntfy";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import { parsePhone } from "@/lib/phone-parse";
import { sendTrialBookingConfirmationEmail } from "@/lib/trial-booking-email";
import { clientIp } from "@/lib/trial-codes/server";
import { getOpeningTrialPeriod } from "@/lib/opening-trial/period";
import {
  OPENING_GENERIC_ERROR,
  OPENING_RATE_LIMITED_MESSAGE,
  isOpeningPeriodActive,
  openingReasonMessage,
  openingStepForReason,
} from "@/lib/opening-trial/rules";

export type StartOpeningTrialBookingResult =
  | { ok: true; redirectUrl: string }
  /**
   * step: "period" (de gratis periode is voorbij, terug naar /proefles),
   * "person" (deze persoon krijgt geen gratis proefles; de sessiekeuze helpt
   * niet), "session" (de gekozen les of het slot is niet meer bruikbaar, kies
   * een andere), of niets (fout in de invoer).
   */
  | { ok: false; error: string; step?: "period" | "person" | "session" };

interface StartOpeningTrialBookingInput {
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  /**
   * Alleen vrij trainen: de starttijd van het proefuur (ISO). De duur is altijd
   * 60 minuten en wordt, net als het kwartier en de aanwezigheid van Marlon,
   * server-side afgedwongen door tmc.book_opening_trial. Nooit een eindtijd
   * uit de client.
   */
  slotStartAt?: string;
}

const NAME_MAX = 120;
const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Gratis proefles in de openingsperiode (spec-community-growth.md par. 1
 * "Gratis openingsperiode"), voor een bezoeker zonder account. Bewust publiek
 * (geen auth-check): dat is het punt van deze flow. Geen Mollie.
 *
 * Volgorde: invoer valideren (naam, e-mail, telefoon naar E.164 met
 * libphonenumber, buitenlandse nummers toegestaan), periode (vriendelijke
 * voorcheck; de RPC beslist opnieuw), rate limiting per IP
 * (tmc.register_opening_trial_attempt, geen reset bij succes), dan de
 * atomaire RPC tmc.book_opening_trial die periode, een-per-persoon, quotum
 * van 4, capaciteit en de vrij-trainen-regels onder rijlocks afdwingt. Bij
 * succes de bevestigingsmail met annuleerlink en een stafmelding zonder
 * persoonsgegevens; die lopen na de commit en draaien de boeking nooit terug.
 */
export async function startOpeningTrialBooking(
  input: StartOpeningTrialBookingInput,
): Promise<StartOpeningTrialBookingResult> {
  const name = (input.name ?? "").trim().slice(0, NAME_MAX);
  const email = (input.email ?? "").trim().toLowerCase().slice(0, EMAIL_MAX);
  const phoneRaw = (input.phone ?? "").trim();

  if (!input.sessionId || !name || !email || !phoneRaw) {
    return { ok: false, error: openingReasonMessage("missing_fields") };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: openingReasonMessage("invalid_email") };
  }
  const phone = parsePhone(phoneRaw);
  if (!phone.ok) {
    return { ok: false, error: openingReasonMessage("invalid_phone") };
  }
  const slotStartAt = input.slotStartAt ? String(input.slotStartAt) : null;
  if (slotStartAt && !Number.isFinite(Date.parse(slotStartAt))) {
    return { ok: false, error: openingReasonMessage("slot_invalid"), step: "session" };
  }

  // Vriendelijke voorcheck; de RPC controleert de periode opnieuw.
  if (!isOpeningPeriodActive(await getOpeningTrialPeriod())) {
    return { ok: false, error: openingReasonMessage("period_closed"), step: "period" };
  }

  const admin = createAdminClient();
  const ip = await clientIp();

  const { data: attempt, error: attemptErr } = await admin.rpc(
    "register_opening_trial_attempt",
    { p_ip: ip },
  );
  if (attemptErr) {
    console.error("[startOpeningTrialBooking] register_opening_trial_attempt failed", attemptErr);
    return { ok: false, error: OPENING_GENERIC_ERROR };
  }
  if (!(attempt as { allowed?: boolean } | null)?.allowed) {
    return { ok: false, error: OPENING_RATE_LIMITED_MESSAGE };
  }

  // Publieke route: de deployment bepaalt de modus (mollie-mode.ts); een
  // preview boekt is_test en telt alleen tegen andere testrijen.
  const isTest = trialBookingMode() === "test";

  const { data, error } = await admin.rpc("book_opening_trial", {
    p_session_id: input.sessionId,
    p_name: name,
    p_email: email,
    p_phone_e164: phone.e164,
    p_is_test: isTest,
    p_slot_start_at: slotStartAt,
  });
  if (error) {
    console.error("[startOpeningTrialBooking] book_opening_trial failed", error);
    return { ok: false, error: OPENING_GENERIC_ERROR };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    trial_booking_id?: string;
    cancel_token?: string;
    session_id?: string;
    pillar?: string;
    session_start_at?: string;
    session_end_at?: string;
    slot_start_at?: string | null;
    slot_end_at?: string | null;
  };

  if (!result.ok) {
    return {
      ok: false,
      error: openingReasonMessage(result.reason),
      step: openingStepForReason(result.reason),
    };
  }

  const trialBookingId = result.trial_booking_id ?? "";

  await sendTrialBookingConfirmationEmail({
    id: trialBookingId,
    session_id: input.sessionId,
    name,
    email,
    cancel_token: result.cancel_token ?? "",
    price_paid_cents: 0,
    source: "opening",
  });

  // Stafmelding zonder persoonsgegevens (het ntfy-topic is openbaar): alleen
  // dat er een gratis proefles is geboekt, met datum en tijd.
  const startIso = result.slot_start_at ?? result.session_start_at;
  const endIso = result.slot_end_at ?? result.session_end_at;
  const whenLabel =
    startIso && endIso
      ? `${formatWeekdayDate(new Date(startIso))} · ${formatTimeRange(new Date(startIso), new Date(endIso))}`
      : "";
  void sendNotification(
    // COPY: confirm met Marlon
    result.slot_start_at ? "Gratis proefuur vrij trainen geboekt" : "Gratis proefles geboekt",
    // COPY: confirm met Marlon
    `${result.slot_start_at ? "Gratis proefuur vrij trainen" : "Gratis proefles"} geboekt${whenLabel ? `: ${whenLabel}` : ""}. Zie Proeflessen in de admin.`,
    "ticket,muscle",
  );

  return { ok: true, redirectUrl: `/proefles/boeken/bedankt?trial=${trialBookingId}` };
}
