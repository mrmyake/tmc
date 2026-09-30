"use server";

import { headers } from "next/headers";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { SequenceType } from "@mollie/api-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { trialBookingMode } from "@/lib/mollie-mode";
import { siteUrl, mollieWebhookUrl } from "@/lib/site-url";
import { emitEvent } from "@/lib/events/emit";
import { isGuestCheckoutEnabled } from "@/lib/checkout/guest-flag";
import {
  GUEST_COPY,
  startGuestCheckoutCore,
  type GuestCheckoutDeps,
  type GuestCheckoutInput,
  type GuestCheckoutResult,
} from "@/lib/checkout/guest-checkout-core";
import {
  retryIntentPaymentCore,
  type IntentRetryDeps,
  type IntentRetryResult,
  type RetryIntentView,
} from "@/lib/checkout/intent-retry-core";

/**
 * Server actions van de gastcheckout ("betalen voor account", PR 2). De
 * kernen staan in src/lib/checkout/*-core.ts; hier alleen de echte
 * afhankelijkheden: service-role-client, Mollie, headers en de vlag.
 *
 * Mollie-modus op VERCEL_ENV (besluit 6): production live, anders test.
 * Zelfde helper als de proeflesflow; een ingelogde checkout houdt zijn
 * eigen is_test-logica in create-order.ts.
 */

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

function disabled(): GuestCheckoutResult {
  // COPY: confirm met Marlon
  return { ok: false, reason: "unexpected_error", error: "Deze manier van aanmelden is nog niet beschikbaar." };
}

export async function startGuestCheckout(input: GuestCheckoutInput): Promise<GuestCheckoutResult> {
  if (!isGuestCheckoutEnabled()) return disabled();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, reason: "unexpected_error", error: GUEST_COPY.unexpected };
  }
  const mode = trialBookingMode();
  const mollie = getMollieClient(mode);
  if (!mollie) return { ok: false, reason: "mollie_unavailable", error: GUEST_COPY.mollieUnavailable };

  const admin = createAdminClient();
  const ip = await clientIp();

  const deps: GuestCheckoutDeps = {
    mode,
    ip,
    rateLimit: async (visitorIp) => {
      // Zelfde emmer als de proefcodes, eigen sleutel: 10 per 30 minuten,
      // daarna 15 minuten slot (register_trial_code_attempt). Elke aanroep
      // telt, ook een geslaagde; de rij wordt hier nooit gewist.
      const { data, error } = await admin.rpc("register_trial_code_attempt", {
        p_ip: `checkout:${visitorIp}`,
      });
      if (error) {
        console.error("[guest-checkout] rate limit rpc", error.code);
        return false;
      }
      return Boolean((data as { allowed?: boolean } | null)?.allowed);
    },
    auth: {
      userIdForEmail: async (email) => {
        const { data, error } = await admin.rpc("auth_user_id_for_email", { p_email: email });
        if (error) {
          console.error("[guest-checkout] auth_user_id_for_email", error.code);
          throw error;
        }
        return (data as string | null) ?? null;
      },
      sendLoginCode: async (email) => {
        // Bestaand account: de inlogcode van /login, verstuurd met het IP
        // van de bezoeker zodat Supabase per bezoeker begrenst en niet op
        // het Vercel-IP. shouldCreateUser false: hier ontstaat niets.
        const authClient = createBareClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          ...(ip !== "unknown" ? { global: { headers: { "Sb-Forwarded-For": ip } } } : {}),
        });
        const { error } = await authClient.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (error) {
          console.warn("[guest-checkout] signInWithOtp", error.code, error.status);
          return {
            ok: false,
            rateLimited: error.code === "over_email_send_rate_limit" || error.status === 429,
          };
        }
        return { ok: true };
      },
    },
    db: {
      phoneInUse: async (phoneE164) => {
        const { data, error } = await admin
          .from("profiles")
          .select("id")
          .eq("phone", phoneE164)
          .limit(1);
        if (error) {
          console.error("[guest-checkout] phone lookup", error.code);
          return false;
        }
        return (data?.length ?? 0) > 0;
      },
      createIntent: async (a) => {
        const { data, error } = await admin.rpc("create_checkout_intent", {
          p_mode: a.mode,
          p_slug: a.slug,
          p_extended_access: a.extendedAccess,
          p_commit_24m: a.commit24m,
          p_early_member: a.earlyMember,
          p_email: a.email,
          p_first_name: a.firstName,
          p_last_name: a.lastName,
          p_phone: a.phoneE164,
          p_street_address: a.streetAddress,
          p_postal_code: a.postalCode,
          p_city: a.city,
          p_acquisition: a.acquisition,
          p_ga_client_id: a.gaClientId,
          p_ga_session_id: a.gaSessionId,
          p_return_target: a.returnTarget,
        });
        if (error) {
          console.error("[guest-checkout] create_checkout_intent", error.code);
          return { ok: false, reason: "rpc_error" };
        }
        return (data ?? { ok: false, reason: "rpc_error" }) as Awaited<ReturnType<GuestCheckoutDeps["db"]["createIntent"]>>;
      },
      markPending: async ({ intentId, paymentId, customerId }) => {
        const { data, error } = await admin.rpc("mark_checkout_intent_pending", {
          p_intent_id: intentId,
          p_mollie_payment_id: paymentId,
          p_mollie_customer_id: customerId,
        });
        if (error) return { ok: false, reason: error.code ?? "rpc_error" };
        const r = data as { ok?: boolean; reason?: string } | null;
        return { ok: Boolean(r?.ok), reason: r?.reason };
      },
    },
    mollie: {
      createCustomer: async ({ name, email, intentId }) => {
        const customer = await mollie.customers.create({
          name,
          email,
          metadata: { checkout_intent_id: intentId },
        });
        return customer.id;
      },
      createPayment: async (a) => {
        const payment = await mollie.payments.create({
          amount: { currency: "EUR", value: a.amountValue },
          description: a.description,
          redirectUrl: a.redirectUrl,
          webhookUrl: a.webhookUrl,
          customerId: a.customerId,
          ...(a.isSubscription ? { sequenceType: SequenceType.first } : {}),
          metadata: { type: "checkout_intent", intentId: a.intentId, mode: a.mode },
          idempotencyKey: a.idempotencyKey,
        });
        return { id: payment.id, checkoutUrl: payment.getCheckoutUrl() ?? null };
      },
    },
    urls: { site: siteUrl(), webhook: mollieWebhookUrl(mode) },
    emit: (event) =>
      emitEvent({
        type: event.type,
        actorType: "visitor",
        actorId: null,
        subjectType: "checkout_intent",
        subjectId: event.subjectId,
        payload: event.payload,
      }),
  };

  try {
    return await startGuestCheckoutCore(deps, input);
  } catch (err) {
    console.error("[guest-checkout] unexpected", (err as { code?: string })?.code ?? "error");
    return { ok: false, reason: "unexpected_error", error: GUEST_COPY.unexpected };
  }
}

