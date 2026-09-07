import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCatalogue } from "@/lib/catalogue";
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
         vat_total_cents, bill_to_name, bill_to_email, payment_id,
         profile:profiles!profile_id(first_name, last_name, email)`,
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
