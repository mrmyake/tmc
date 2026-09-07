"use server";

import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./require-admin";
import { computeLine, type InvoiceLineInput } from "./invoice-lib";
import {
  CustomerInvoicePdf,
  type CustomerInvoiceData,
} from "@/pdfs/CustomerInvoicePdf";
import { getSiteSettings } from "../../../sanity/lib/fetch";
import { sendEmail } from "@/lib/email";
import { formatEuro } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";
import InvoiceReady from "@/emails/invoice_ready";

/**
 * Adminkant van de facturatie (spec-facturatie.md 9.1-9.6). Schrijfpaden
 * lopen via de service-role client (authenticated heeft bewust geen
 * INSERT/UPDATE-grant op de invoice-tabellen); finaliseren loopt via de
 * tmc.finalize_invoice-RPC met de COOKIE-client, zodat de is_admin-gate in
 * de database ook echt gebruikt wordt (defense in depth, zelfde laagdeling
 * als admin_cancel_order). De PDF-stap staat buiten de RPC (5.1: nummer
 * eerst, document daarna) en pdf_path is write-once; de trigger weigert
 * een tweede schrijfactie en die weigering laten we hier gewoon
 * doorschijnen in plaats van hem voor te zijn.
 */

export type InvoiceActionResult =
  | { ok: true; invoiceId?: string; invoiceNumber?: string }
  | { ok: false; error: string };

async function audit(
  adminId: string,
  action: string,
  invoiceId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_type: "invoice",
    target_id: invoiceId,
    details,
  });
}

/** 9.1: factuur vanaf een paid-betaalregel; regels uit pricing_snapshot. */
export async function createInvoiceFromPayment(
  paymentId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: payment } = await admin
    .from("payments")
    .select(
      "id, profile_id, order_id, amount_cents, status, is_test, vat_rate_bp, description",
    )
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Betaling niet gevonden." };
  }
  if (payment.status !== "paid") {
    // COPY: confirm met Marlon
    return { ok: false, error: "Alleen op een betaalde regel kan een factuur gemaakt worden." };
  }
  if (!payment.profile_id) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Deze betaling hangt niet aan een lid." };
  }

  // Regels: per component uit orders.pricing_snapshot (basis, add-on,
  // inschrijfgeld), elk met eigen tarief en omschrijving; bedragen uit het
  // snapshot, niet uit de huidige catalogus (9.1). Zonder order: één regel
  // op basis van de betaalregel zelf.
  const lines: InvoiceLineInput[] = [];
  let orderId: string | null = null;
  if (payment.order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("id, catalogue_slug, pricing_snapshot")
      .eq("id", payment.order_id)
      .maybeSingle();
    if (order) {
      orderId = order.id;
      const snap = (order.pricing_snapshot ?? {}) as Record<string, unknown>;
      const cat = (snap.catalogue ?? {}) as Record<string, unknown>;
      const base = Number(snap.base_price_cents ?? 0);
      const ext = Number(snap.extended_access_price_cents ?? 0);
      const fee = Number(snap.signup_fee_cents ?? 0);
      let lineNo = 1;
      if (base > 0) {
        lines.push({
          lineNo: lineNo++,
          catalogueSlug: order.catalogue_slug,
          description: String(cat.display_name ?? order.catalogue_slug),
          quantity: 1,
          grossCents: base,
          vatRateBp: Number(snap.vat_rate_bp ?? payment.vat_rate_bp ?? 900),
          revenueCategory: (cat.revenue_category as string) ?? null,
        });
      }
      if (ext > 0) {
        lines.push({
          lineNo: lineNo++,
          catalogueSlug: "extended_access",
          // COPY: confirm met Marlon
          description: "Verlengde toegang",
          quantity: 1,
          grossCents: ext,
          vatRateBp: Number(snap.extended_access_vat_rate_bp ?? 900),
          revenueCategory: "addon",
        });
      }
      if (fee > 0) {
        lines.push({
          lineNo: lineNo++,
          catalogueSlug: "signup_fee",
          // COPY: confirm met Marlon
          description: "Inschrijfkosten",
          quantity: 1,
          grossCents: fee,
          vatRateBp: Number(snap.signup_fee_vat_rate_bp ?? 900),
          revenueCategory: "inschrijfgeld",
        });
      }
    }
  }
  if (lines.length === 0) {
    lines.push({
      lineNo: 1,
      catalogueSlug: null,
      // COPY: confirm met Marlon
      description: payment.description ?? "Betaling",
      quantity: 1,
      grossCents: payment.amount_cents,
      vatRateBp: payment.vat_rate_bp ?? 900,
      revenueCategory: null,
    });
  }

  const { data: invoice, error: invErr } = await admin
    .from("invoices")
    .insert({
      // series_id is verplicht; finalize_invoice herleidt de echte reeks
      // uit p_issued_at en overschrijft dit veld (bewezen in PR 7 test A3).
      series_id: await ensureSeriesId(payment.is_test),
      fiscal_year: new Date().getFullYear(),
      is_test: payment.is_test,
      profile_id: payment.profile_id,
      payment_id: payment.id,
      order_id: orderId,
      created_by_profile_id: auth.userId,
    })
    .select("id")
    .single();
  if (invErr || !invoice) {
    console.error("[createInvoiceFromPayment] insert failed", invErr);
    // COPY: confirm met Marlon
    return { ok: false, error: "Concept aanmaken mislukte." };
  }

  const { error: lineErr } = await admin
    .from("invoice_lines")
    .insert(lines.map((l) => ({ invoice_id: invoice.id, ...computeLine(l) })));
  if (lineErr) {
    console.error("[createInvoiceFromPayment] lines failed", lineErr);
    await admin.from("invoices").delete().eq("id", invoice.id);
    // COPY: confirm met Marlon
    return { ok: false, error: "Regels aanmaken mislukte." };
  }

  await audit(auth.userId, "invoice_draft_created", invoice.id, {
    from_payment: payment.id,
    line_count: lines.length,
  });
  revalidatePath("/app/admin/facturen");
  return { ok: true, invoiceId: invoice.id };
}

