import { NextResponse } from "next/server";
import { SequenceType } from "@mollie/api-client";
import { getMollieClient, type MollieMode } from "@/lib/mollie";
import { createAdminClient } from "@/lib/supabase/admin";
import { writePaymentWithTransition } from "@/lib/payments/payment-write-core";
import {
  processPaymentRefund,
  syncPaymentRefundsFromMollie,
} from "@/lib/refunds/process";
import {
  CHARGEBACK_ROW_SELECT,
  syncPaymentChargebacksFromMollie,
  type ChargebackRowDb,
} from "@/lib/chargebacks/process";
import { classifyFailure, describeError } from "@/lib/orders/activation-failure";
import { emitEvent } from "@/lib/events/emit";
import { sendNotification } from "@/lib/ntfy";
import { siteUrl } from "@/lib/site-url";
import { formatEuroCentsSigned } from "@/lib/format";
import {
  linkInvoicePayment,
  notifyInvoicePaid,
  type LinkOutcome,
} from "@/lib/invoice-payments/server";

/**
 * Mollie-webhook voor factuurbetalingen (spec-facturatie.md 9.7), naar het
 * model van /api/bookings/extra-class/webhook. Modus uit de eigen URL (alles
 * wat niet exact "test" is, is live). De betaling wordt gevonden op
 * metadata.invoiceId.
 *
 * Volgorde bij paid: eerst de compare-and-swap op invoices.payment_id
 * (write-once), dan de betaalregel spiegelen. Won of replay: de betaling
 * hoort bij de factuur. Duplicate: de factuur was al betaald (overboeking of
 * een eerdere online betaling); deze betaling wordt losgekoppeld
 * (invoice_id null), terugbetaald en gemeld. De factuurbetaling heeft geen
 * bijwerkingen buiten payments en de factuur: een product bij de factuur
 * wordt niet geactiveerd.
 *
 * Responscodes: 200 op alles wat verwerkt is of waarvan herhaling dezelfde
 * uitkomst geeft; 500 op transiente fouten zodat Mollie herhaalt.
 */
