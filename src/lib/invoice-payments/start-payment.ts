"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { siteUrl, invoiceWebhookUrl } from "@/lib/site-url";
import { creditedCentsByInvoice } from "./server";
import {
  startInvoicePaymentCore,
  type InvoicePayDeps,
  type InvoicePayResult,
  type PayInvoice,
} from "./pay-core";
import { isValidPayToken } from "./pay-url";
import { onlinePaymentAvailable } from "./availability";
import type { PollOutcome } from "@/lib/orders/status-actions";

/**
 * Publieke server action achter /factuur/betalen/<token>: het token is de
 * enige poort (geen login). Start of hervat de Mollie-betaling voor het
 * exacte factuurtotaal; alle logica staat in pay-core.ts. De modus volgt
 * uit invoices.is_test (snapshot van profiles.is_test): een testfactuur kan
 * alleen met de testkey, en de live-key werkt uitsluitend op productie
 * (vangrails in src/lib/mollie.ts).
 */
export async function startInvoicePayment(
  token: string,
): Promise<InvoicePayResult> {
  if (!isValidPayToken(token)) return { ok: false, reason: "not_found" };
  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("invoice_pay_tokens")
    .select("invoice_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return { ok: false, reason: "not_found" };

  const { data: inv } = await admin
    .from("invoices")
    .select(
      "id, invoice_number, status, is_test, total_gross_cents, payment_id, credit_of_invoice_id, profile_id",
    )
    .eq("id", tokenRow.invoice_id)
    .maybeSingle();
  const mode = inv?.is_test ? ("test" as const) : ("live" as const);

  // Staat de Mollie-modus van deze factuur in deze omgeving niet aan (een
  // LIVE-factuur op een preview, of een ontbrekende key), dan is dat geen
  // storing maar "kan hier niet": een eigen uitkomst, zodat de pagina dat
  // duidelijk zegt in plaats van "er ging iets mis".
  if (!onlinePaymentAvailable(inv?.is_test ?? false)) {
    console.warn(`[invoice-pay] online betalen niet beschikbaar in deze omgeving (mode=${mode})`);
    return { ok: false, reason: "unavailable" };
  }
  const mollie = getMollieClient(mode);
  if (!mollie) {
    console.error(`[invoice-pay] Mollie niet geconfigureerd (mode=${mode})`);
    return { ok: false, reason: "try_again" };
  }

  const deps: InvoicePayDeps = {
    db: {
      async getInvoiceByToken() {
        if (!inv || !inv.invoice_number) return null;
        const credited = await creditedCentsByInvoice([inv.id]);
        const row: PayInvoice = {
          id: inv.id,
          invoice_number: inv.invoice_number,
          status: inv.status,
          is_test: inv.is_test,
          total_gross_cents: inv.total_gross_cents,
          payment_id: inv.payment_id,
          credit_of_invoice_id: inv.credit_of_invoice_id,
          profile_id: inv.profile_id,
          credited_cents: credited.get(inv.id) ?? 0,
        };
        return row;
      },
      async listAttempts(invoiceId) {
        const { data } = await admin
          .from("payments")
          .select("mollie_payment_id, status")
          .eq("invoice_id", invoiceId)
          .eq("kind", "invoice")
          .not("mollie_payment_id", "like", "bank:%")
          .order("created_at", { ascending: true });
        return data ?? [];
      },
      async insertAttempt(row) {
        await admin
          .from("payments")
          .upsert(
            { ...row, kind: "invoice" },
            { onConflict: "mollie_payment_id", ignoreDuplicates: true },
          );
      },
    },
    mollie: {
      async getPayment(paymentId) {
        const p = await mollie.payments.get(paymentId);
        return { id: p.id, status: p.status, checkoutUrl: p.getCheckoutUrl() };
      },
      async createPayment(args) {
        const p = await mollie.payments.create({
          amount: { currency: "EUR", value: args.amountValue },
          description: args.description,
          redirectUrl: args.redirectUrl,
          webhookUrl: args.webhookUrl,
          metadata: {
            type: "invoice",
            invoiceId: args.invoiceId,
            profileId: args.profileId,
          },
          idempotencyKey: args.idempotencyKey,
        });
        return { id: p.id, status: p.status, checkoutUrl: p.getCheckoutUrl() };
      },
    },
    urls: { site: siteUrl(), webhook: invoiceWebhookUrl(mode) },
  };

  try {
    return await startInvoicePaymentCore(deps, token);
  } catch (e) {
    console.error("[startInvoicePayment]", e);
    return { ok: false, reason: "try_again" };
  }
}

/**
 * Voor StatusPoller op de betaalpagina na de Mollie-redirect: klaar zodra de
 * factuur aan een betaling gekoppeld is (de webhook heeft verwerkt).
 */
export async function getInvoicePayStatus(token: string): Promise<PollOutcome> {
  if (!isValidPayToken(token)) return "failed";
  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("invoice_pay_tokens")
    .select("invoice_id")
    .eq("token", token)
    .maybeSingle();
  if (!tokenRow) return "failed";
  const { data, error } = await admin
    .from("invoices")
    .select("payment_id")
    .eq("id", tokenRow.invoice_id)
    .maybeSingle();
  if (error) return "pending";
  return data?.payment_id ? "done" : "pending";
}
