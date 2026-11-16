import {
  getProgrammaIntakeKpis,
  listProgrammaIntakes,
  parseProgrammaIntakeStatusFilter,
} from "@/lib/admin/programma-intakes-query";
import { PROGRAMMA_INTAKE_STATUS_LABEL } from "@/lib/programma-intake/status";
import { KpiCard } from "../_components/KpiCard";
import { IntakesToolbar } from "./_components/IntakesToolbar";
import { IntakesList } from "./_components/IntakesList";

export const metadata = {
  title: "Admin · Intakes | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Intake-aanvragen van het 12 weken programma (tmc.programma_intakes).
 * Nieuwste eerst; testaanvragen (is_test) staan standaard buiten beeld. De
 * autorisatie zit in de admin-layout.
 */
export default async function AdminIntakesPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const status = parseProgrammaIntakeStatusFilter(getParam(searchParams, "status"));
  const q = getParam(searchParams, "q")?.trim() ?? "";
  const showTest = getParam(searchParams, "test") === "1";

  const [kpis, rows] = await Promise.all([
    getProgrammaIntakeKpis(),
    listProgrammaIntakes({ status, q, showTest }),
  ]);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-10 md:py-14">
      <header className="mb-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          {/* COPY: confirm met Marlon */}
          Admin cockpit
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em]">
          {/* COPY: confirm met Marlon */}
          Intakes.
        </h1>
        <p className="text-text-muted text-sm mt-4 max-w-xl">
          {/* COPY: confirm met Marlon */}
          Aanvragen voor een intake van het 12 weken programma. Zet de status op
          benaderd, geboekt of afgevallen zodra je contact hebt gehad.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-10">
        <KpiCard label={PROGRAMMA_INTAKE_STATUS_LABEL.new} value={kpis.new.toString()} />
        <KpiCard
          label={PROGRAMMA_INTAKE_STATUS_LABEL.contacted}
          value={kpis.contacted.toString()}
        />
        <KpiCard label={PROGRAMMA_INTAKE_STATUS_LABEL.booked} value={kpis.booked.toString()} />
        <KpiCard label={PROGRAMMA_INTAKE_STATUS_LABEL.lost} value={kpis.lost.toString()} />
      </div>

      <IntakesToolbar status={status} q={q} showTest={showTest} />

      <IntakesList rows={rows} />
    </div>
  );
}
