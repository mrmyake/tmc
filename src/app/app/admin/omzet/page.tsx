import { createAdminClient } from "@/lib/supabase/admin";
import { formatEuro } from "@/lib/format";
import {
  buildRevenueReport,
  fetchInvoicedPaymentIds,
  fetchRevenueRows,
  type RevenueGroup,
} from "@/lib/admin/revenue-report-query";
import { categoryLabel } from "@/lib/admin/revenue-categories";
import { OmzetCsvExport } from "./_components/OmzetCsvExport";

export const metadata = {
  title: "Omzet | Admin | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STALE_HOURS = 48;

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function computeStaleness(refreshedAtIso: string | null): {
  refreshedAt: Date | null;
  isStale: boolean;
} {
  if (!refreshedAtIso) return { refreshedAt: null, isStale: false };
  const refreshedAt = new Date(refreshedAtIso);
  const staleHours = (Date.now() - refreshedAt.getTime()) / 3_600_000;
  return { refreshedAt, isStale: staleHours > STALE_HOURS };
}

function monthsAgoKey(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 7);
}

function parseMonth(value: string | undefined, fallback: string): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return fallback;
}

function nlMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminOmzetPage(props: {
  searchParams: Promise<{ from?: string; to?: string; test?: string }>;
}) {
  const { from, to, test } = await props.searchParams;
  const toMonth = parseMonth(to, currentMonthKey());
  const fromMonth = parseMonth(from, monthsAgoKey(11));
  const includeTest = test === "1";

  const admin = createAdminClient();
  const [{ data: kpis }, rows, invoicedPaymentIds] = await Promise.all([
    admin.from("vw_admin_kpis").select("refreshed_at").limit(1).maybeSingle(),
    fetchRevenueRows(),
    fetchInvoicedPaymentIds(),
  ]);

  const { refreshedAt, isStale } = computeStaleness(kpis?.refreshed_at ?? null);

  const groups = buildRevenueReport(rows, invoicedPaymentIds, {
    includeTest,
    fromMonth,
    toMonth,
  });

  const totals = groups.reduce(
    (acc, g) => ({
      grossCents: acc.grossCents + g.grossCents,
      vatCents: g.vatCents === null ? acc.vatCents : acc.vatCents + g.vatCents,
      netCents: g.netCents === null ? acc.netCents : acc.netCents + g.netCents,
      correctedCents: acc.correctedCents + g.correctedCents,
    }),
    { grossCents: 0, vatCents: 0, netCents: 0, correctedCents: 0 },
  );

  return (
    <div className="p-8 md:p-10 max-w-5xl">
      <header className="mb-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Facturatie
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl text-text tracking-[-0.02em]">
          Omzet.
        </h1>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-sm mt-2 max-w-prose">
          Gerealiseerde omzet per maand, uit betaalde betaalregels. Een
          restitutie drukt de maand waarin ze plaatsvond, niet de maand van
          de oorspronkelijke betaling.
        </p>
      </header>

      {refreshedAt && (
        <div
          className={`mb-8 px-4 py-3 text-sm border ${
            isStale
              ? "border-[color:var(--danger)]/60 text-[color:var(--danger)]"
              : "border-[color:var(--ink-500)]/60 text-text-muted"
          }`}
        >
          {/* COPY: confirm met Marlon */}
          {isStale ? (
            <>
              Let op: de KPI-view is voor het laatst ververst op{" "}
              {refreshedAt.toLocaleString("nl-NL")}, meer dan {STALE_HOURS} uur
              geleden. De dagelijkse cron lijkt stilgevallen.
            </>
          ) : (
            <>KPI-view ververst op {refreshedAt.toLocaleString("nl-NL")}.</>
          )}
        </div>
      )}

      <form
        method="get"
        className="mb-8 flex flex-wrap items-end gap-4 bg-bg-elevated p-4"
      >
        <label className="flex flex-col gap-1">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Van</span>
          <input
            type="month"
            name="from"
            defaultValue={fromMonth}
            className="bg-bg border border-[color:var(--ink-500)] px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="flex flex-col gap-1">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Tot en met</span>
          <input
            type="month"
            name="to"
            defaultValue={toMonth}
            className="bg-bg border border-[color:var(--ink-500)] px-3 py-2 text-sm text-text"
          />
        </label>
        <label className="flex items-center gap-2 pb-2.5">
          <input
            type="checkbox"
            name="test"
            value="1"
            defaultChecked={includeTest}
            className="accent-accent"
          />
          {/* COPY: confirm met Marlon */}
          <span className="text-sm text-text">Inclusief testdata</span>
        </label>
        <button
          type="submit"
          className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em]"
        >
          {/* COPY: confirm met Marlon */}
          Toepassen
        </button>
        <OmzetCsvExport groups={groups} fromMonth={fromMonth} toMonth={toMonth} />
      </form>

      {groups.length === 0 ? (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-sm py-10">
          Geen omzet in deze periode{includeTest ? "" : " (exclusief testdata)"}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-text-muted text-xs uppercase tracking-[0.1em] border-b border-[color:var(--ink-500)]/60">
                {/* COPY: confirm met Marlon */}
                <th className="py-2 pr-4">Maand</th>
                <th className="py-2 pr-4">Categorie</th>
                <th className="py-2 pr-4 text-right">Netto</th>
                <th className="py-2 pr-4 text-right">BTW</th>
                <th className="py-2 pr-4 text-right">Bruto</th>
                <th className="py-2 pr-4 text-right">Gecorrigeerd</th>
                <th className="py-2 text-right">Gefactureerd</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <RevenueRowLine key={`${g.month} ${g.category}`} group={g} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[color:var(--ink-500)] text-text font-medium">
                {/* COPY: confirm met Marlon */}
                <td className="py-3 pr-4" colSpan={2}>
                  Totaal
                </td>
                <td className="py-3 pr-4 text-right">
                  {formatEuro(Math.round(totals.netCents / 100))}
                </td>
                <td className="py-3 pr-4 text-right">
                  {formatEuro(Math.round(totals.vatCents / 100))}
                </td>
                <td className="py-3 pr-4 text-right">
                  {formatEuro(Math.round(totals.grossCents / 100))}
                </td>
                <td className="py-3 pr-4 text-right text-text-muted">
                  {totals.correctedCents > 0
                    ? formatEuro(Math.round(totals.correctedCents / 100))
                    : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-8 text-text-muted text-xs max-w-prose">
        {/* COPY: confirm met Marlon */}
        &quot;Gecorrigeerd&quot; is het bedrag aan restituties en
        creditnota&apos;s dat in die maand is verwerkt (7.4) — al verrekend in
        netto/BTW/bruto hiernaast, hier ter transparantie apart getoond.
        &quot;Gefactureerd&quot; toont welk deel van de bruto-omzet een
        gefinaliseerde factuur heeft; particuliere betalingen krijgen
        standaard geen factuur (1.2), dus een laag percentage is normaal.
      </p>
    </div>
  );
}

function RevenueRowLine({ group }: { group: RevenueGroup }) {
  const invoicedPct =
    group.positiveGrossCents > 0
      ? Math.round((group.invoicedGrossCents / group.positiveGrossCents) * 100)
      : null;
  return (
    <tr className="border-b border-[color:var(--ink-500)]/40">
      <td className="py-2 pr-4 text-text-muted">{nlMonth(group.month.slice(0, 7))}</td>
      <td className="py-2 pr-4 text-text">{categoryLabel(group.category)}</td>
      <td className="py-2 pr-4 text-right text-text">
        {group.netCents === null ? "—" : formatEuro(Math.round(group.netCents / 100))}
      </td>
      <td className="py-2 pr-4 text-right text-text">
        {group.vatCents === null ? "—" : formatEuro(Math.round(group.vatCents / 100))}
      </td>
      <td className="py-2 pr-4 text-right text-text">
        {formatEuro(Math.round(group.grossCents / 100))}
      </td>
      <td className="py-2 pr-4 text-right text-text-muted">
        {group.correctedCents > 0
          ? formatEuro(Math.round(group.correctedCents / 100))
          : "—"}
      </td>
      <td className="py-2 text-right text-text-muted">
        {invoicedPct === null ? "—" : `${invoicedPct}%`}
      </td>
    </tr>
  );
}
