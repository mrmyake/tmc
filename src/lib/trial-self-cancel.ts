/**
 * Pure logica voor de zelfservice-annulering van een proefles
 * (spec-community-growth.md §1 "Annulering door de studio", alinea
 * "Zelfservice"). Geen I/O: de database beslist (visitor_cancel_trial_booking),
 * dit bepaalt alleen wat de bezoeker vooraf en achteraf te zien krijgt.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Een annuleertoken is een uuid; alles anders is nooit een geldige link. */
export function isCancelTokenFormat(token: string): boolean {
  return UUID_RE.test(token);
}

/**
 * Binnen de annuleringstermijn, inclusief de grens: dezelfde regel als
 * cancel_class_booking (start_at - now() >= termijn) en als
 * isCancellable in format-date.ts. Alleen voor de weergave vooraf.
 */
export function isWithinCancelWindow(
  startAt: Date,
  windowHours: number,
  now: Date = new Date(),
): boolean {
  return startAt.getTime() - now.getTime() >= windowHours * 3_600_000;
}

/**
 * Kosteloos annuleren na een eenmalige verschuiving van de les
 * (spec-session-overrides.md): de boeking is van voor de verschuiving en de
 * (nieuwe) start is nog niet bereikt. Zelfde regel als
 * visitor_cancel_trial_booking en cancel_class_booking. Alleen weergave; de
 * database beslist.
 */
export function isFreeAfterReschedule(args: {
  bookedAt: Date;
  rescheduledAt: Date | null;
  startAt: Date;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  return (
    args.rescheduledAt !== null &&
    args.bookedAt.getTime() < args.rescheduledAt.getTime() &&
    now.getTime() < args.startAt.getTime()
  );
}

export interface SelfCancelOutcome {
  withinWindow: boolean;
  /** Prijs van de boeking in centen; 0 bij een codeboeking. */
  pricePaidCents: number;
  /** Er is een refund-intentie gemaakt of er liep er al een. */
  refundRequested: boolean;
  codeStillUsable: boolean;
  windowHours: number;
}

/** Schermtekst na de annulering. Noemt geen termijn voor de terugbetaling. */
export function selfCancelMessage(o: SelfCancelOutcome): string {
  if (o.pricePaidCents > 0) {
    if (o.refundRequested) {
      // COPY: confirm met Marlon
      return "Je proefles is geannuleerd. We storten het betaalde bedrag volledig terug.";
    }
    if (!o.withinWindow) {
      // COPY: confirm met Marlon
      return `Je proefles is geannuleerd. Omdat je binnen ${o.windowHours} uur voor de les annuleerde, storten we het bedrag niet terug.`;
    }
  }
  return o.codeStillUsable
    ? // COPY: confirm met Marlon
      "Je proefles is geannuleerd. Je code is weer te gebruiken voor een andere les."
    : // COPY: confirm met Marlon
      "Je proefles is geannuleerd.";
}

/**
 * Waarschuwing boven de knop, alleen bij een betaalde proefles na de
 * termijn, zodat de bezoeker bewust kiest. Null als er niets te waarschuwen
 * valt (binnen de termijn, of een codeboeking: die verliest niets).
 */
export function lateCancelWarning(args: {
  withinWindow: boolean;
  pricePaidCents: number;
  windowHours: number;
}): string | null {
  if (args.withinWindow || args.pricePaidCents <= 0) return null;
  // COPY: confirm met Marlon
  return `Je les begint over minder dan ${args.windowHours} uur. Je kunt nog annuleren, maar dan storten we het betaalde bedrag niet terug.`;
}