/** "Opnieuw proberen" op de publieke bedankpagina: nieuwe betaling op dezelfde intent. */
export async function retryGuestCheckoutPayment(
  statusToken: string,
): Promise<IntentRetryResult> {
  // Een nieuwe betaling starten mag niet met de vlag uit; de bedankpagina
  // zelf blijft werken en toont dan de contactoptie.
  if (!isGuestCheckoutEnabled()) return { ok: false, reason: "disabled" };
  const admin = createAdminClient();

  const deps: IntentRetryDeps = {
    db: {
      forRetry: async (token) => {
        const { data, error } = await admin.rpc("checkout_intent_for_retry", {
          p_status_token: token,
        });
        if (error) throw error;
        const r = data as ({ ok: boolean } & RetryIntentView) | { ok: false } | null;
        return r && r.ok ? (r as RetryIntentView) : null;
      },
      replacePayment: async ({ intentId, oldPaymentId, newPaymentId }) => {
        const { data, error } = await admin.rpc("replace_checkout_intent_payment", {
          p_intent_id: intentId,
          p_old_payment_id: oldPaymentId,
          p_new_payment_id: newPaymentId,
        });
        if (error) return { ok: false, reason: error.code ?? "rpc_error" };
        const r = data as { ok?: boolean; reason?: string } | null;
        return { ok: Boolean(r?.ok), reason: r?.reason };
      },
    },
    mollie: {
      getPayment: async (paymentId) => {
        // Modus staat op de intent; forRetry leverde hem, maar getPayment
        // krijgt hem niet mee. Beide modi proberen is niet nodig: de intent
        // is op deze deployment gemaakt, dus de deployment-modus klopt.
        const client = getMollieClient(trialBookingMode());
        if (!client) throw new Error("mollie_not_configured");
        const p = await client.payments.get(paymentId);
        return { status: p.status, checkoutUrl: p.getCheckoutUrl() ?? null };
      },
      createPayment: async (a) => {
        const client = getMollieClient(a.mode);
        if (!client) throw new Error("mollie_not_configured");
        const payment = await client.payments.create({
          amount: { currency: "EUR", value: a.amountValue },
          description: a.description,
          redirectUrl: a.redirectUrl,
          webhookUrl: mollieWebhookUrl(a.mode),
          customerId: a.customerId,
          ...(a.isSubscription ? { sequenceType: SequenceType.first } : {}),
          metadata: { type: "checkout_intent", intentId: a.intentId, mode: a.mode },
          idempotencyKey: a.idempotencyKey,
        });
        return { id: payment.id, checkoutUrl: payment.getCheckoutUrl() ?? null };
      },
    },
    urls: { site: siteUrl(), webhook: mollieWebhookUrl(trialBookingMode()) },
  };

  try {
    return await retryIntentPaymentCore(deps, statusToken);
  } catch (err) {
    console.error("[guest-checkout] retry unexpected", (err as { code?: string })?.code ?? "error");
    return { ok: false, reason: "try_again" };
  }
}
