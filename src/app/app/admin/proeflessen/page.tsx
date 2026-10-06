import {
  getTrialRequestKpis,
  listTrialRequests,
  parseTrialRequestStatusFilter,
} from "@/lib/admin/trial-requests-query";
import {
  getTrialBookingKpis,
  listTrialBookingGroups,
  parseTrialBookingPeriod,
} from "@/lib/admin/trial-bookings-query";
import { TRIAL_REQUEST_STATUS_LABEL } from "@/lib/trial-requests/status";
import { KpiCard } from "../_components/KpiCard";
import { ProeflessenTabs, type ProeflessenTab } from "./_components/ProeflessenTabs";
import { ProeflessenToolbar } from "./_components/ProeflessenToolbar";
import { ProeflessenTable } from "./_components/ProeflessenTable";
import { BoekingenToolbar } from "./_components/BoekingenToolbar";
import { BoekingenTable } from "./_components/BoekingenTable";

export const metadata = {
  title: "Admin · Proeflessen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

function parseTab(value: string | undefined): ProeflessenTab {
  return value === "aanvragen" ? "aanvragen" : "boekingen";
}

/**
 * Twee tabs via ?tab= (zelfde patroon als /app/admin/betaalverzoeken):
 * Boekingen (default, tmc.trial_bookings) en Aanvragen (tmc.trial_requests,
 * het terugbelformulier). Header en tabs zijn gedeeld; KPI's, toolbar en
 * tabel zijn per tab. De autorisatie zit in de admin-layout.
 */
export default async function AdminProeflessenPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const tab = parseTab(getParam(searchParams, "tab"));
  const q = getParam(searchParams, "q")?.trim() ?? "";

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-8">
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
          Geboekte proeflessen per les, en wie via /proefles gebeld wil worden.
        </p>
      </header>

      <div className="mb-10">
        <ProeflessenTabs active={tab} />
      </div>

      {tab === "aanvragen" ? (
        <AanvragenPanel status={getParam(searchParams, "status")} q={q} />
      ) : (
        <BoekingenPanel
          period={getParam(searchParams, "periode")}
          q={q}
          showCancelled={getParam(searchParams, "geannuleerd") === "1"}
        />
      )}
    </div>
  );
}

async function BoekingenPanel({
  period: periodParam,
  q,
  showCancelled,
}: {
  period: string | undefined;
  q: string;
  showCancelled: boolean;
}) {
  const period = parseTrialBookingPeriod(periodParam);
  const [kpis, groups] = await Promise.all([
    getTrialBookingKpis(),
    listTrialBookingGroups({ period, q, showCancelled }),
  ]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:gap-5 mb-10 max-w-2xl">
        {/* COPY: confirm met Marlon */}
        <KpiCard
          label="Komende 7 dagen"
          value={kpis.upcomingWeek.toString()}
          hint="Bevestigd of in behandeling"
        />
        {/* COPY: confirm met Marlon */}
        <KpiCard label="Aanwezig geweest" value={kpis.attended.toString()} />
      </div>

      <BoekingenToolbar period={period} q={q} showCancelled={showCancelled} />

      <BoekingenTable groups={groups} period={period} />
    </>
  );
}

async function AanvragenPanel({
  status: statusParam,
  q,
}: {
  status: string | undefined;
  q: string;
}) {
  const status = parseTrialRequestStatusFilter(statusParam);
  const [kpis, rows] = await Promise.all([
    getTrialRequestKpis(),
    listTrialRequests({ status, q }),
  ]);

  return (
    <>
      <p className="text-text-muted text-sm mb-8 max-w-xl">
        {/* COPY: confirm met Marlon */}
        Nieuwe aanvragen staan bovenaan; zet de status op benaderd, geboekt of
        afgevallen zodra je contact hebt gehad.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        <KpiCard label={TRIAL_REQUEST_STATUS_LABEL.new} value={kpis.new.toString()} />
        <KpiCard
          label={TRIAL_REQUEST_STATUS_LABEL.contacted}
          value={kpis.contacted.toString()}
        />
        <KpiCard label={TRIAL_REQUEST_STATUS_LABEL.booked} value={kpis.booked.toString()} />
        <KpiCard label={TRIAL_REQUEST_STATUS_LABEL.lost} value={kpis.lost.toString()} />
      </div>

      <ProeflessenToolbar status={status} q={q} />

      <ProeflessenTable rows={rows} />
    </>
  );
}
