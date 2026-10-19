/**
 * Chargeback-spiegel (spec-facturatie.md 4.7 en 4.8). Pure kern, zonder I/O:
 * alle lees- en schrijfacties komen binnen via `ChargebackDeps`, zodat de
 * beslislogica in scripts/chargebacks/ met fakes getest wordt zonder Mollie
 * of database. Zelfde opzet als src/lib/refunds/core.ts.
 *
 * Wat een storno in Mollie API v2 doet: de payment blijft 'paid' en alleen
 * amountChargedBack beweegt (bij een reversal door de bank verdwijnt het
 * veld weer). De spiegel is payments.charged_back_amount_cents; de poort
 * voor alle bijwerkingen is de rij zelf: een compare-and-swap van het oude
 * naar het nieuwe bedrag. Een herhaalde webhook ziet hetzelfde bedrag en
 * doet niets; twee gelijktijdige webhooks winnen er precies een.
 *
 * Gevolg per soort betaling:
 *  - recurring (subscription) en de eerste betaling van een abonnement
 *    (sequenceType first, order met membership): membership van active
 *    naar payment_failed, mail en push naar het lid, ntfy naar de staf,
 *    event membership.payment_failed met reason "chargeback". Staat de
 *    membership niet op active: wel spiegel, event en ntfy, geen ledenmail.
 *  - alle andere betalingen (product, PT-boeking, PT-order, proefles):
 *    alleen spiegel, event en ntfy naar de staf die zegt wat eraan hangt en
 *    dat niets automatisch is teruggedraaid.
 *  - reversal naar 0: event payment.chargeback_reversed; staat de
 *    gekoppelde membership op payment_failed met als laatste oorzaak deze
 *    chargeback, dan terug naar active met membership.reactivated (reason
 *    "chargeback_reversed") en een ntfy, zonder ledenmail.
 *
 * Akiles volgt het bestaande payment_failed-gedrag (desired-state.ts): de
 * deur blijft open, Marlon lost het persoonlijk op.
 */

export type ChargebackSequence = "first" | "recurring" | "oneoff";

/** Een chargeback zoals Mollie hem bij de betaling teruggeeft. */
export interface ChargebackLike {
  id: string;
  amountCents: number;
  /** SEPA-reden (MD06, AC04, ...); null bij andere methodes. */
  reasonCode: string | null;
  reasonDescription: string | null;
  createdAt: string;
  reversedAt: string | null;
}

/** De betaalregel (tmc.payments) zoals de webhook hem net geschreven heeft. */
export interface ChargebackPaymentRow {
  id: string;
  molliePaymentId: string;
  amountCents: number;
  /** De huidige spiegel, vóór deze webhook. */
  chargedBackAmountCents: number;
  profileId: string | null;
  membershipId: string | null;
  orderId: string | null;
  ptBookingId: string | null;
  trialBookingId: string | null;
  kind: string | null;
  description: string | null;
  isTest: boolean;
}

/** Wat Mollie over de betaling zegt, voor zover hier relevant. */
export interface ChargebackPaymentView {
  /** payment.amountChargedBack in centen; 0 als het veld ontbreekt. */
  amountChargedBackCents: number;
  sequenceType: ChargebackSequence | null;
  subscriptionId: string | null;
  /** payment.metadata.type ("order", "pt_booking", ...). */
  metadataType: string | null;
}

export interface LinkedMembership {
  id: string;
  status: string;
  profileId: string;
  planVariant: string | null;
}

export interface PaymentFailedCause {
  reason: string | null;
  chargebackId: string | null;
  paymentId: string | null;
}

export type ChargebackEventType =
  | "payment.charged_back"
  | "payment.chargeback_reversed"
  | "membership.payment_failed"
  | "membership.reactivated";

export interface ChargebackEvent {
  type: ChargebackEventType;
  subjectType: "payment" | "membership";
  subjectId: string;
  payload: Record<string, unknown>;
}

