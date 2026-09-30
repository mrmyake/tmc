import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { verifyCronAuth } from "@/lib/cron-auth";
import { processCheckoutIntentPayment } from "@/lib/checkout/intent-webhook";
import type { ActivationCaller } from "@/lib/orders/activation-chain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CALLER: ActivationCaller = { source: "reconcile_checkout_intents_cron", actorType: "system" };

/**
 * Uurlijkse reconciliatie van pending checkout-intents (besluit 6, PR 2):
 * de backstop voor een gemiste of mislukte webhook-levering. Leest via
 * list_stale_pending_checkout_intents (pending ouder dan 2 uur op
 * updated_at) en vraagt per rij de betaling op bij Mollie in de modus van
 * de intent. paid: dezelfde conversie plus activatieketen als de webhook,
 * inline (geen after()). canceled, failed of expired: cancel_checkout_intent.
 * Nog open bij Mollie: laten staan; een first-betaling kan dagen open
 * blijven. Expiry, PII-wis en de welkomstmail-herkansing zitten in de
 * dagelijkse expire-orders.
 */
export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("list_stale_pending_checkout_intents", {
    p_older_than: "2 hours",
    p_limit: 50,
  });
  if (error) {
    console.error("[cron/reconcile-checkout-intents] list failed", error.code);
    return NextResponse.json({ ok: false, error: error.code }, { status: 500 });
  }
  const rows = (data ?? []) as Array<{ id: string; mode: MollieMode; mollie_payment_id: string }>;

  const counts = { converted: 0, cancelled: 0, retry: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    const mollie = getMollieClient(row.mode);
    if (!mollie) {
      counts.skipped += 1;
      continue;
    }
    try {
      const payment = await mollie.payments.get(row.mollie_payment_id);
      if (!["paid", "failed", "canceled", "expired"].includes(payment.status)) {
        counts.skipped += 1;
        continue;
      }
      const result = await processCheckoutIntentPayment({
        admin,
        mollie,
        mode: row.mode,
        intentId: row.id,
        payment: {
          id: payment.id,
          status: payment.status,
          paidAt: payment.paidAt ?? null,
          amountCents: Math.round(parseFloat(payment.amount.value) * 100),
        },
        caller: CALLER,
      });
      const kind = result.outcome.kind;
      if (kind === "converted") counts.converted += 1;
      else if (kind === "cancelled") counts.cancelled += 1;
      else if (kind === "retry") counts.retry += 1;
      else if (kind === "failed") counts.failed += 1;
      else counts.skipped += 1;
    } catch (err) {
      console.error("[cron/reconcile-checkout-intents] reconcile failed", row.id, (err as { code?: string })?.code ?? "error");
      counts.retry += 1;
    }
  }

  return NextResponse.json({ ok: true, checked: rows.length, ...counts });
}
