import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEuro } from "@/lib/format";
import { NieuweFactuurKnop } from "./_components/NieuweFactuurKnop";

export const metadata = {
  title: "Facturen | Admin | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Adminlijst van alle facturen (9.1-9.6). Leest via de service-role client:
 * concepten en testfacturen horen hier juist wel zichtbaar te zijn (6.8),
 * de RLS-selfread laat die bewust niet door. De credit_state-badge komt uit
 * tmc.v_invoice_credit_state.
 */
export default async function AdminFacturenPage() {
  const admin = createAdminClient();

  const [{ data: invoices }, { data: creditStates }] = await Promise.all([
    admin
      .from("invoices")
      .select(
        `id, invoice_number, status, is_test, issued_at, total_gross_cents,
         credit_of_invoice_id, pdf_path, created_at,
         profile:profiles!profile_id(first_name, last_name)`,
      )
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("v_invoice_credit_state").select("invoice_id, credit_state"),
  ]);

  const creditStateById = new Map(
    (creditStates ?? []).map((c) => [c.invoice_id, c.credit_state]),
  );

  const rows = (invoices ?? []).map((i) => {
    const profile = Array.isArray(i.profile) ? i.profile[0] : i.profile;
    return {
      id: i.id,
      number: i.invoice_number,
      status: i.status,
      isTest: i.is_test,
      isCredit: Boolean(i.credit_of_invoice_id),
      issuedAt: i.issued_at,
      totalCents: i.total_gross_cents,
      hasPdf: Boolean(i.pdf_path),
      name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "",
      creditState: creditStateById.get(i.id) ?? null,
    };
  });

  return (
    <div className="p-8 md:p-10 max-w-4xl">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Facturatie
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl text-text tracking-[-0.02em]">
            Facturen.
          </h1>
        </div>
        <NieuweFactuurKnop />
      </header>

      {rows.length === 0 ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm py-10">
          Nog geen facturen. Maak er een vanaf een betaling (ledendetail,
          tab Betalingen) of handmatig via de knop hierboven.
        </p>
      ) : (
        <div className="border-t border-[color:var(--ink-500)]/60">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/app/admin/facturen/${r.id}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-4 border-b border-[color:var(--ink-500)]/60 hover:bg-bg-elevated/50 transition-colors px-2 -mx-2"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-text text-sm">
                  {r.number ?? "(concept)"}
                  {r.isCredit && (
                    <span className="text-text-muted"> · creditnota</span>
                  )}
                  {r.isTest && (
                    <span className="text-[color:var(--danger)]"> · TEST</span>
                  )}
                </span>
                <span className="text-text-muted text-xs">
                  {r.name}
                  {r.issuedAt ? ` · ${r.issuedAt}` : ""}
                </span>
              </div>
              <span className="text-xs uppercase tracking-[0.14em] text-text-muted">
                {r.status === "draft" ? "Concept" : r.hasPdf ? "PDF klaar" : "Definitief"}
                {r.creditState === "partial" && " · deels gecrediteerd"}
                {r.creditState === "full" && " · gecrediteerd"}
              </span>
              <span className="text-text text-sm text-right min-w-20">
                {r.totalCents != null
                  ? formatEuro(Math.round(r.totalCents / 100))
                  : "—"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