export interface ChargebackDeps {
  /**
   * Compare-and-swap op de spiegel: schrijft nextCents en chargedBackAt
   * alleen als de rij nog previousCents draagt. True als de rij geraakt is.
   */
  mirror(args: {
    paymentRowId: string;
    previousCents: number;
    nextCents: number;
    chargedBackAt: string;
  }): Promise<boolean>;
  /** Chargebacks van deze betaling bij Mollie; mag een lege lijst geven bij een fout. */
  fetchChargebacks(molliePaymentId: string): Promise<ChargebackLike[]>;
  findMembership(args: {
    subscriptionId: string | null;
    membershipId: string | null;
    orderId: string | null;
  }): Promise<LinkedMembership | null>;
  /** Conditioneel: alleen vanuit `from`. True als de rij geraakt is. */
  setMembershipStatus(args: { membershipId: string; from: string; to: string }): Promise<boolean>;
  /** Laatste membership.payment_failed-event voor dit membership, of null. */
  lastPaymentFailedCause(membershipId: string): Promise<PaymentFailedCause | null>;
  emit(event: ChargebackEvent): Promise<unknown>;
  notifyStaff(title: string, message: string, tags?: string): Promise<unknown>;
  /** Dezelfde mail plus push als bij een mislukte incasso. */
  notifyMember(args: { profileId: string; amountCents: number; planLabel: string }): Promise<unknown>;
  now(): Date;
}

export type ChargebackOutcome =
  | { outcome: "unchanged" }
  | { outcome: "lost_race" }
  | {
      outcome: "charged_back";
      chargebackId: string | null;
      membershipFlipped: boolean;
      memberNotified: boolean;
    }
  | {
      outcome: "reversed";
      chargebackId: string | null;
      membershipReactivated: boolean;
    }
  | { outcome: "partially_reversed"; chargebackId: string | null };

/**
 * SEPA-redenen waarna Mollie de subscription zelf annuleert, zonder webhook
 * aan ons (Mollie-docs recurring-payments): direct, of na drie keer. Een vast
 * mandaat wordt daarbij ingetrokken.
 */
export const CANCEL_AFTER_THREE_CODES: ReadonlySet<string> = new Set(["MD01", "MD06", "MS02", "MS03", "SL01"]);
export const CANCEL_IMMEDIATELY_CODES: ReadonlySet<string> = new Set(["AC01", "AC04", "AC06", "MD07"]);

