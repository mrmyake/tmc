import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MollieClient } from "@mollie/api-client";
import type { MollieMode } from "@/lib/mollie";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { classifyFailure, registerFailure } from "@/lib/orders/activation-failure";
import {
  runActivationChain,
  type ActivationCaller,
  type ActivationOptions,
  type ActivationResult,
} from "@/lib/orders/activation-chain";
import {
  handleCheckoutIntentPayment,
  type CheckoutIntentRow,
  type IntentPaymentView,
  type IntentWebhookDeps,
  type IntentWebhookOutcome,
} from "./intent-webhook-core";
import { sendWelcomeEmail } from "./welcome-email";

/**
 * Echte afhankelijkheden voor intent-webhook-core, gedeeld door de Mollie-
 * webhook, de uurlijkse reconciliatie en het staf-script retry-intent.
 * Leest de intent via de service role (lezen mag; alle writes lopen via de
 * RPC's uit PR 1 en 1b).
 */
const INTENT_COLUMNS =
  "id, status, mode, kind, catalogue_slug, first_charge_cents, email, first_name, last_name, acquisition_source, acquisition_medium, acquisition_campaign, acquisition_content, signup_path, first_touch_at, mollie_payment_id, paid_at, profile_id, order_id, conversion_error";

export function buildIntentWebhookDeps(admin: SupabaseClient): IntentWebhookDeps {
  return {
    db: {
      getIntent: async (intentId) => {
        const { data, error } = await admin
          .from("checkout_intents")
          .select(INTENT_COLUMNS)
          .eq("id", intentId)
          .maybeSingle();
        if (error) throw error;
        return (data as CheckoutIntentRow | null) ?? null;
      },
      convert: async ({ intentId, profileId, paymentId, paidAt, profileCreated }) => {
        const { data, error } = await admin.rpc("convert_checkout_intent", {
          p_intent_id: intentId,
          p_profile_id: profileId,
          p_mollie_payment_id: paymentId,
          p_paid_at: paidAt,
          p_profile_created: profileCreated,
        });
        if (error) throw error;
        return (data ?? { ok: false, reason: "empty_result" }) as Awaited<
          ReturnType<IntentWebhookDeps["db"]["convert"]>
        >;
      },
      fail: async ({ intentId, code, paidAt }) => {
        const { error } = await admin.rpc("fail_checkout_intent", {
          p_intent_id: intentId,
          p_error_code: code,
          p_paid_at: paidAt,
        });
        if (error) console.error("[intent-webhook] fail_checkout_intent", intentId, error.code);
      },
      cancel: async ({ intentId, paymentId }) => {
        const { error } = await admin.rpc("cancel_checkout_intent", {
          p_intent_id: intentId,
          p_mollie_payment_id: paymentId,
        });
        if (error) console.error("[intent-webhook] cancel_checkout_intent", intentId, error.code);
      },
    },
    auth: {
      createUser: async ({ email, intentId, firstName, lastName, acquisition }) => {
        // app_metadata draagt de intent-marker (leden kunnen hun eigen
        // app_metadata niet wijzigen, user_metadata wel). Nooit phone in
        // welke metadata dan ook: de trigger zou de hele aanmaak terugrollen
        // bij een botsing op profiles_phone_unique; convert vult het nummer.
        const { data, error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          app_metadata: { checkout_intent_id: intentId },
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            ...Object.fromEntries(Object.entries(acquisition).filter(([, v]) => v)),
          },
        });
        if (error) {
          if (error.code === "email_exists" || error.status === 422) {
            return { ok: false, emailExists: true };
          }
          return { ok: false, error };
        }
        if (!data.user) return { ok: false, error: new Error("createUser gaf geen user terug") };
        return { ok: true, userId: data.user.id };
      },
      userIdForEmail: async (email) => {
        const { data, error } = await admin.rpc("auth_user_id_for_email", { p_email: email });
        if (error) throw error;
        return (data as string | null) ?? null;
      },
      intentMarkerForUser: async (userId) => {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error || !data.user) return null;
        const marker = (data.user.app_metadata as Record<string, unknown> | undefined)?.checkout_intent_id;
        return typeof marker === "string" ? marker : null;
      },
    },
    isTransient: (error) => classifyFailure(error) === "transient",
    notify: (title, message, tags) => sendNotification(title, message, tags),
    emit: (event) =>
      emitEvent({
        type: event.type,
        actorType: "system",
        actorId: null,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        payload: event.payload,
      }),
    now: () => new Date(),
  };
}

export interface ProcessIntentPaymentArgs {
  admin: SupabaseClient;
  mollie: MollieClient;
  mode: MollieMode;
  intentId: string;
  payment: IntentPaymentView;
  caller: ActivationCaller;
  defer?: ActivationOptions["defer"];
}

export type ProcessIntentPaymentResult =
  | { outcome: IntentWebhookOutcome; activation: null }
  | { outcome: Extract<IntentWebhookOutcome, { kind: "converted" }>; activation: ActivationResult };

/**
 * Conversie plus de bestaande activatieketen, als één stap voor alle drie
 * de aanroepers. Bij "converted" draait runActivationChain met isTest en de
 * welkomstmail als bevestiging (zelfde poort order.confirmation_sent). Een
 * "retry" wordt hier geregistreerd (webhook.failed) en teruggegeven; de
 * webhook maakt er een 500 van, een cron probeert de volgende run.
 */
export async function processCheckoutIntentPayment(
  args: ProcessIntentPaymentArgs,
): Promise<ProcessIntentPaymentResult> {
  const deps = buildIntentWebhookDeps(args.admin);
  const outcome = await handleCheckoutIntentPayment(deps, {
    intentId: args.intentId,
    payment: args.payment,
    mode: args.mode,
  });

  if (outcome.kind === "retry") {
    await registerFailure({
      source: args.caller.source,
      path: outcome.reason.startsWith("auth") ? "auth_create_user" : "checkout_intent_convert",
      molliePaymentId: args.payment.id,
      mode: args.mode,
      error: outcome.error ?? new Error(outcome.reason),
      classification: "transient",
      extra: { intent_id: outcome.intentId, reason: outcome.reason },
    });
    return { outcome, activation: null };
  }
  if (outcome.kind !== "converted") return { outcome, activation: null };

  const activation = await runActivationChain(
    args.caller,
    {
      supabase: args.admin,
      mollie: args.mollie,
      mode: args.mode,
      orderId: outcome.orderId,
      payment: { id: args.payment.id, amountCents: args.payment.amountCents },
      profileId: outcome.profileId,
      isTest: outcome.isTest,
    },
    {
      defer: args.defer,
      sendConfirmation: (orderId) =>
        sendWelcomeEmail({
          orderId,
          intentId: outcome.intentId,
          loginToken: outcome.loginToken,
          isTest: outcome.isTest,
        }),
    },
  );
  return { outcome, activation };
}
