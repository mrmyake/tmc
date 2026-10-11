/**
 * Pure regels van de gratis proefles in de openingsperiode
 * (spec-community-growth.md par. 1 "Gratis openingsperiode"). Geen server- of
 * browserimports, zodat node:test de module direct laadt
 * (scripts/opening-trial/rules.test.mts).
 *
 * De database beslist (tmc.book_opening_trial, onder rijlocks); dit bepaalt
 * alleen wat de pagina's tonen en welke tekst een weigering krijgt.
 */

/** Vaste besluiten; dezelfde constanten staan in tmc.book_opening_trial. */
export const OPENING_MAX_PER_SESSION = 4;
export const OPENING_MAX_CONCURRENT_VRIJ = 4;

export type TrialBookingSource = "paid" | "code" | "opening";

export function isTrialBookingSource(value: unknown): value is TrialBookingSource {
  return value === "paid" || value === "code" || value === "opening";
}

export interface OpeningTrialPeriod {
  /** ISO-timestamps uit tmc.booking_settings; null als de periode niet is ingesteld. */
  startAt: string | null;
  endAt: string | null;
}

/**
 * Loopt de gratis periode nu? Inclusief einde, zoals de RPC
 * (now() > free_trial_end_at weigert). Zonder start of einde nooit actief.
 */
export function isOpeningPeriodActive(
  period: OpeningTrialPeriod | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!period?.startAt || !period.endAt) return false;
  const start = Date.parse(period.startAt);
  const end = Date.parse(period.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const t = now.getTime();
  return t >= start && t <= end;
}

/**
 * Vrije gratis plekken op een les: het kleinste van de gewone vrije plekken
 * (null = onbeperkte capaciteit) en wat er van het openingsquotum over is.
 * Nooit negatief.
 */
export function openingSpotsLeft(
  spotsAvailable: number | null,
  openingBooked: number,
  max: number = OPENING_MAX_PER_SESSION,
): number {
  const quota = Math.max(max - openingBooked, 0);
  if (spotsAvailable === null) return quota;
  return Math.max(Math.min(spotsAvailable, quota), 0);
}

/**
 * Weigeringen van tmc.book_opening_trial (jsonb-reason) als schermtekst.
 * Onbekende reasons krijgen de generieke tekst.
 */
// COPY: confirm met Marlon
export const OPENING_REASON_MESSAGE: Record<string, string> = {
  // COPY: confirm met Marlon
  missing_fields: "Vul je naam, e-mailadres en telefoonnummer in.",
  // COPY: confirm met Marlon
  invalid_phone: "Dit telefoonnummer herkennen we niet. Gebruik je landcode, bijvoorbeeld +31 6 12345678.",
  // COPY: confirm met Marlon
  invalid_email: "Dit e-mailadres herkennen we niet.",
  // COPY: confirm met Marlon
  period_closed: "De gratis proeflessen van onze openingsperiode zijn afgelopen. Je kunt wel een proefles boeken tegen het drop-in-tarief.",
  // COPY: confirm met Marlon
  already_customer: "Je bent al bij ons bekend als lid of klant. De gratis proefles is voor nieuwe gezichten. Log in om te boeken, of neem contact met ons op.",
  // COPY: confirm met Marlon
  already_used: "Je hebt al een gratis proefles gehad of geboekt. Een tweede gratis proefles is niet mogelijk, maar je kunt wel een proefles boeken tegen het drop-in-tarief.",
  // COPY: confirm met Marlon
  email_already_booked: "Dit e-mailadres staat al ingeschreven voor deze les.",
  // COPY: confirm met Marlon
  session_not_found: "Deze sessie bestaat niet (meer).",
  // COPY: confirm met Marlon
  session_not_scheduled: "Deze sessie is niet meer beschikbaar.",
  // COPY: confirm met Marlon
  session_in_past: "Deze sessie is al voorbij.",
  // COPY: confirm met Marlon
  session_not_trial_eligible: "Deze discipline is niet beschikbaar als proefles.",
  // COPY: confirm met Marlon
  trial_quota_full: "De gratis proefplekken voor dit moment zijn vergeven. Kies een ander moment.",
  // COPY: confirm met Marlon
  capacity_full: "Deze sessie is helaas vol.",
  // COPY: confirm met Marlon
  slot_required: "Kies eerst een starttijd.",
  // COPY: confirm met Marlon
  slot_invalid: "Deze starttijd is niet beschikbaar. Kies een andere.",
  // COPY: confirm met Marlon
  slot_in_past: "Deze starttijd is al voorbij. Kies een andere.",
  // COPY: confirm met Marlon
  slot_outside_session: "Deze starttijd is niet beschikbaar. Kies een andere.",
  // COPY: confirm met Marlon
  outside_presence: "Een gratis proefuur vrij trainen kan alleen als Marlon er is. Kies een andere starttijd.",
  // COPY: confirm met Marlon
  slot_blocked: "Op dat moment is er een les. Kies een andere starttijd.",
  // COPY: confirm met Marlon
  slot_full: "Net iemand je voor: dit uur is niet meer vrij. Kies een andere starttijd.",
  // COPY: confirm met Marlon
  slot_not_allowed: "Boeken lukte niet. Probeer het opnieuw.",
};

// COPY: confirm met Marlon
export const OPENING_GENERIC_ERROR = "Boeken lukte niet. Probeer het opnieuw.";
// COPY: confirm met Marlon
export const OPENING_RATE_LIMITED_MESSAGE = "Te veel pogingen. Probeer het later opnieuw.";

export function openingReasonMessage(reason: string | undefined): string {
  return OPENING_REASON_MESSAGE[reason ?? ""] ?? OPENING_GENERIC_ERROR;
}

/**
 * Waar de pagina na een weigering heen moet: "person" (deze persoon krijgt
 * geen gratis proefles, de keuze van sessie helpt niet), "session" (de
 * gekozen sessie of het slot is niet meer bruikbaar, kies een andere), of
 * niets (fout in de invoer, blijf op het formulier).
 */
export function openingStepForReason(
  reason: string | undefined,
): "person" | "session" | "period" | undefined {
  switch (reason) {
    case "period_closed":
      return "period";
    case "already_customer":
    case "already_used":
      return "person";
    case "email_already_booked":
    case "session_not_found":
    case "session_not_scheduled":
    case "session_in_past":
    case "session_not_trial_eligible":
    case "trial_quota_full":
    case "capacity_full":
    case "slot_required":
    case "slot_invalid":
    case "slot_in_past":
    case "slot_outside_session":
    case "outside_presence":
    case "slot_blocked":
    case "slot_full":
    case "slot_not_allowed":
      return "session";
    default:
      return undefined;
  }
}

/**
 * Label voor een proefboeking op de deelnemerslijsten en in de kiosk.
 * pending wint (de betaling loopt nog), dan de bron.
 */
export function trialSourceLabel(args: {
  source: TrialBookingSource;
  status: string;
  priceLabel?: string | null;
}): string {
  // COPY: confirm met Marlon
  if (args.status === "pending") return "Proefles, wacht op betaling";
  // COPY: confirm met Marlon
  if (args.source === "opening") return "Proefles, gratis";
  // COPY: confirm met Marlon
  if (args.source === "code") return "Proefles via code";
  // COPY: confirm met Marlon
  return args.priceLabel ? `Proefles ${args.priceLabel}` : "Proefles";
}
