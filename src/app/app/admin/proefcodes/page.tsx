import {
  getTrialCodeKpis,
  listTrialCodeBatches,
  listTrialCodes,
  type TrialCodeStatusFilter,
} from "@/lib/admin/trial-codes-query";
import { KpiCard } from "../_components/KpiCard";
import { GenerateCodesDialog } from "./_components/GenerateCodesDialog";
import { ProefcodesToolbar } from "./_components/ProefcodesToolbar";
import { ProefcodesTable } from "./_components/ProefcodesTable";

export const metadata = {
  title: "Admin · Proefcodes | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VALID_STATUSES: TrialCodeStatusFilter[] = [
  "active",
  "redeemed",
  "revoked",
  "all",
];

function parseSearchParams(sp: Record<string, string | string[] | undefined>) {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const statusRaw = get("status") ?? "active";
  const status = (VALID_STATUSES as string[]).includes(statusRaw)
    ? (statusRaw as TrialCodeStatusFilter)
    : "active";
  const batch = get("batch") ?? "";
  const q = get("q")?.trim() ?? "";
  return { status, batch, q };
}

export default async function AdminProefcodesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const parsed = parseSearchParams(searchParams);

  const [kpis, batches, rows] = await Promise.all([
    getTrialCodeKpis(),
    listTrialCodeBatches(),
    listTrialCodes({
      status: parsed.status,
      batchId: parsed.batch || undefined,
      q: parsed.q,
    }),
  ]);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-12 flex flex-wrap items-start justify-between gap-6">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
            {/* COPY: confirm met Marlon */}
            Admin cockpit
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
            {/* COPY: confirm met Marlon */}
            Proefcodes.
          </h1>
        </div>
        <GenerateCodesDialog />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-10">
        <KpiCard
          // COPY: confirm met Marlon
          label="Uitgegeven totaal"
          value={kpis.issuedTotal.toString()}
        />
        <KpiCard
          // COPY: confirm met Marlon
          label="Nu actief"
          value={kpis.activeNow.toString()}
        />
        <KpiCard
          // COPY: confirm met Marlon
          label="Verzilverd"
          value={kpis.redeemed.toString()}
        />
      </div>

      <ProefcodesToolbar
        status={parsed.status}
        batch={parsed.batch}
        q={parsed.q}
        batches={batches}
        rows={rows}
      />

      <ProefcodesTable rows={rows} status={parsed.status} />
    </div>
  );
}
