import type { OrderConfirmationProps } from "@/emails/order_confirmation";

/**
 * Pure kern van de bevestigingsmail na een geslaagde betaling: (1) de
 * order-rij plus catalogus en profiel vertalen naar mailprops, en (2) het
 * exact-één-keer-gedrag. Geen Supabase, geen MailerSend, geen React hier;
 * alles komt binnen via `deps`, zodat scripts/orders/*.test.mts dit zonder
 * netwerk kan bewijzen. De dunne wrapper in order-confirmation.ts wiret de
 * echte afhankelijkheden.
 *
 * Bedragen komen uitsluitend uit de order-rij (het snapshot dat
 * create_order schreef en dat Mollie heeft geïncasseerd) en uit
 * tmc.catalogue (naam, ritten, geldigheid). Hier wordt niets herberekend.
 */

export const CONFIRMATION_EVENT_TYPE = "order.confirmation_sent" as const;

/** Kolommen uit tmc.orders die de mail nodig heeft. */
export interface ConfirmationOrderRow {
  id: string;
  profile_id: string | null;
  kind: string;
  catalogue_slug: string;
  first_charge_cents: number;
  recurring_cents: number | null;
  signup_fee_cents: number | null;
  signup_fee_waiver: string | null;
  billing_cycle_weeks: number | null;
  vat_amount_cents: number | null;
  pricing_snapshot: Record<string, unknown> | null;
  /** Ingesloten profiel (orders_profile_id_fkey). */
  profile: { email: string | null; first_name: string | null } | null;
}

export interface ConfirmationCatalogueRow {
  display_name: string;
  credits: number | null;
  validity_months: number | null;
  vat_rate_bp: number;
}

export interface ConfirmationInput {
  order: ConfirmationOrderRow;
  catalogue: ConfirmationCatalogueRow | null;
  /** Opzegtermijn in dagen, uit getCancellationNoticeDays(). */
  cancellationNoticeDays: number;
  siteUrl: string;
  now: Date;
}

export interface FormatDeps {
  euroCents: (cents: number) => string;
  noticePeriod: (days: number) => string;
  longDate: (date: Date) => string;
}

// COPY: confirm met Marlon
const WAIVER_LABELS: Record<string, string> = {
  early_member: "Early Member",
};

/**
 * Eerstvolgende incasso: zelfde rekenregel als de Mollie-subscription die de
 * webhook aanmaakt (route.ts: startDate = nu + billing_cycle_weeks * 7
 * dagen), zodat de mail en de daadwerkelijke incassodatum niet uiteenlopen.
 */
export function nextChargeDate(now: Date, billingCycleWeeks: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + billingCycleWeeks * 7);
  return d;
}

