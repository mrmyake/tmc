// Named import: de default-export bestaat alleen via de bundler-interop; onder
// native Node ESM (scripts/mollie/*.test.mts) is createMollieClient een named
// export van de CJS-bundle. Beide omgevingen zien dezelfde functie.
import {
  createMollieClient,
  MandateStatus,
  type MollieClient,
} from "@mollie/api-client";

/**
 * Test/live-scheiding (spec-facturatie.md 6.5/6.6). Twee env-vars, twee
 * clients in een Map op modus; de oude module-level cache maakte twee modi
 * in een proces onmogelijk (de eerste aanroep won). Geen fallback van
 * MOLLIE_API_KEY_LIVE naar het oude MOLLIE_API_KEY: een stille fallback op
 * een key waarvan niemand meer weet of hij test of live is, is precies het
 * probleem dat dit oplost. Ontbreekt de key voor een modus, dan geeft
 * getMollieClient null en weigeren de betaalpaden netjes.
 *
 * Twee vangrails bovenop de keuze van de env-var (spec-facturatie.md 6.6):
 *
 * 1. Omgevingsguard. De live-modus geeft uitsluitend op productie
 *    (VERCEL_ENV === "production") een client. Preview-deployments draaien
 *    tegen hetzelfde Supabase-project als productie, dus een profiel met
 *    is_test = false zou daar anders echt geld incasseren; lokale
 *    ontwikkeling valt bewust onder dezelfde regel. Zelfde discipline als
 *    src/lib/akiles.ts. De testmodus werkt in elke omgeving.
 * 2. Prefix-vangrail, beide richtingen. Een live-key begint bij Mollie
 *    altijd met "live_", een testkey met "test_". Een key met de verkeerde
 *    prefix wordt geweigerd. De test-richting is de belangrijkste: een
 *    testprofiel op een live-key incasseert echt geld.
 *
 * Een weigering door een vangrail is luid (één console.error met modus en
 * reden, nooit de key zelf, ook niet afgekort); een ONTBREKENDE key blijft
 * stil null, zoals voorheen.
 */
export type MollieMode = "live" | "test";

export type MollieKeyResolution =
  | { ok: true; apiKey: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "wrong_environment"; vercelEnv: string }
  | { ok: false; reason: "wrong_prefix"; prefix: string };

const KEY_PREFIX: Record<MollieMode, string> = { live: "live_", test: "test_" };

/** Alleen de bekende prefixen benoemen; nooit tekens uit de key zelf. */
function describePrefix(apiKey: string): string {
  if (apiKey.startsWith("live_")) return "live_";
  if (apiKey.startsWith("test_")) return "test_";
  return "geen live_/test_";
}

/**
 * Pure keuze van de key voor een modus, zonder cache of client. Gescheiden
 * van getMollieClient zodat de vangrails per omgeving testbaar zijn
 * (scripts/mollie/mollie-client.test.mts). Volgorde: ontbrekend (stil),
 * omgeving, prefix.
 */
export function resolveMollieApiKey(
  mode: MollieMode,
  env: NodeJS.ProcessEnv = process.env,
): MollieKeyResolution {
  const apiKey = mode === "test" ? env.MOLLIE_API_KEY_TEST : env.MOLLIE_API_KEY_LIVE;
  if (!apiKey) return { ok: false, reason: "missing" };
  if (mode === "live" && env.VERCEL_ENV !== "production") {
    return { ok: false, reason: "wrong_environment", vercelEnv: env.VERCEL_ENV ?? "(leeg)" };
  }
  if (!apiKey.startsWith(KEY_PREFIX[mode])) {
    return { ok: false, reason: "wrong_prefix", prefix: describePrefix(apiKey) };
  }
  return { ok: true, apiKey };
}

// Cache per modus, met de key erbij: verandert de env (tests, of een
// herconfiguratie zonder herstart), dan wordt de client opnieuw gebouwd in
// plaats van dat een oude client een vangrail omzeilt.
const clients = new Map<MollieMode, { apiKey: string; client: MollieClient }>();

export function getMollieClient(mode: MollieMode): MollieClient | null {
  const resolved = resolveMollieApiKey(mode);
  if (!resolved.ok) {
    if (resolved.reason === "wrong_environment") {
      console.error(
        `[mollie] live-modus geweigerd: VERCEL_ENV=${resolved.vercelEnv} is geen production`,
      );
    } else if (resolved.reason === "wrong_prefix") {
      console.error(
        `[mollie] ${mode}-modus geweigerd: key heeft prefix ${resolved.prefix}, verwacht ${KEY_PREFIX[mode]}`,
      );
    }
    return null;
  }
  const existing = clients.get(mode);
  if (existing && existing.apiKey === resolved.apiKey) return existing.client;
  const client = createMollieClient({ apiKey: resolved.apiKey });
  clients.set(mode, { apiKey: resolved.apiKey, client });
  return client;
}

export function isMollieConfigured(mode: MollieMode): boolean {
  return resolveMollieApiKey(mode).ok;
}

/**
 * Annuleer een Mollie-subscription zodat er geen verdere incasso meer plaatsvindt.
 * Idempotent: een al-geannuleerde of voltooide subscription telt als succes.
 * Geeft `false` terug bij een echte fout (Mollie niet geconfigureerd, ontbrekende
 * id's, of een API-fout), zodat de caller kan beslissen niet te flippen en later
 * te herproberen. Throwt nooit.
 */
export async function cancelMollieSubscription(
  mode: MollieMode,
  customerId: string | null,
  subscriptionId: string | null,
): Promise<boolean> {
  const mollie = getMollieClient(mode);
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
  mode: MollieMode,
  customerId: string | null,
  subscriptionId: string | null,
): Promise<MollieSubscriptionInfo | null> {
  const mollie = getMollieClient(mode);
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
  mode: MollieMode,
  customerId: string | null,
): Promise<boolean | null> {
  const mollie = getMollieClient(mode);
  if (!mollie || !customerId) return null;
  try {
    const page = await mollie.customerMandates.page({ customerId });
    return page.some((m) => m.status === MandateStatus.valid);
  } catch (err) {
    console.error("[hasValidMollieMandate] failed", err);
    return null;
  }
}

/**
 * Werk het bedrag van een lopende subscription bij (upgrade op de volgende
 * factuurdatum: het bedrag wijzigt NU zodat de eerstvolgende incasso
 * gegarandeerd het nieuwe bedrag is; de entitlements volgen op de
 * factuurdatum via de cron). Geeft `false` bij een fout zodat de caller
 * het verzoek kan terugdraaien. Throwt nooit.
 */
export async function updateMollieSubscriptionAmount(
  mode: MollieMode,
  customerId: string | null,
  subscriptionId: string | null,
  amountCents: number,
): Promise<boolean> {
  const mollie = getMollieClient(mode);
  if (!mollie || !customerId || !subscriptionId) return false;
  try {
    await mollie.customerSubscriptions.update(subscriptionId, {
      customerId,
      amount: {
        currency: "EUR",
        value: (amountCents / 100).toFixed(2),
      },
    });
    return true;
  } catch (err) {
    console.error("[updateMollieSubscriptionAmount] failed", err);
    return false;
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
  /** Moet de modus dragen: bouw hem met mollieWebhookUrl(mode), anders
   * komen recurring-incasso's van een testabonnement op de live-route. */
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
  mode: MollieMode,
  params: CreateRecurringSubscriptionParams,
): Promise<{ id: string } | null> {
  const mollie = getMollieClient(mode);
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