/** 9.2: handmatig concept zonder betaling. */
export async function createManualInvoice(
  profileId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_test")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Lid niet gevonden." };
  }

  const { data: invoice, error } = await admin
    .from("invoices")
    .insert({
      series_id: await ensureSeriesId(profile.is_test),
      fiscal_year: new Date().getFullYear(),
      is_test: profile.is_test,
      profile_id: profile.id,
      created_by_profile_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !invoice) {
    console.error("[createManualInvoice] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, error: "Concept aanmaken mislukte." };
  }

  await audit(auth.userId, "invoice_draft_created", invoice.id, {
    manual: true,
  });
  revalidatePath("/app/admin/facturen");
  return { ok: true, invoiceId: invoice.id };
}

/** Concept-reeksrij zodat series_id (NOT NULL) kan verwijzen; de echte
 * reekskeuze gebeurt in finalize_invoice op p_issued_at. */
async function ensureSeriesId(isTest: boolean): Promise<string> {
  const admin = createAdminClient();
  const code = isTest ? "TEST" : "LIVE";
  const prefix = isTest ? "TEST-" : "";
  const year = new Date().getFullYear();
  const { data: existing } = await admin
    .from("invoice_series")
    .select("id")
    .eq("code", code)
    .eq("fiscal_year", year)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("invoice_series")
    .insert({ code, fiscal_year: year, is_test: isTest, prefix })
    .select("id")
    .single();
  if (error || !created) throw new Error("invoice_series aanmaken mislukte");
  return created.id;
}

/** 9.3: regels van een concept integraal vervangen (bruto in, berekend uit). */
export async function saveInvoiceLines(
  invoiceId: string,
  inputs: InvoiceLineInput[],
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!invoice) return { ok: false, error: "Factuur niet gevonden." };
  if (invoice.status !== "draft") {
    // COPY: confirm met Marlon
    return { ok: false, error: "Alleen een concept is te bewerken." };
  }

  await admin.from("invoice_lines").delete().eq("invoice_id", invoiceId);
  if (inputs.length > 0) {
    const { error } = await admin
      .from("invoice_lines")
      .insert(inputs.map((l) => ({ invoice_id: invoiceId, ...computeLine(l) })));
    if (error) {
      console.error("[saveInvoiceLines] insert failed", error);
      // COPY: confirm met Marlon
      return { ok: false, error: "Regels opslaan mislukte." };
    }
  }
  revalidatePath(`/app/admin/facturen/${invoiceId}`);
  return { ok: true, invoiceId };
}

