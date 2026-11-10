"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureInvoicePayToken, creditedCentsByInvoice } from "@/lib/invoice-payments/server";
import { canPayOnline } from "@/lib/invoice-payments/status";

/**
 * Het lid klikt op "Betaal online" bij een openstaande factuur op
 * /app/facturen en gaat naar de publieke betaalpagina van die factuur. De
 * factuur wordt met de COOKIE-client gelezen (RLS invoices_self_read: alleen
 * eigen, gefinaliseerde, niet-test facturen); het token zelf is alleen met
 * de service-role client te lezen en bestaat idempotent na deze aanroep.
 */
export type MemberPayLinkResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function getMyInvoicePayPath(
  invoiceId: string,
): Promise<MemberPayLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Log eerst in." };
  }
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, status, total_gross_cents, payment_id, credit_of_invoice_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Factuur niet gevonden." };
  }
  const credited = (await creditedCentsByInvoice([inv.id])).get(inv.id) ?? 0;
  if (
    !canPayOnline({
      status: inv.status,
      isCreditNote: Boolean(inv.credit_of_invoice_id),
      totalGrossCents: inv.total_gross_cents,
      paymentId: inv.payment_id,
      creditedCents: credited,
    })
  ) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Deze factuur hoeft niet meer betaald te worden." };
  }
  const token = await ensureInvoicePayToken(inv.id);
  if (!token) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Betalen is nu niet beschikbaar. Probeer het later opnieuw." };
  }
  return { ok: true, path: `/factuur/betalen/${token}` };
}
