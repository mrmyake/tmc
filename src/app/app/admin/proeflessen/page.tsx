import {
  getTrialRequestKpis,
  listTrialRequests,
  parseTrialRequestStatusFilter,
} from "@/lib/admin/trial-requests-query";
import { TRIAL_REQUEST_STATUS_LABEL } from "@/lib/trial-requests/status";
import { KpiCard } from "../_components/KpiCard";
import { ProeflessenToolbar } from "./_components/ProeflessenToolbar";
import { ProeflessenTable } from "./_components/ProeflessenTable";

export const metadata = {
  title: "Admin · Proeflessen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function parseSearchParams(sp: Record<string, string | string[] | undefined>) {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const status = parseTrialRequestStatusFilter(get("status"));
  const q = get("q")?.trim() ?? "";
  return { status, q };
}

/**
 * Terugbelaanvragen van /proefles (tmc.trial_requests), nieuwste bovenaan.
 * Zelfde opzet als /app/admin/proefcodes; de autorisatie zit in de
 * admin-layout.
 */
export default async function AdminProeflessenPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const parsed = parseSearchParams(searchParams);

  const [kpis, rows] = await Promise.all([
    getTrialRequestKpis(),
    listTrialRequests({ status: parsed.status, q: parsed.q }),
  ]);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-12">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          {/* COPY: confirm met Marlon */}
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          {/* COPY: confirm met Marlon */}
          Proeflessen.
        </h1>
        <p className="text-text-muted text-sm mt-4 max-w-xl">
          {/* COPY: confirm met Marlon */}
          Wie via /proefles gebeld wil worden. Nieuwe aanvragen staan bovenaan;
          zet de status op benaderd, geboekt of afgevallen zodra je contact hebt
          gehad.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        <KpiCard label={TRIAL_REQUEST_STATUS_LABEL.new} value={kpis.new.toString()} />
        <KpiCard
          label={TRIAL_REQUEST_STATUS_LABEL.contacted}
          value={kpis.contacted.toString()}
        />
        <KpiCard label={TRIAL_REQUEST_STATUS_LABEL.booked} value={kpis.booked.toString()} />
        <KpiCard label={TRIAL_REQUEST_STATUS_LABEL.lost} value={kpis.lost.toString()} />
      </div>

      <ProeflessenToolbar status={parsed.status} q={parsed.q} />

      <ProeflessenTable rows={rows} />
    </div>
  );
}
