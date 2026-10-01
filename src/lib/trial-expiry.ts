/**
 * Vervalregels voor een pending proefles (tmc.trial_bookings met status
 * 'pending' en een mollie_payment_id). Pure functies, geen I/O, zodat de
 * cron /api/cron/expire-trial-bookings en de tests dezelfde beslissing
 * delen (spec-community-growth.md, "Vrijgave van pending").
 *
 * De plek blijft bezet tot Mollie zegt dat de betaling niet meer kan
 * slagen, of tot de vervaltijd ruim voorbij is:
 *  - Mollie paid: alsnog bevestigen (het bestaande paid-pad).
 *  - Mollie expired, failed of canceled: annuleren met de passende reden.
 *  - Nog open voorbij expiresAt plus marge: annuleren als payment_expired.
 *    Mollie laat na expiresAt geen betaling meer toe, dus dit is veilig.
 *  - Onbekend bij Mollie (404): alleen annuleren als de vervaltijd voorbij
 *    is en er geen tmc.payments-rij voor dit payment-id bestaat (die zou
 *    betekenen dat er wel ooit een webhook is geweest). Komt dit in een run
 *    vaker voor dan de circuit breaker toelaat, dan annuleert de cron
 *    niets: dat wijst op een key- of profielprobleem, niet op verlopen
 *    betalingen.
 */

/** Marge na Mollie's expiresAt voordat een nog open betaling als verlopen geldt. */
export const TRIAL_EXPIRY_MARGIN_MS = 15 * 60_000;

/** Terugval als Mollie geen expiresAt geeft of de betaling onbekend is: iDEAL 15 min, kaart 30 min, plus marge. */
export const TRIAL_EXPIRY_FALLBACK_MS = 45 * 60_000;

/** Meer dan dit aantal 404's in een run: run afbreken zonder te annuleren. */
export const TRIAL_NOT_FOUND_CIRCUIT_BREAKER = 3;

export type TrialCancellationReason =
  | "payment_expired"
  | "payment_failed"
  | "payment_canceled";

export type MolliePaymentSnapshot =
  | { found: true; status: string; expiresAt: string | null }
  | { found: false };

export type TrialExpiryDecision =
  | { action: "mark_paid" }
  | {
      action: "cancel";
      reason: TrialCancellationReason;
      detail: "mollie_status" | "open_past_expiry" | "payment_not_found";
    }
  | {
      action: "leave";
      detail:
        | "open_within_window"
        | "not_found_within_window"
        | "not_found_with_payment_row";
    };

/** Mollie-eindstatus naar onze annuleringsreden; null voor alles wat niet definitief is. */
export function cancellationReasonForMollieStatus(
  status: string,
): TrialCancellationReason | null {
  switch (status) {
    case "expired":
      return "payment_expired";
    case "failed":
      return "payment_failed";
    case "canceled":
      return "payment_canceled";
    default:
      return null;
  }
}

/**
 * Het moment waarna een nog open of onbekende betaling als verlopen geldt:
 * Mollie's expiresAt plus de marge, of booked_at plus de terugval.
 */
export function trialExpiryDeadline(
  bookedAt: string,
  expiresAt: string | null,
): Date {
  const fromMollie = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isNaN(fromMollie)) {
    return new Date(fromMollie + TRIAL_EXPIRY_MARGIN_MS);
  }
  return new Date(Date.parse(bookedAt) + TRIAL_EXPIRY_FALLBACK_MS);
}

export function decideTrialExpiry(input: {
  bookedAt: string;
  payment: MolliePaymentSnapshot;
  /** Bestaat er een tmc.payments-rij voor dit mollie_payment_id. */
  hasPaymentRow: boolean;
  now: Date;
}): TrialExpiryDecision {
  const { payment, now } = input;

  if (!payment.found) {
    const deadline = trialExpiryDeadline(input.bookedAt, null);
    if (now.getTime() <= deadline.getTime()) {
      return { action: "leave", detail: "not_found_within_window" };
    }
    if (input.hasPaymentRow) {
      return { action: "leave", detail: "not_found_with_payment_row" };
    }
    return {
      action: "cancel",
      reason: "payment_expired",
      detail: "payment_not_found",
    };
  }

  if (payment.status === "paid") return { action: "mark_paid" };

  const reason = cancellationReasonForMollieStatus(payment.status);
  if (reason) return { action: "cancel", reason, detail: "mollie_status" };

  const deadline = trialExpiryDeadline(input.bookedAt, payment.expiresAt);
  if (now.getTime() > deadline.getTime()) {
    return {
      action: "cancel",
      reason: "payment_expired",
      detail: "open_past_expiry",
    };
  }
  return { action: "leave", detail: "open_within_window" };
}

/** Meer 404's dan de circuit breaker toelaat: niets annuleren. */
export function tripsCircuitBreaker(notFoundCount: number): boolean {
  return notFoundCount > TRIAL_NOT_FOUND_CIRCUIT_BREAKER;
}