/** 4.1: een concept is vrij te verwijderen zolang het geen nummer heeft
 * (geen reservering, dus geen gat in de reeks). `invoice_lines` volgt via
 * `on delete cascade` (2.6). Bedoeld o.a. om een dubbel concept van een
 * dubbelklik op "Factuur maken" weer kwijt te raken. */
export async function deleteInvoiceDraft(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!invoice) return { ok: false, error: "Factuur niet gevonden." };
  if (invoice.status !== "draft") {
    // COPY: confirm met Marlon
    return { ok: false, error: "Alleen een concept is te verwijderen." };
  }

  const { error } = await admin.from("invoices").delete().eq("id", invoiceId);
  if (error) {
    console.error("[deleteInvoiceDraft] delete failed", error);
    // COPY: confirm met Marlon
    return { ok: false, error: "Verwijderen mislukte." };
  }

  await audit(auth.userId, "invoice_draft_deleted", invoiceId, {});
  revalidatePath("/app/admin/facturen");
  return { ok: true };
}

/** 9.4 stap 1: finaliseren via de RPC (cookie-client: DB-gate actief). */
export async function finalizeInvoice(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data, error } = await supabase.rpc("finalize_invoice", {
    p_invoice_id: invoiceId,
  });
  if (error) {
    console.error("[finalizeInvoice] rpc failed", error);
    // COPY: confirm met Marlon
    return { ok: false, error: "Finaliseren mislukte. Controleer de regels en probeer opnieuw." };
  }
  const result = data as {
    ok: boolean;
    reason?: string;
    invoice_number?: string;
    already_finalised?: boolean;
  };
  if (!result.ok) {
    // COPY: confirm met Marlon
    const REASON_COPY: Record<string, string> = {
      no_lines: "Deze factuur heeft nog geen regels.",
      totals_mismatch: "De totalen van de regels kloppen niet.",
      incomplete_bill_to: "Naam of e-mailadres van de afnemer ontbreekt.",
      issued_at_before_last: "De factuurdatum ligt vóór de laatste factuur in deze reeks.",
      invoice_not_found: "Factuur niet gevonden.",
    };
    return {
      ok: false,
      error: REASON_COPY[result.reason ?? ""] ?? `Geweigerd (${result.reason}).`,
    };
  }

  if (!result.already_finalised) {
    // De RPC retourneert alleen invoice_number/number/fiscal_year (het
    // nummer trekken is haar taak); total_gross_cents en is_test voor de
    // 9.6-auditregel komen uit een aparte lezing van de bevroren rij.
    const { data: finalised } = await admin
      .from("invoices")
      .select("total_gross_cents, is_test, credit_of_invoice_id")
      .eq("id", invoiceId)
      .maybeSingle();

    if (finalised?.credit_of_invoice_id) {
      const { data: orig } = await admin
        .from("invoices")
        .select("invoice_number")
        .eq("id", finalised.credit_of_invoice_id)
        .maybeSingle();
      await audit(auth.userId, "invoice_credited", invoiceId, {
        invoice_number: result.invoice_number,
        credit_of: orig?.invoice_number ?? null,
        total_gross_cents: finalised.total_gross_cents,
      });
    } else {
      await audit(auth.userId, "invoice_finalised", invoiceId, {
        invoice_number: result.invoice_number,
        total_gross_cents: finalised?.total_gross_cents ?? null,
        is_test: finalised?.is_test ?? null,
      });
    }
  }
  revalidatePath(`/app/admin/facturen/${invoiceId}`);
  revalidatePath("/app/admin/facturen");
  return { ok: true, invoiceId, invoiceNumber: result.invoice_number };
}

/** 9.4 stap 2: PDF renderen, uploaden naar tmc-invoices, pdf_path
 * stempelen. Nooit opnieuw: de write-once-trigger weigert de tweede keer
 * en die weigering geven we door. */