function snapshotInt(
  snapshot: Record<string, unknown> | null,
  key: string,
): number | null {
  const v = snapshot?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Bouwt de props voor OrderConfirmation. Geeft null als de order geen mail
 * kan krijgen (geen e-mailadres, onbekende kind); de caller logt dat.
 */
export function buildConfirmationProps(
  input: ConfirmationInput,
  fmt: FormatDeps,
): { to: string; toName: string | undefined; props: OrderConfirmationProps } | null {
  const { order, catalogue, cancellationNoticeDays, siteUrl, now } = input;
  const email = order.profile?.email?.trim();
  if (!email) return null;

  const firstName = order.profile?.first_name?.trim() ?? "";
  const productName = catalogue?.display_name ?? order.catalogue_slug;
  const vatRateBp = catalogue?.vat_rate_bp ?? snapshotInt(order.pricing_snapshot, "vat_rate_bp") ?? 0;
  const vatRateLabel = `${vatRateBp / 100}%`;
  const paidVatCents =
    order.vat_amount_cents ?? snapshotInt(order.pricing_snapshot, "first_charge_vat_amount_cents") ?? 0;

  const common = {
    firstName,
    productName,
    paidEuro: fmt.euroCents(order.first_charge_cents),
    paidVatEuro: fmt.euroCents(paidVatCents),
    vatRateLabel,
    siteUrl,
  };

  if (order.kind === "subscription") {
    const weeks = order.billing_cycle_weeks ?? snapshotInt(order.pricing_snapshot, "billing_cycle_weeks");
    if (weeks === null || order.recurring_cents === null) return null;
    const recurringVatCents =
      snapshotInt(order.pricing_snapshot, "recurring_vat_amount_cents") ?? paidVatCents;
    const feeCents = order.signup_fee_cents ?? 0;
    const waiver = order.signup_fee_waiver;
    // Bij een waiver staat 0 op de order (het normale bedrag zit niet los in
    // het snapshot), dus dan tonen we alleen de reden, geen bedrag.
    const signupFee =
      feeCents > 0
        ? ({ charged: true, amountEuro: fmt.euroCents(feeCents) } as const)
        : ({
            charged: false,
            // COPY: confirm met Marlon
            reasonLabel: waiver ? (WAIVER_LABELS[waiver] ?? waiver) : "geen inschrijfkosten op deze order",
          } as const);

    return {
      to: email,
      toName: firstName || undefined,
      props: {
        kind: "subscription",
        ...common,
        recurringEuro: fmt.euroCents(order.recurring_cents),
        recurringVatEuro: fmt.euroCents(recurringVatCents),
        // COPY: confirm met Marlon
        intervalLabel: `per ${weeks} weken`,
        nextChargeDate: fmt.longDate(nextChargeDate(now, weeks)),
        signupFee,
        noticePeriodLabel: fmt.noticePeriod(cancellationNoticeDays),
      },
    };
  }

  if (order.kind === "product") {
    return {
      to: email,
      toName: firstName || undefined,
      props: {
        kind: "product",
        ...common,
        credits: catalogue?.credits ?? null,
        validityMonths: catalogue?.validity_months ?? null,
      },
    };
  }

  return null;
}

/** Afhankelijkheden van het exact-één-keer-pad. */
export interface SendOnceDeps {
  /** Bestaat er al een order.confirmation_sent-event voor deze order. */
  hasConfirmationEvent: (orderId: string) => Promise<boolean>;
  /** Laadt de order met profiel; null als hij niet bestaat. */
  loadOrder: (orderId: string) => Promise<ConfirmationOrderRow | null>;
  loadCatalogue: (slug: string) => Promise<ConfirmationCatalogueRow | null>;
  cancellationNoticeDays: () => Promise<number>;
  /** Verstuurt de mail; true alleen als de provider hem accepteerde. */
  send: (args: {
    to: string;
    toName: string | undefined;
    props: OrderConfirmationProps;
  }) => Promise<boolean>;
  /** Schrijft order.confirmation_sent naar tmc.events. */
  emitSent: (orderId: string, payload: Record<string, unknown>) => Promise<void>;
  siteUrl: string;
  now: () => Date;
  fmt: FormatDeps;
}

export type SendOnceResult =
  | { outcome: "sent" }
  | { outcome: "already_sent" }
  | { outcome: "skipped"; reason: "order_not_found" | "no_recipient" | "unsupported_kind" }
  | { outcome: "failed" };

/**
 * Verstuurt de bevestiging exact één keer per order. De poort is het
 * append-only tmc.events: bestaat order.confirmation_sent al, dan gebeurt
 * er niets. Het event wordt pas geschreven ná een geslaagde verzending,
 * zodat een mislukte MailerSend-call de order niet als "bevestigd"
 * markeert. Throwt nooit: een mailprobleem mag de webhook nooit op een
 * niet-2xx laten eindigen.
 */
export async function sendOrderConfirmationOnce(
  deps: SendOnceDeps,
  orderId: string,
): Promise<SendOnceResult> {
  try {
    if (await deps.hasConfirmationEvent(orderId)) {
      return { outcome: "already_sent" };
    }
    const order = await deps.loadOrder(orderId);
    if (!order) return { outcome: "skipped", reason: "order_not_found" };
    const catalogue = await deps.loadCatalogue(order.catalogue_slug);
    const built = buildConfirmationProps(
      {
        order,
        catalogue,
        cancellationNoticeDays: await deps.cancellationNoticeDays(),
        siteUrl: deps.siteUrl,
        now: deps.now(),
      },
      deps.fmt,
    );
    if (!built) {
      return {
        outcome: "skipped",
        reason: order.profile?.email ? "unsupported_kind" : "no_recipient",
      };
    }
    const ok = await deps.send(built);
    if (!ok) return { outcome: "failed" };
    await deps.emitSent(orderId, {
      order_id: orderId,
      profile_id: order.profile_id,
      kind: order.kind,
      catalogue_slug: order.catalogue_slug,
      first_charge_cents: order.first_charge_cents,
    });
    return { outcome: "sent" };
  } catch (err) {
    console.error("[order-confirmation] unexpected", { orderId, err });
    return { outcome: "failed" };
  }
}
