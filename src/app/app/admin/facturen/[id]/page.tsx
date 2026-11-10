import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
import { mergeBillTo } from "@/lib/admin/invoice-bill-to";
import {
  INVOICE_STATUS_LABEL,
  canPayOnline,
  invoicePaymentStatus,
  todayIso,
} from "@/lib/invoice-payments/status";
import { creditedCentsByInvoice } from "@/lib/invoice-payments/server";
import { FactuurEditor } from "../_components/FactuurEditor";

export const metadata = {
  title: "Factuur | Admin | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminFactuurDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const admin = createAdminClient();

  const [{ data: invoice }, { data: lines }, catalogue] = await Promise.all([
    admin
      .from("invoices")
      .select(
        `id, invoice_number, status, is_test, issued_at, credit_of_invoice_id,
         pdf_path, pdf_generated_at, total_gross_cents, subtotal_net_cents,
         vat_total_cents, bill_to_name, bill_to_company, bill_to_vat_number,
         bill_to_street, bill_to_postal_code, bill_to_city, bill_to_country,
         bill_to_email, payment_id,
         profile:profiles!profile_id(first_name, last_name, email, company_name, vat_number, street_address, postal_code, city, country)`,
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("invoice_lines")
      .select(
        "line_no, catalogue_slug, description, quantity, vat_rate_bp, net_cents, vat_cents, gross_cents, revenue_category",
      )
      .eq("invoice_id", id)
      .order("line_no"),
    getCatalogue(),
  ]);

  if (!invoice) notFound();

  let creditOfNumber: string | null = null;
  if (invoice.credit_of_invoice_id) {
    const { data: orig } = await admin
      .from("invoices")
      .select("invoice_number")
      .eq("id", invoice.credit_of_invoice_id)
      .maybeSingle();
    creditOfNumber = orig?.invoice_number ?? null;
  }

  const profile = Array.isArray(invoice.profile)
    ? invoice.profile[0]
    : invoice.profile;

  // Afnemer: concept wint, profiel vult de gaten (zelfde regel als de RPC).
  // Bij een gefinaliseerde factuur zijn alle velden al bevroren in de rij.
  const merged = mergeBillTo(invoice, profile ?? null);

  // Betaalstatus (9.7): dezelfde labels en regels als het ledenportaal.
  const creditedCents = (await creditedCentsByInvoice([id])).get(id) ?? 0;
  const isCreditNote = Boolean(invoice.credit_of_invoice_id);
  const payStatus =
    invoice.status === "finalised" && invoice.issued_at
      ? invoicePaymentStatus({
          isCreditNote,
          totalGrossCents: invoice.total_gross_cents ?? 0,
          creditedCents,
          paid: invoice.payment_id !== null,
          issuedAt: invoice.issued_at,
          today: todayIso(),
        })
      : null;
  let paidAt: string | null = null;
  if (invoice.payment_id) {
    const { data: pay } = await admin
      .from("payments")
      .select("paid_at, method")
      .eq("id", invoice.payment_id)
      .maybeSingle();
    paidAt = pay?.paid_at ? pay.paid_at.slice(0, 10) : null;
  }
  const canMarkPaid = canPayOnline({
    status: invoice.status,
    isCreditNote,
    totalGrossCents: invoice.total_gross_cents,
    paymentId: invoice.payment_id,
    creditedCents,
  });

  // Catalogusopties voor de regels-editor: slug, naam en het
  // default-tarief uit de rij (9.3).
  const catalogueOptions = Array.from(catalogue.values()).map((c) => ({
    slug: c.slug,
    displayName: c.display_name,
    grossCents: c.price_cents,
    vatRateBp: c.vat_rate_bp,
  }));

  return (
    <div className="p-8 md:p-10 max-w-4xl">
      <FactuurEditor
        invoice={{
          id: invoice.id,
          number: invoice.invoice_number,
          status: invoice.status,
          isTest: invoice.is_test,
          issuedAt: invoice.issued_at,
          isCreditNote: Boolean(invoice.credit_of_invoice_id),
          creditOfNumber,
          pdfPath: invoice.pdf_path,
          totalGrossCents: invoice.total_gross_cents,
          billToName:
            invoice.bill_to_name ??
            (profile ? `${profile.first_name} ${profile.last_name}`.trim() : ""),
          billToEmail: invoice.bill_to_email ?? profile?.email ?? "",
          payStatusLabel: payStatus ? INVOICE_STATUS_LABEL[payStatus] : null,
          paidOn: paidAt,
          canMarkPaid,
          todayIso: todayIso(),
          minPaidOn: invoice.issued_at ?? null,
        }}
        initialBillTo={{
          name: merged.name ?? "",
          company: merged.company ?? "",
          vatNumber: merged.vatNumber ?? "",
          street: merged.street ?? "",
          postalCode: merged.postalCode ?? "",
          city: merged.city ?? "",
          country: merged.country ?? "",
          email: merged.email ?? "",
        }}
        initialLines={(lines ?? []).map((l) => ({
          lineNo: l.line_no,
          catalogueSlug: l.catalogue_slug,
          description: l.description,
          quantity: Number(l.quantity),
          grossCents: l.gross_cents,
          vatRateBp: l.vat_rate_bp,
          revenueCategory: l.revenue_category,
        }))}
        catalogueOptions={catalogueOptions}
      />
    </div>
  );
}