export async function generateInvoicePdf(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select(
      `id, invoice_number, status, issued_at, is_test, profile_id, pdf_path,
       credit_of_invoice_id, bill_to_name, bill_to_company, bill_to_vat_number,
       bill_to_street, bill_to_postal_code, bill_to_city, bill_to_country,
       subtotal_net_cents, vat_total_cents, total_gross_cents`,
    )
    .eq("id", invoiceId)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!invoice) return { ok: false, error: "Factuur niet gevonden." };
  if (invoice.status !== "finalised" || !invoice.invoice_number) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Finaliseer de factuur eerst; de PDF hoort bij een definitief nummer." };
  }
  if (invoice.pdf_path) {
    // COPY: confirm met Marlon
    return { ok: false, error: "De PDF bestaat al en wordt nooit opnieuw gemaakt (write-once)." };
  }

  const { data: lines } = await admin
    .from("invoice_lines")
    .select("description, quantity, net_cents, vat_cents, vat_rate_bp, gross_cents")
    .eq("invoice_id", invoiceId)
    .order("line_no");

  let creditOfNumber: string | null = null;
  if (invoice.credit_of_invoice_id) {
    const { data: orig } = await admin
      .from("invoices")
      .select("invoice_number")
      .eq("id", invoice.credit_of_invoice_id)
      .maybeSingle();
    creditOfNumber = orig?.invoice_number ?? null;
  }

  // BTW per tarief: som over de bevroren regels (3.4), nooit herrekend
  // over het bruto totaal.
  const vatByRate = new Map<number, number>();
  for (const l of lines ?? []) {
    vatByRate.set(l.vat_rate_bp, (vatByRate.get(l.vat_rate_bp) ?? 0) + l.vat_cents);
  }

  // KvK/BTW via Sanity met de constants als fallback (5.2): zodra de echte
  // nummers in Sanity staan, klopt elke nieuwe PDF zonder codewijziging.
  const settings = await getSiteSettings();

  const pdfData: CustomerInvoiceData = {
    invoiceNumber: invoice.invoice_number,
    issuedAt: invoice.issued_at as string,
    isCreditNote: Boolean(invoice.credit_of_invoice_id),
    creditOfInvoiceNumber: creditOfNumber,
    billToName: invoice.bill_to_name ?? "",
    billToCompany: invoice.bill_to_company,
    billToVatNumber: invoice.bill_to_vat_number,
    billToStreet: invoice.bill_to_street,
    billToPostalCode: invoice.bill_to_postal_code,
    billToCity: invoice.bill_to_city,
    billToCountry: invoice.bill_to_country,
    lines: (lines ?? []).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      netCents: l.net_cents,
      vatRateBp: l.vat_rate_bp,
      grossCents: l.gross_cents,
    })),
    subtotalNetCents: invoice.subtotal_net_cents ?? 0,
    vatByRate: Array.from(vatByRate, ([rateBp, vatCents]) => ({ rateBp, vatCents }))
      .sort((a, b) => a.rateBp - b.rateBp),
    totalGrossCents: invoice.total_gross_cents ?? 0,
    tmcName: settings.studioName,
    tmcAddress: `${settings.address.street}, ${settings.address.postalCode} ${settings.address.city}`,
    tmcKvk: settings.kvkNumber,
    tmcBtw: settings.btwNumber,
    tmcEmail: settings.email,
  };

  const buffer = await renderToBuffer(CustomerInvoicePdf(pdfData));

  const pdfPath = `${invoice.profile_id}/${invoice.invoice_number}.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("tmc-invoices")
    .upload(pdfPath, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadErr) {
    console.error("[generateInvoicePdf] upload failed", uploadErr);
    // COPY: confirm met Marlon
    return { ok: false, error: "Uploaden van de PDF mislukte. Probeer het opnieuw." };
  }

  const { error: stampErr } = await admin
    .from("invoices")
    .update({ pdf_path: pdfPath, pdf_generated_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (stampErr) {
    // De write-once-trigger of een race: PDF staat in de bucket maar het
    // pad is niet gestempeld. Object opruimen zodat een herpoging schoon
    // start (de upload gebruikt upsert:false en zou anders blijven botsen).
    console.error("[generateInvoicePdf] stamp failed", stampErr);
    await admin.storage.from("tmc-invoices").remove([pdfPath]);
    // COPY: confirm met Marlon
    return { ok: false, error: "De PDF kon niet geregistreerd worden. Probeer het opnieuw." };
  }

  await audit(auth.userId, "invoice_pdf_generated", invoiceId, {
    invoice_number: invoice.invoice_number,
    pdf_path: pdfPath,
  });
  revalidatePath(`/app/admin/facturen/${invoiceId}`);
  return { ok: true, invoiceId, invoiceNumber: invoice.invoice_number };
}

/** 9.4 stap 3: mail met een LINK naar de portal, geen bijlage (5.5). */
export async function sendInvoiceEmail(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: invoice } = await admin
    .from("invoices")
    .select(
      "id, invoice_number, status, pdf_path, total_gross_cents, credit_of_invoice_id, bill_to_email, bill_to_name, profile_id",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!invoice) return { ok: false, error: "Factuur niet gevonden." };
  if (invoice.status !== "finalised" || !invoice.pdf_path) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Genereer eerst de PDF; anders verwijst de mail naar niets." };
  }
  if (!invoice.bill_to_email) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Geen e-mailadres op de factuur." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("first_name")
    .eq("id", invoice.profile_id)
    .maybeSingle();

  await sendEmail({
    to: invoice.bill_to_email,
    toName: invoice.bill_to_name ?? undefined,
    // COPY: confirm met Marlon
    subject: invoice.credit_of_invoice_id
      ? `Creditnota ${invoice.invoice_number}`
      : `Factuur ${invoice.invoice_number}`,
    react: InvoiceReady({
      firstName: profile?.first_name ?? "",
      invoiceNumber: invoice.invoice_number ?? "",
      amountEuro: formatEuro(Math.round(Math.abs(invoice.total_gross_cents ?? 0) / 100)),
      isCreditNote: Boolean(invoice.credit_of_invoice_id),
      portalUrl: `${siteUrl()}/app/facturen`,
    }),
  });

  await audit(auth.userId, "invoice_sent", invoiceId, {
    invoice_number: invoice.invoice_number,
    to: invoice.bill_to_email,
  });
  return { ok: true, invoiceId };
}

/** 9.5: concept-creditnota met alle regels gespiegeld. */
export async function createCreditNote(
  invoiceId: string,
): Promise<InvoiceActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.message };
  const admin = createAdminClient();

  const { data: orig } = await admin
    .from("invoices")
    .select("id, status, is_test, profile_id, invoice_number, series_id")
    .eq("id", invoiceId)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!orig) return { ok: false, error: "Factuur niet gevonden." };
  if (orig.status !== "finalised") {
    // COPY: confirm met Marlon
    return { ok: false, error: "Alleen een gefinaliseerde factuur is te crediteren." };
  }

  const { data: lines } = await admin
    .from("invoice_lines")
    .select("line_no, catalogue_slug, description, quantity, unit_net_cents, vat_rate_bp, net_cents, vat_cents, gross_cents, revenue_category")
    .eq("invoice_id", invoiceId)
    .order("line_no");

  const { data: credit, error } = await admin
    .from("invoices")
    .insert({
      series_id: orig.series_id,
      fiscal_year: new Date().getFullYear(),
      is_test: orig.is_test,
      profile_id: orig.profile_id,
      credit_of_invoice_id: orig.id,
      created_by_profile_id: auth.userId,
    })
    .select("id")
    .single();
  if (error || !credit) {
    console.error("[createCreditNote] insert failed", error);
    // COPY: confirm met Marlon
    return { ok: false, error: "Creditnota aanmaken mislukte." };
  }

  if ((lines ?? []).length > 0) {
    const { error: lineErr } = await admin.from("invoice_lines").insert(
      (lines ?? []).map((l) => ({
        invoice_id: credit.id,
        line_no: l.line_no,
        catalogue_slug: l.catalogue_slug,
        // COPY: confirm met Marlon
        description: `Creditering: ${l.description}`,
        quantity: l.quantity,
        unit_net_cents: -l.unit_net_cents,
        vat_rate_bp: l.vat_rate_bp,
        net_cents: -l.net_cents,
        vat_cents: -l.vat_cents,
        gross_cents: -l.gross_cents,
        revenue_category: l.revenue_category,
      })),
    );
    if (lineErr) {
      console.error("[createCreditNote] lines failed", lineErr);
      await admin.from("invoices").delete().eq("id", credit.id);
      // COPY: confirm met Marlon
      return { ok: false, error: "Regels spiegelen mislukte." };
    }
  }

  // De echte invoice_credited-auditregel (9.6: invoice_number,
  // total_gross_cents) hoort bij finaliseren, niet hier: het concept heeft
  // nog geen van beide. Dit is dezelfde draft-creation-actie als bij de
  // andere twee aanmaakpaden.
  await audit(auth.userId, "invoice_draft_created", credit.id, {
    credit_of: orig.invoice_number,
  });
  revalidatePath("/app/admin/facturen");
  return { ok: true, invoiceId: credit.id };
}
