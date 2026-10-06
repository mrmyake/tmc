import { AlertTriangle } from "lucide-react";
import { getEmailSignups } from "@/lib/admin/email-signups-query";
import { isSignupStatus, type SignupStatus } from "@/lib/email-signups/status";
import { formatShortDateWithYear, formatTime } from "@/lib/format-date";
import { KpiCard } from "../_components/KpiCard";
import { AanmeldingenToolbar } from "./_components/AanmeldingenToolbar";
import { AanmeldingenTable } from "./_components/AanmeldingenTable";
import { RefreshButton } from "./_components/RefreshButton";

export const metadata = {
  title: "Admin · Aanmeldingen | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(sp: SearchParams, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

function parseStatus(value: string | undefined): SignupStatus | "all" {
  return isSignupStatus(value) ? value : "all";
}

/**
 * E-mailaanmeldingen uit MailerLite en de leden met marketing opt-in, een
 * rij per adres (spec-admin-email-signups.md). Zelfde opzet als
 * /app/admin/proefcodes; de autorisatie zit in de admin-layout, de
 * MailerLite-key en de service-role client blijven server-side.
 */
export default async function AdminAanmeldingenPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const filters = {
    q: getParam(searchParams, "q")?.trim() ?? "",
    source: getParam(searchParams, "bron")?.trim() || "all",
    status: parseStatus(getParam(searchParams, "status")),
    showHidden: getParam(searchParams, "afgemeld") === "1",
  };

  const result = await getEmailSignups(filters);
  const fetched = result.fetchedAt ? new Date(result.fetchedAt) : null;

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
            Aanmeldingen.
          </h1>
          <p className="text-text-muted text-sm mt-4 max-w-xl">
            {/* COPY: confirm met Marlon */}
            Alle e-mailadressen uit de formulieren op de site (MailerLite) en
            de leden met marketing opt-in, een regel per adres. De lijst wordt
            elke vijf minuten ververst.
            {fetched && (
              <>
                {" "}
                {/* COPY: confirm met Marlon */}
                Laatst opgehaald {formatShortDateWithYear(fetched)} om {formatTime(fetched)}.
              </>
            )}
          </p>
        </div>
        <RefreshButton />
      </header>

      {result.mailerliteError && (
        <div
          role="alert"
          className="mb-10 flex items-start gap-3 border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-5 py-4 text-sm text-text"
        >
          <AlertTriangle size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 text-[color:var(--danger)]" />
          <div>
            {/* COPY: confirm met Marlon */}
            <p>MailerLite was niet bereikbaar. Hieronder staan alleen de leden met marketing opt-in uit Supabase.</p>
            <p className="text-text-muted mt-1">{result.mailerliteError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mb-10">
        {/* COPY: confirm met Marlon */}
        <KpiCard label="Actieve adressen" value={result.kpis.active.toString()} />
        {/* COPY: confirm met Marlon */}
        <KpiCard label="Nieuw in 30 dagen" value={result.kpis.newLast30Days.toString()} hint="Actief, op aanmelddatum" />
        {/* COPY: confirm met Marlon */}
        <KpiCard label="Afgemeld" value={result.kpis.unsubscribed.toString()} />
      </div>

      <AanmeldingenToolbar
        q={filters.q}
        source={filters.source}
        status={filters.status}
        showHidden={filters.showHidden}
        sources={result.sources}
      />

      <p className="text-xs text-text-muted mb-4">
        {/* COPY: confirm met Marlon */}
        {result.rows.length} van {result.total} adressen
      </p>

      <AanmeldingenTable rows={result.rows} />
    </div>
  );
}
