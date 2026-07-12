import createMollieClient, {
  MandateStatus,
  type MollieClient,
} from "@mollie/api-client";

let cached: MollieClient | null = null;

export function getMollieClient(): MollieClient | null {
  if (cached) return cached;
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) return null;
  cached = createMollieClient({ apiKey });
  return cached;
}

export function isMollieConfigured(): boolean {
  return Boolean(process.env.MOLLIE_API_KEY);
}

/**
 * Annuleer een Mollie-subscription zodat er geen verdere incasso meer plaatsvindt.
 * Idempotent: een al-geannuleerde of voltooide subscription telt als succes.
 * Geeft `false` terug bij een echte fout (Mollie niet geconfigureerd, ontbrekende
 * id's, of een API-fout), zodat de caller kan beslissen niet te flippen en later
 * te herproberen. Throwt nooit.
 */
export async function cancelMollieSubscription(
  customerId: string | null,
  subscriptionId: string | null,
): Promise<boolean> {
  const mollie = getMollieClient();
  if (!mollie || !customerId || !subscriptionId) return false;
  try {
    const sub = await mollie.customerSubscriptions.get(subscriptionId, {
      customerId,
    });
    if (sub.status === "canceled" || sub.status === "completed") {
      return true;
    }
    await mollie.customerSubscriptions.cancel(subscriptionId, { customerId });
    return true;
  } catch (err) {
    console.error("[cancelMollieSubscription] failed", err);
    return false;
  }
}

export interface MollieSubscriptionInfo {
  status: string;
  nextPaymentDate: string | null;
}

/**
 * Lees status en nextPaymentDate van een subscription. nextPaymentDate is de
 * eerste dag van de volgende (nog niet betaalde) cyclus en daarmee de
 * pauze-ingangsdatum: tot die dag is er al betaald. Geeft `null` bij een
 * ontbrekende configuratie of API-fout, zodat de caller kan weigeren in
 * plaats van op een gok te pauzeren. Throwt nooit.
 */
export async function getMollieSubscriptionInfo(
  customerId: string | null,
  subscriptionId: string | null,
): Promise<MollieSubscriptionInfo | null> {
  const mollie = getMollieClient();
  if (!mollie || !customerId || !subscriptionId) return null;
  try {
    const sub = await mollie.customerSubscriptions.get(subscriptionId, {
      customerId,
    });
    return { status: sub.status, nextPaymentDate: sub.nextPaymentDate ?? null };
  } catch (err) {
    console.error("[getMollieSubscriptionInfo] failed", err);
    return null;
  }
}

/**
 * Heeft deze Mollie-customer een geldig SEPA-mandaat? Alleen status `valid`
 * telt: een `pending` of `invalid` mandaat mag nooit stil een nieuwe
 * subscription dragen (herautorisatie-beleid). `null` betekent niet
 * vaststelbaar (geen configuratie of API-fout); de caller moet dan weigeren,
 * nooit doorzetten. Throwt nooit.
 */
export async function hasValidMollieMandate(
  customerId: string | null,
): Promise<boolean | null> {
  const mollie = getMollieClient();
  if (!mollie || !customerId) return null;
  try {
    const page = await mollie.customerMandates.page({ customerId });
    return page.some((m) => m.status === MandateStatus.valid);
  } catch (err) {
    console.error("[hasValidMollieMandate] failed", err);
    return null;
  }
}

export interface CreateRecurringSubscriptionParams {
  customerId: string;
  amountCents: number;
  intervalDays: number;
  startDate: string; // yyyy-mm-dd
  description: string;
  membershipId: string;
  idempotencyKey: string;
  webhookUrl: string;
}

/**
 * Maak een recurring subscription op het BESTAANDE mandaat van de customer
 * (Mollie kiest zelf het geldige mandaat; er wordt nooit een nieuw mandaat
 * of een tweede customer gemint). De deterministische idempotencyKey zorgt
 * dat een dubbele aanroep dezelfde subscription oplevert. Geeft `null` bij
 * een fout; de caller mag dan niets lokaal muteren. Throwt nooit.
 */
export async function createMollieRecurringSubscription(
  params: CreateRecurringSubscriptionParams,
): Promise<{ id: string } | null> {
  const mollie = getMollieClient();
  if (!mollie) return null;
  try {
    const sub = await mollie.customerSubscriptions.create({
      customerId: params.customerId,
      amount: {
        currency: "EUR",
        value: (params.amountCents / 100).toFixed(2),
      },
      interval: `${params.intervalDays} days`,
      description: params.description,
      startDate: params.startDate,
      webhookUrl: params.webhookUrl,
      metadata: { membershipId: params.membershipId, type: "recurring" },
      idempotencyKey: params.idempotencyKey,
    });
    return { id: sub.id };
  } catch (err) {
    console.error("[createMollieRecurringSubscription] failed", err);
    return null;
  }
}