export function centsFromMollieValue(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Math.round(parseFloat(value) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function eurosFromCents(cents: number): string {
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/** Is dit een betaling waar een abonnement aan hangt (recurring of eerste betaling)? */
export function isMembershipPayment(view: ChargebackPaymentView, row: Pick<ChargebackPaymentRow, "orderId">): boolean {
  if (view.sequenceType === "recurring" && view.subscriptionId) return true;
  if (view.sequenceType === "first" && view.metadataType === "order" && row.orderId) return true;
  return false;
}

function byCreatedAtDesc(a: ChargebackLike, b: ChargebackLike): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** De chargeback die deze stijging het best verklaart: nieuwste niet-teruggedraaide, anders nieuwste. */
export function pickActiveChargeback(chargebacks: readonly ChargebackLike[]): ChargebackLike | null {
  const sorted = [...chargebacks].sort(byCreatedAtDesc);
  return sorted.find((c) => !c.reversedAt) ?? sorted[0] ?? null;
}

/** De chargeback die deze reversal het best verklaart: nieuwste teruggedraaide, anders nieuwste. */
export function pickReversedChargeback(chargebacks: readonly ChargebackLike[]): ChargebackLike | null {
  const sorted = [...chargebacks].sort(byCreatedAtDesc);
  return sorted.find((c) => Boolean(c.reversedAt)) ?? sorted[0] ?? null;
}

/**
 * Zin voor de staf over wat Mollie met de subscription doet bij deze reden.
 * Alleen bij redenen waarvan Mollie documenteert dat ze de subscription
 * annuleren; anders leeg.
 */
export function subscriptionWarningFor(reasonCode: string | null): string {
  if (!reasonCode) return "";
  const code = reasonCode.toUpperCase();
  if (CANCEL_AFTER_THREE_CODES.has(code)) {
    // COPY: confirm met Marlon
    return " Let op: na drie storno's met deze reden annuleert Mollie de subscription zelf, zonder ons te informeren. Marlon neemt contact op met het lid.";
  }
  if (CANCEL_IMMEDIATELY_CODES.has(code)) {
    // COPY: confirm met Marlon
    return " Let op: bij deze reden annuleert Mollie de subscription direct, zonder ons te informeren. Marlon neemt contact op met het lid.";
  }
  return "";
}

/** Wat er aan een niet-abonnementsbetaling hangt, in staf-taal. */
export function describeAttachment(row: ChargebackPaymentRow, view: ChargebackPaymentView): string {
  // COPY: confirm met Marlon
  if (view.metadataType === "pt_booking" && row.ptBookingId) {
    return `PT-boeking ${row.ptBookingId} blijft geboekt.`;
  }
  if (row.trialBookingId || row.kind === "trial_booking") {
    return `Proefles-boeking ${row.trialBookingId ?? "(onbekend)"} blijft staan.`;
  }
  if (row.orderId) {
    return `Order ${row.orderId}${row.membershipId ? ` (credits op membership ${row.membershipId})` : ""}: credits, sessie of product zijn niet teruggedraaid.`;
  }
  return "Geen gekoppelde order of boeking gevonden.";
}

function reasonText(cb: ChargebackLike | null): string {
  if (!cb || !cb.reasonCode) return "reden onbekend";
  return `reden ${cb.reasonCode}${cb.reasonDescription ? ` (${cb.reasonDescription})` : ""}`;
}

function basePayload(
  row: ChargebackPaymentRow,
  view: ChargebackPaymentView,
  cb: ChargebackLike | null,
  nextCents: number,
): Record<string, unknown> {
  return {
    dedupe_key: `${row.molliePaymentId}:${cb?.id ?? "unknown"}`,
    payment_id: row.molliePaymentId,
    payment_row_id: row.id,
    chargeback_id: cb?.id ?? null,
    reason_code: cb?.reasonCode ?? null,
    amount_cents: nextCents,
    previous_cents: row.chargedBackAmountCents,
    profile_id: row.profileId,
    membership_id: row.membershipId,
    order_id: row.orderId,
    pt_booking_id: row.ptBookingId,
    trial_booking_id: row.trialBookingId,
    sequence: view.sequenceType,
    is_test: row.isTest,
  };
}

/**
 * Verwerkt het verschil tussen de spiegel en wat Mollie meldt. Throwt
 * alleen als een dep throwt; de wiring (process.ts) vangt dat en logt.
 */
export async function syncChargebackMirror(
  deps: ChargebackDeps,
  row: ChargebackPaymentRow,
  view: ChargebackPaymentView,
): Promise<ChargebackOutcome> {
  const previous = row.chargedBackAmountCents;
  const next = Math.min(view.amountChargedBackCents, row.amountCents);
  if (next === previous) return { outcome: "unchanged" };

  // Eerst de chargebacks ophalen, dan pas de spiegel schrijven: het event
  // hoort het chargeback-id te dragen, en verliezen we intussen de race
  // met een tweede webhook, dan is er niets geschreven en niets gemeld.
  let chargebacks: ChargebackLike[] = [];
  try {
    chargebacks = await deps.fetchChargebacks(row.molliePaymentId);
  } catch {
    chargebacks = [];
  }

  const at = deps.now().toISOString();
  const changed = await deps.mirror({
    paymentRowId: row.id,
    previousCents: previous,
    nextCents: next,
    chargedBackAt: at,
  });
  if (!changed) return { outcome: "lost_race" };

  const membershipPayment = isMembershipPayment(view, row);
  const amount = eurosFromCents(next > 0 ? next : previous);
  const paymentLabel = `betaling ${row.molliePaymentId}${view.sequenceType ? ` (${view.sequenceType})` : ""}`;

  // -- Storno (stijging) ---------------------------------------------------
  if (next > previous) {
    const cb = pickActiveChargeback(chargebacks);
    await deps.emit({
      type: "payment.charged_back",
      subjectType: "payment",
      subjectId: row.id,
      payload: basePayload(row, view, cb, next),
    });

    if (!membershipPayment) {
      await deps.notifyStaff(
        // COPY: confirm met Marlon
        "Storno op betaling",
        `Storno van ${amount} op ${paymentLabel}, ${reasonText(cb)}. ${describeAttachment(row, view)} Niets automatisch teruggedraaid; beoordeel en handel zelf af in Mollie.`,
        "warning",
      );
      return { outcome: "charged_back", chargebackId: cb?.id ?? null, membershipFlipped: false, memberNotified: false };
    }

    const membership = await deps.findMembership({
      subscriptionId: view.subscriptionId,
      membershipId: row.membershipId,
      orderId: row.orderId,
    });
    if (!membership) {
      await deps.notifyStaff(
        // COPY: confirm met Marlon
        "Storno zonder gekoppeld abonnement",
        `Storno van ${amount} op ${paymentLabel}, ${reasonText(cb)}, maar er is geen membership gevonden bij subscription ${view.subscriptionId ?? "(geen)"} of order ${row.orderId ?? "(geen)"}. Handmatig koppelen en beoordelen.${subscriptionWarningFor(cb?.reasonCode ?? null)}`,
        "warning",
      );
      return { outcome: "charged_back", chargebackId: cb?.id ?? null, membershipFlipped: false, memberNotified: false };
    }

    let flipped = false;
    if (membership.status === "active") {
      flipped = await deps.setMembershipStatus({ membershipId: membership.id, from: "active", to: "payment_failed" });
    }
    const planLabel = membership.planVariant ?? "abonnement";
    if (flipped) {
      await deps.emit({
        type: "membership.payment_failed",
        subjectType: "membership",
        subjectId: membership.id,
        payload: {
          profile_id: membership.profileId,
          membership_id: membership.id,
          payment_id: row.molliePaymentId,
          sequence: view.sequenceType,
          reason: "chargeback",
          chargeback_id: cb?.id ?? null,
          reason_code: cb?.reasonCode ?? null,
        },
      });
      await deps.notifyMember({ profileId: membership.profileId, amountCents: next, planLabel });
      await deps.notifyStaff(
        // COPY: confirm met Marlon
        "Incasso gestorneerd",
        `Membership ${membership.id} (${planLabel}): storno van ${amount} op ${paymentLabel}, ${reasonText(cb)}. Status naar payment_failed; het lid heeft mail en push gekregen.${subscriptionWarningFor(cb?.reasonCode ?? null)}`,
        "warning",
      );
      return { outcome: "charged_back", chargebackId: cb?.id ?? null, membershipFlipped: true, memberNotified: true };
    }

    await deps.notifyStaff(
      // COPY: confirm met Marlon
      "Incasso gestorneerd",
      `Membership ${membership.id} (${planLabel}) staat op ${membership.status}: storno van ${amount} op ${paymentLabel}, ${reasonText(cb)}. Status ongewijzigd, geen ledenmail verstuurd.${subscriptionWarningFor(cb?.reasonCode ?? null)}`,
      "warning",
    );
    return { outcome: "charged_back", chargebackId: cb?.id ?? null, membershipFlipped: false, memberNotified: false };
  }

  // -- Daling ---------------------------------------------------------------
  const cb = pickReversedChargeback(chargebacks);
  const payload = basePayload(row, view, cb, next);

  if (next > 0) {
    await deps.emit({
      type: "payment.chargeback_reversed",
      subjectType: "payment",
      subjectId: row.id,
      payload: { ...payload, partial: true },
    });
    await deps.notifyStaff(
      // COPY: confirm met Marlon
      "Storno deels teruggedraaid",
      `Op ${paymentLabel} staat nu ${eurosFromCents(next)} gestorneerd (was ${eurosFromCents(previous)}). Geen statuswijziging; beoordeel zelf in Mollie.`,
      "warning",
    );
    return { outcome: "partially_reversed", chargebackId: cb?.id ?? null };
  }

  await deps.emit({
    type: "payment.chargeback_reversed",
    subjectType: "payment",
    subjectId: row.id,
    payload: { ...payload, partial: false },
  });

  if (!membershipPayment) {
    await deps.notifyStaff(
      // COPY: confirm met Marlon
      "Storno teruggedraaid",
      `De storno van ${eurosFromCents(previous)} op ${paymentLabel} is door de bank teruggedraaid. ${describeAttachment(row, view)}`,
      "white_check_mark",
    );
    return { outcome: "reversed", chargebackId: cb?.id ?? null, membershipReactivated: false };
  }

  const membership = await deps.findMembership({
    subscriptionId: view.subscriptionId,
    membershipId: row.membershipId,
    orderId: row.orderId,
  });
  if (!membership) {
    await deps.notifyStaff(
      // COPY: confirm met Marlon
      "Storno teruggedraaid",
      `De storno van ${eurosFromCents(previous)} op ${paymentLabel} is teruggedraaid, maar er is geen membership gevonden. Handmatig beoordelen.`,
      "warning",
    );
    return { outcome: "reversed", chargebackId: cb?.id ?? null, membershipReactivated: false };
  }

  const planLabel = membership.planVariant ?? "abonnement";
  if (membership.status === "payment_failed") {
    const cause = await deps.lastPaymentFailedCause(membership.id);
    const knownIds = new Set(chargebacks.map((c) => c.id));
    const causedByThis =
      cause !== null &&
      cause.reason === "chargeback" &&
      ((cause.chargebackId !== null && knownIds.has(cause.chargebackId)) ||
        (cause.chargebackId === null && cause.paymentId === row.molliePaymentId));
    if (causedByThis) {
      const reactivated = await deps.setMembershipStatus({
        membershipId: membership.id,
        from: "payment_failed",
        to: "active",
      });
      if (reactivated) {
        await deps.emit({
          type: "membership.reactivated",
          subjectType: "membership",
          subjectId: membership.id,
          payload: {
            profile_id: membership.profileId,
            membership_id: membership.id,
            payment_id: row.molliePaymentId,
            reason: "chargeback_reversed",
            chargeback_id: cb?.id ?? null,
          },
        });
        await deps.notifyStaff(
          // COPY: confirm met Marlon
          "Storno teruggedraaid, abonnement weer actief",
          `Membership ${membership.id} (${planLabel}): de storno van ${eurosFromCents(previous)} op ${paymentLabel} is door de bank teruggedraaid. Status terug naar active; geen ledenmail verstuurd.`,
          "white_check_mark",
        );
        return { outcome: "reversed", chargebackId: cb?.id ?? null, membershipReactivated: true };
      }
    }
    await deps.notifyStaff(
      // COPY: confirm met Marlon
      "Storno teruggedraaid, abonnement blijft payment_failed",
      `Membership ${membership.id} (${planLabel}): de storno van ${eurosFromCents(previous)} op ${paymentLabel} is teruggedraaid, maar de status payment_failed heeft een andere oorzaak. Handmatig beoordelen.`,
      "warning",
    );
    return { outcome: "reversed", chargebackId: cb?.id ?? null, membershipReactivated: false };
  }

  await deps.notifyStaff(
    // COPY: confirm met Marlon
    "Storno teruggedraaid",
    `Membership ${membership.id} (${planLabel}) staat op ${membership.status}: de storno van ${eurosFromCents(previous)} op ${paymentLabel} is teruggedraaid. Geen statuswijziging.`,
    "white_check_mark",
  );
  return { outcome: "reversed", chargebackId: cb?.id ?? null, membershipReactivated: false };
}