export async function POST(request: Request) {
  let paymentId = "";
  try {
    const formData = await request.formData();
    paymentId = String(formData.get("id") ?? "");
    if (!paymentId) return NextResponse.json({ ok: true });

    const mode: MollieMode =
      new URL(request.url).searchParams.get("mode") === "test" ? "test" : "live";
    const mollie = getMollieClient(mode);
    if (!mollie) {
      console.error(`[invoices/webhook] mollie not configured (mode=${mode})`);
      return NextResponse.json({ ok: false, error: "mollie_not_configured" }, { status: 500 });
    }

    const admin = createAdminClient();
    let payment;
    try {
      payment = await mollie.payments.get(paymentId);
    } catch (e) {
      console.error(`[invoices/webhook] payments.get failed (id=${paymentId}, mode=${mode})`, e);
      if (classifyFailure(e) === "transient") {
        return NextResponse.json({ ok: false, error: "payments_get_transient" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    const meta = (payment.metadata ?? {}) as Record<string, unknown>;
    const invoiceId = typeof meta.invoiceId === "string" ? meta.invoiceId : null;
    if (meta.type !== "invoice" || !invoiceId) {
      console.warn("[invoices/webhook] geen factuurbetaling", payment.id);
      return NextResponse.json({ ok: true });
    }

    const { data: invoice } = await admin
      .from("invoices")
      .select(
        "id, invoice_number, is_test, profile_id, total_gross_cents, subtotal_net_cents, vat_total_cents",
      )
      .eq("id", invoiceId)
      .maybeSingle();
    if (!invoice) {
      console.warn("[invoices/webhook] factuur niet gevonden", invoiceId);
      return NextResponse.json({ ok: true });
    }

    const amountCents = Math.round(parseFloat(payment.amount.value) * 100);
    const { data: lineRates } = await admin
      .from("invoice_lines")
      .select("vat_rate_bp")
      .eq("invoice_id", invoice.id);
    const rates = new Set((lineRates ?? []).map((l) => l.vat_rate_bp));
    const vatRate = rates.size === 1 ? Array.from(rates)[0] : null;

    // De betaalregel moet bestaan voor de koppeling (de trigger eist een
    // betaling met invoice_id = deze factuur). Normaal bestaat hij sinds het
    // starten van de poging; anders maken we hem hier aan.
    await admin.from("payments").upsert(
      {
        mollie_payment_id: payment.id,
        profile_id: invoice.profile_id,
        invoice_id: invoice.id,
        amount_cents: amountCents,
        status: "open",
        kind: "invoice",
        description: `Factuur ${invoice.invoice_number} (online)`,
        is_test: invoice.is_test,
      },
      { onConflict: "mollie_payment_id", ignoreDuplicates: true },
    );
    const { data: row } = await admin
      .from("payments")
      .select("id")
      .eq("mollie_payment_id", payment.id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ ok: false, error: "payment_row_missing" }, { status: 500 });
    }

    let link: LinkOutcome | null = null;
    if (payment.status === "paid") {
      link = await linkInvoicePayment(invoice.id, row.id);
    }
    const duplicate = link === "duplicate";

    const paymentFields = {
      profile_id: invoice.profile_id,
      invoice_id: duplicate ? null : invoice.id,
      amount_cents: amountCents,
      status: payment.status,
      method: payment.method ?? null,
      description: duplicate
        ? `Dubbele betaling factuur ${invoice.invoice_number} (online)`
        : (payment.description ?? null),
      paid_at: payment.paidAt ?? null,
      kind: "invoice",
      is_test: invoice.is_test,
      vat_rate_bp: vatRate,
      vat_amount_cents: invoice.vat_total_cents,
      net_amount_cents: invoice.subtotal_net_cents,
    };
    const { row: paymentRow, transitioned } =
      await writePaymentWithTransition<ChargebackRowDb>({
        transition: async () => {
          const { data, error } = await admin
            .from("payments")
            .update(paymentFields)
            .eq("mollie_payment_id", payment.id)
            .neq("status", payment.status)
            .select(CHARGEBACK_ROW_SELECT)
            .maybeSingle<ChargebackRowDb>();
          if (error) {
            console.error("[invoices/webhook] payments transition failed", error);
            return null;
          }
          return data ?? null;
        },
        insertIfAbsent: async () => null,
        read: async () => {
          const { data } = await admin
            .from("payments")
            .select(CHARGEBACK_ROW_SELECT)
            .eq("mollie_payment_id", payment.id)
            .maybeSingle<ChargebackRowDb>();
          return data ?? null;
        },
      });

    // De status moet na afloop echt op Mollie's status staan: een mislukte
    // overgang (bijvoorbeeld de unieke index) laat Mollie herhalen.
    if (payment.status === "paid" && paymentRow === null) {
      return NextResponse.json({ ok: false, error: "payment_write_failed" }, { status: 500 });
    }

    if (paymentRow) {
      await syncPaymentRefundsFromMollie({
        paymentRowId: paymentRow.id,
        molliePaymentId: payment.id,
        amountRefundedValue: payment.amountRefunded?.value,
        isTest: invoice.is_test,
      });
      await syncPaymentChargebacksFromMollie({
        mollie,
        row: paymentRow,
        view: {
          amountChargedBackCents: payment.amountChargedBack
            ? Math.round(parseFloat(payment.amountChargedBack.value) * 100)
            : 0,
          sequenceType: payment.sequenceType === SequenceType.oneoff ? "oneoff" : null,
          subscriptionId: null,
          metadataType: "invoice",
        },
      });
    }

    if (payment.status === "paid" && transitioned) {
      if (!duplicate) {
        await emitEvent({
          type: "payment.received",
          actorType: "system",
          subjectType: "payment",
          subjectId: null,
          payload: {
            dedupe_key: payment.id,
            payment_id: payment.id,
            profile_id: invoice.profile_id,
            invoice_id: invoice.id,
            amount_cents: amountCents,
          },
        });
        if (link === "won") await notifyInvoicePaid(invoice.id, "online");
      } else {
        // Te late dubbele betaling: terugbetalen en melden. De refund-intentie
        // gaat via het gedeelde pad (processPaymentRefund), nooit rechtstreeks
        // naar Mollie.
        const { data: intent } = await admin
          .from("payment_refunds")
          .insert({ payment_id: row.id, amount_cents: amountCents, status: "requested" })
          .select("id")
          .single();
        let refundNote = "Terugbetaling kon niet worden gestart; doe het handmatig in Mollie.";
        if (intent) {
          const res = await processPaymentRefund(intent.id);
          if (res.ok) refundNote = "Terugbetaling is gestart.";
        }
        await sendNotification(
          // COPY: confirm met Marlon
          `Dubbele betaling factuur ${invoice.invoice_number}`,
          `Er is online ${formatEuroCentsSigned(amountCents)} betaald op een factuur die al betaald was. ${refundNote} Controleer ${siteUrl()}/app/admin/facturen/${invoice.id}`,
          "warning,money_with_wings",
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /invoices/webhook]", paymentId, describeError(e).message);
    if (classifyFailure(e) === "transient") {
      return NextResponse.json({ ok: false, error: "unhandled_transient" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
}
