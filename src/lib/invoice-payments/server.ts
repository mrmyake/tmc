import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendNotification } from "@/lib/ntfy";
import { SITE } from "@/lib/constants";
import { siteUrl } from "@/lib/site-url";
import InvoicePaidNotice from "@/emails/invoice_paid_notice";
import { buildInvoicePaidNotice, uniqueSlugs } from "./notice";

/**
 * Serverkant van de factuurbetaling (spec-facturatie.md 9.7): token,
 * koppeling en interne melding. Alles via de service-role client; de
 * betaalstatus zit in payments en invoices.payment_id (write-once).
 */

/** Idempotent: geeft het bestaande token of maakt er een aan. Null bij een
 * fout, zodat PDF en mail terugvallen op alleen overmaken. */
export async function ensureInvoicePayToken(
  invoiceId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const read = async () => {
    const { data } = await admin
      .from("invoice_pay_tokens")
      .select("token")
      .eq("invoice_id", invoiceId)
      .maybeSingle();
    return data?.token ?? null;
  };
  const existing = await read();
  if (existing) return existing;
  const { error } = await admin
    .from("invoice_pay_tokens")
    .upsert({ invoice_id: invoiceId }, { onConflict: "invoice_id", ignoreDuplicates: true });
  if (error) {
    console.error("[invoice-pay] token aanmaken mislukte", error);
    return null;
  }
  return read();
}

/** Som van gefinaliseerde creditnota's per factuur, als positief bedrag. */
export async function creditedCentsByInvoice(
  invoiceIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (invoiceIds.length === 0) return out;
  const admin = createAdminClient();
  const { data } = await admin
    .from("invoices")
    .select("credit_of_invoice_id, total_gross_cents")
    .eq("status", "finalised")
    .in("credit_of_invoice_id", invoiceIds);
  for (const c of data ?? []) {
    if (!c.credit_of_invoice_id) continue;
    out.set(
      c.credit_of_invoice_id,
      (out.get(c.credit_of_invoice_id) ?? 0) - (c.total_gross_cents ?? 0),
    );
  }
  return out;
}

export type LinkOutcome = "won" | "replay" | "duplicate";

/**
 * Compare-and-swap op invoices.payment_id (write-once, migratie
 * 20261111100000): alleen als de factuur nog geen betaling heeft. won = nu
 * gekoppeld, replay = al aan deze betaling gekoppeld (herlevering),
 * duplicate = aan een andere betaling gekoppeld (te late dubbele betaling).
 */
export async function linkInvoicePayment(
  invoiceId: string,
  paymentRowId: string,
): Promise<LinkOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invoices")
    .update({ payment_id: paymentRowId })
    .eq("id", invoiceId)
    .is("payment_id", null)
    .select("id");
  if (error) throw error;
  if ((data?.length ?? 0) > 0) return "won";
  const { data: cur } = await admin
    .from("invoices")
    .select("payment_id")
    .eq("id", invoiceId)
    .maybeSingle();
  return cur?.payment_id === paymentRowId ? "replay" : "duplicate";
}

/** Ntfy en e-mail naar de studio. Throwt nooit. */
export async function notifyInvoicePaid(
  invoiceId: string,
  via: "online" | "overboeking",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: inv }, { data: lines }] = await Promise.all([
      admin
        .from("invoices")
        .select("invoice_number, bill_to_name, bill_to_company, total_gross_cents")
        .eq("id", invoiceId)
        .maybeSingle(),
      admin.from("invoice_lines").select("catalogue_slug").eq("invoice_id", invoiceId),
    ]);
    if (!inv) return;
    const notice = buildInvoicePaidNotice({
      invoiceNumber: inv.invoice_number ?? "",
      billToName: inv.bill_to_name,
      billToCompany: inv.bill_to_company,
      totalGrossCents: inv.total_gross_cents ?? 0,
      via,
      catalogueSlugs: uniqueSlugs((lines ?? []).map((l) => l.catalogue_slug)),
      invoiceUrl: `${siteUrl()}/app/admin/facturen/${invoiceId}#product-klaarzetten`,
    });
    await sendNotification(notice.title, notice.message, "moneybag");
    await sendEmail({
      to: SITE.email,
      subject: notice.title,
      react: InvoicePaidNotice({ title: notice.title, lines: notice.lines }),
    });
  } catch (e) {
    console.error("[invoice-pay] melding bij betaling mislukte", e);
  }
}
