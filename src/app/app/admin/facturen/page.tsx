import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEuroCentsSigned } from "@/lib/format";
import { NieuweFactuurKnop } from "./_components/NieuweFactuurKnop";
import {
  INVOICE_STATUS_LABEL,
  invoicePaymentStatus,
  todayIso,
} from "@/lib/invoice-payments/status";
import { creditedCentsByInvoice } from "@/lib/invoice-payments/server";

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
export default async function AdminFacturenPage(props: {
  searchParams: Promise<{ test?: string | string[] }>;
}) {
  const sp = await props.searchParams;
  const testParam = Array.isArray(sp.test) ? sp.test[0] : sp.test;
  const showTest = testParam === "1";
  const admin = createAdminClient();

  // Het is_test-filter zit in de query zelf (niet achteraf in de client), zodat
  // de limiet van 100 op de gefilterde lijst werkt. De detailpagina en directe
  // links naar een testfactuur blijven ongemoeid.
  let listQuery = admin
    .from("invoices")
    .select(
      `id, invoice_number, status, is_test, issued_at, total_gross_cents,
       credit_of_invoice_id, pdf_path, payment_id, created_at,
       profile:profiles!profile_id(first_name, last_name)`,
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (!showTest) listQuery = listQuery.eq("is_test", false);

  const [{ data: invoices }, { data: creditStates }, { count: testCount }] =
    await Promise.all([
      listQuery,
      admin.from("v_invoice_credit_state").select("invoice_id, credit_state"),
      admin
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("is_test", true),
    ]);
  const hiddenTestCount = testCount ?? 0;

  const creditedById = await creditedCentsByInvoice(
    (invoices ?? []).map((i) => i.id),
  );
  const today = todayIso();

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
      // Dezelfde labels als in het ledenportaal (Open, Vervallen, Betaald,
      // Gecrediteerd); alleen voor een gefinaliseerde factuur, niet voor een
      // concept of creditnota.
      payStatus:
        i.status === "finalised" && i.issued_at
          ? invoicePaymentStatus({
              isCreditNote: Boolean(i.credit_of_invoice_id),
              totalGrossCents: i.total_gross_cents ?? 0,
              creditedCents: creditedById.get(i.id) ?? 0,
              paid: i.payment_id !== null,
              issuedAt: i.issued_at,
              today,
            })
          : null,
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

      {/* COPY: confirm met Marlon */}
      <div className="mb-6 flex items-center justify-between gap-4 text-sm">
        <Link
          href={showTest ? "/app/admin/facturen" : "/app/admin/facturen?test=1"}
          role="switch"
          aria-checked={showTest}
          className="inline-flex items-center gap-3 text-text-muted hover:text-text transition-colors"
        >
          <span
            aria-hidden
            className={`relative inline-block h-5 w-9 rounded-full border border-[color:var(--ink-500)] transition-colors ${
              showTest ? "bg-[color:var(--accent)]" : "bg-bg-elevated"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-text transition-all ${
                showTest ? "left-[18px]" : "left-0.5"
              }`}
            />
          </span>
          Toon testfacturen
        </Link>
      </div>

      {rows.length === 0 ? (
        // COPY: confirm met Marlon
        <div className="text-text-muted text-sm py-10">
          <p>
            Nog geen facturen. Maak er een vanaf een betaling (ledendetail,
            tab Betalingen) of handmatig via de knop hierboven.
          </p>
          {!showTest && hiddenTestCount > 0 && (
            <p className="mt-3">
              {hiddenTestCount === 1
                ? "1 testfactuur is verborgen."
                : `${hiddenTestCount} testfacturen zijn verborgen.`}{" "}
              <Link
                href="/app/admin/facturen?test=1"
                className="text-text underline underline-offset-4"
              >
                Toon testfacturen
              </Link>
            </p>
          )}
        </div>
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
                {r.payStatus && ` · ${INVOICE_STATUS_LABEL[r.payStatus]}`}
              </span>
              <span className="text-text text-sm text-right min-w-20">
                {r.totalCents != null
                  ? formatEuroCentsSigned(r.totalCents)
                  : "—"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
