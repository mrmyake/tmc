import createMollieClient, { type MollieClient } from "@mollie/api-client";

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
