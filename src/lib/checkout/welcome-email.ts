import "server-only";
import * as React from "react";
import WelcomeCheckout from "@/emails/welcome_checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import {
  TEST_SUBJECT_PREFIX,
  buildOrderConfirmationDeps,
} from "@/lib/orders/order-confirmation";
import {
  sendOrderConfirmationOnce,
  type SendOnceResult,
} from "@/lib/orders/order-confirmation-core";

/**
 * Welkomstmail van de gastcheckout (scherm 10): orderbevestiging plus
 * inloglink in één mail, verstuurd achter dezelfde poort als de gewone
 * bevestigingsmail (tmc.events, order.confirmation_sent). Daardoor kan
 * nooit zowel de bevestiging als de welkomstmail vertrekken, en is een
 * herhaalde aanroep (webhook-retry, cron) automatisch een no-op zodra er
 * eenmaal gestuurd is.
 *
 * Het inlogtoken bestaat alleen als plaintext in het eerste resultaat van
 * convert_checkout_intent. Bij een herkansing zonder token wordt pas op het
 * moment van verzenden een nieuw token gemaakt (rotate_checkout_login_token),
 * dus alleen als de poort zegt dat er nog niets is verstuurd: een al
 * afgeleverde link wordt nooit ongeldig gemaakt door een retry.
 */
export interface WelcomeEmailArgs {
  orderId: string;
  intentId: string;
  /** Plaintext uit het convert-resultaat; ontbreekt bij een herkansing. */
  loginToken?: string | null;
  isTest: boolean;
}

export function welcomeUrl(loginToken: string): string {
  return `${siteUrl()}/welkom/${loginToken}`;
}

export async function sendWelcomeEmail(args: WelcomeEmailArgs): Promise<SendOnceResult> {
  const admin = createAdminClient();
  const deps = buildOrderConfirmationDeps({
    send: async ({ to, toName, props }) => {
      let token = args.loginToken ?? null;
      if (!token) {
        const { data, error } = await admin.rpc("rotate_checkout_login_token", {
          p_intent_id: args.intentId,
        });
        const result = data as { ok?: boolean; login_token?: string; reason?: string } | null;
        if (error || !result?.ok || !result.login_token) {
          // Alleen codes in de log, nooit het adres.
          console.error("[welcome-email] rotate failed", {
            intentId: args.intentId,
            code: error?.code ?? result?.reason ?? "unknown",
          });
          return false;
        }
        token = result.login_token;
      }
      return sendEmail({
        to,
        toName,
        // COPY: confirm met Marlon
        subject:
          (args.isTest ? TEST_SUBJECT_PREFIX : "") +
          "Welkom bij The Movement Club, je inloglink staat klaar",
        react: React.createElement(WelcomeCheckout, {
          order: props,
          loginUrl: welcomeUrl(token),
        }),
      });
    },
  });
  return sendOrderConfirmationOnce(deps, args.orderId);
}
