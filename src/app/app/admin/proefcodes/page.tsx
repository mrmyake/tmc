import {
  getTrialCodeKpis,
  listTrialCodes,
  type TrialCodeStatusFilter,
} from "@/lib/admin/trial-codes-query";
import { KpiCard } from "../_components/KpiCard";
import { CreateCodeDialog } from "./_components/CreateCodeDialog";
import { ProefcodesToolbar } from "./_components/ProefcodesToolbar";
import { ProefcodesTable } from "./_components/ProefcodesTable";

export const metadata = {
  title: "Admin · Proefcodes | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const VALID_STATUSES: TrialCodeStatusFilter[] = ["active", "exhausted", "revoked", "all"];

function parseSearchParams(sp: Record<string, string | string[] | undefined>) {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const statusRaw = get("status") ?? "active";
  const status = (VALID_STATUSES as string[]).includes(statusRaw)
    ? (statusRaw as TrialCodeStatusFilter)
    : "active";
  const q = get("q")?.trim() ?? "";
  return { status, q };
}

export default async function AdminProefcodesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const parsed = parseSearchParams(searchParams);

  const [kpis, rows] = await Promise.all([
    getTrialCodeKpis(),
    listTrialCodes({ status: parsed.status, q: parsed.q }),
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
          <p className="text-text-muted text-sm mt-4 max-w-xl">
            {/* COPY: confirm met Marlon */}
            Een code maakt een proefles gratis en blijft geldig tot je hem
            intrekt. Bezoekers vullen de code in bij het boeken op
            /proefles/boeken.
          </p>
        </div>
        <CreateCodeDialog />
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        {/* COPY: confirm met Marlon */}
        <KpiCard label="Actief" value={kpis.activeNow.toString()} />
        <KpiCard label="Op" value={kpis.exhausted.toString()} />
        <KpiCard label="Ingetrokken" value={kpis.revoked.toString()} />
        <KpiCard
          label="Open inwisselingen"
          value={kpis.redemptionsOpen.toString()}
          hint="Gratis boekingen die nog staan"
        />
      </div>

      <ProefcodesToolbar status={parsed.status} q={parsed.q} />

      <ProefcodesTable rows={rows} />
    </div>
  );
}
