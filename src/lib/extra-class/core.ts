/**
 * Extra les bijkopen (spec-weekcap-extra-les.md): pure regels zonder I/O,
 * gedeeld door de server action, de webhook, de cron en de tests.
 *
 *  - De plek wordt 20 minuten vastgehouden (hold_expires_at, gezet door
 *    tmc.start_extra_class_booking). Mollie's Payments API kent geen
 *    expiresAt bij het aanmaken (alleen Payment Links hebben die), dus de
 *    houdtijd is van ons: betaalmethodes beperkt tot iDEAL en kaart (zelf
 *    hooguit 15 en 30 minuten geldig), de cron sluit verlopen rijen elke
 *    vijf minuten, en een betaling die daarna nog binnenkomt wordt in de
 *    webhook alsnog bevestigd als er plek is en het lid binnen de regels
 *    valt, anders terugbetaald (tmc.confirm_extra_class_booking).
 */

export const EXTRA_CLASS_HOLD_MINUTES = 20;

/** Zonder payment-id (payments.create mislukt en opruimen ook): na zoveel minuten vrijgeven. */
export const EXTRA_CLASS_ORPHAN_MINUTES = 5;

export type ExtraClassOutcome = "paid" | "failed" | "expired" | "canceled";

/** Mollie-status naar de uitkomst voor tmc.confirm_extra_class_booking; null zolang de betaling open is. */
export function outcomeForMollieStatus(status: string): ExtraClassOutcome | null {
  switch (status) {
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

export type HoldDecision =
  | { action: "confirm" }
  | { action: "release"; outcome: Exclude<ExtraClassOutcome, "paid">; detail: "mollie_status" | "hold_expired" | "orphan" }
  | { action: "leave"; detail: "open_within_hold" | "orphan_within_grace" | "payment_unknown" };

/**
 * Beslissing van de cron voor een pending rij. Mollie's eindstatus wint;
 * daarna is onze houdtijd leidend (niet Mollie's expiresAt): voorbij
 * hold_expires_at geeft de cron de plek vrij, ook als de betaling bij
 * Mollie nog open staat. Een late betaling komt dan via de webhook binnen
 * op een geannuleerde rij en wordt daar bevestigd of terugbetaald.
 */
export function decideHoldExpiry(input: {
  bookedAt: string;
  holdExpiresAt: string | null;
  hasPaymentId: boolean;
  /** Mollie-status, of null als de betaling niet opgehaald kon worden. */
  mollieStatus: string | null;
  now: Date;
}): HoldDecision {
  const nowMs = input.now.getTime();
  if (!input.hasPaymentId) {
    const graceEnd = Date.parse(input.bookedAt) + EXTRA_CLASS_ORPHAN_MINUTES * 60_000;
    return nowMs > graceEnd
      ? { action: "release", outcome: "expired", detail: "orphan" }
      : { action: "leave", detail: "orphan_within_grace" };
  }
  if (input.mollieStatus !== null) {
    const outcome = outcomeForMollieStatus(input.mollieStatus);
    if (outcome === "paid") return { action: "confirm" };
    if (outcome) return { action: "release", outcome, detail: "mollie_status" };
  }
  const holdEnd = input.holdExpiresAt
    ? Date.parse(input.holdExpiresAt)
    : Date.parse(input.bookedAt) + EXTRA_CLASS_HOLD_MINUTES * 60_000;
  if (nowMs > holdEnd) {
    return { action: "release", outcome: "expired", detail: "hold_expired" };
  }
  return input.mollieStatus === null
    ? { action: "leave", detail: "payment_unknown" }
    : { action: "leave", detail: "open_within_hold" };
}

const shortWhen = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Omschrijving op de betaalregel en in /app/facturen: "Extra les: Kettlebell Power, ma 26 okt 19:00". */
export function extraClassDescription(className: string, startAt: Date): string {
  const when = shortWhen.format(startAt).replace(",", "").replace(/\s+/g, " ");
  // COPY: confirm met Marlon
  return `Extra les: ${className}, ${when}`;
}

/** Bruto bedrag naar BTW-deel, bruto leidend (spec-facturatie.md 3.1). */
export function vatSplit(amountCents: number, vatRateBp: number | null): {
  vatCents: number | null;
  netCents: number | null;
} {
  if (vatRateBp === null) return { vatCents: null, netCents: null };
  const vatCents = Math.round((amountCents * vatRateBp) / (10000 + vatRateBp));
  return { vatCents, netCents: amountCents - vatCents };
}

/** "15,00 euro" voor copy en mail; nooit een hardcoded bedrag in de UI. */
export function euroLabel(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} euro`;
}

/** "€15" voor de knop, zonder decimalen als het rond is. */
export function euroShort(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}
