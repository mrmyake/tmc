import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getTrialCodeDetail } from "@/lib/admin/trial-codes-query";
import { formatShortDateWithYear } from "@/lib/format-date";
import { RevokeCodeButton } from "../_components/RevokeCodeButton";
import { ScopeChip, StatusChip, batchLabel, kindLabel, usageLabel } from "../_components/status";
import { RedemptionsTable } from "./_components/RedemptionsTable";

export const metadata = {
  title: "Admin · Proefcode | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrialCodeDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  if (!UUID_RE.test(id)) notFound();

  const detail = await getTrialCodeDetail(id);
  if (!detail) notFound();

  return (
    <div className="px-6 md:px-10 lg:px-12 pt-8 pb-14">
      <Link
        href="/app/admin/proefcodes"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors mb-8"
      >
        <ChevronLeft size={14} strokeWidth={1.5} aria-hidden />
        {/* COPY: confirm met Marlon */}
        Alle proefcodes
      </Link>

      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            {/* COPY: confirm met Marlon */}
            Proefcode
          </span>
          <h1 className="font-mono text-3xl md:text-5xl tracking-[0.12em] text-text leading-[1.02] mb-3">
            {detail.code}
          </h1>
          <p className="text-text text-lg">{detail.label}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-muted">
            <StatusChip status={detail.status} />
            <ScopeChip scope={detail.scope} />
            <span>{kindLabel(detail.maxUses)}</span>
            {batchLabel(detail.batchSize) && (
              <>
                <span>·</span>
                <span>{batchLabel(detail.batchSize)}</span>
              </>
            )}
            <span>·</span>
            {/* COPY: confirm met Marlon */}
            <span>Gebruikt {usageLabel(detail)}</span>
            <span>·</span>
            <span>
              {/* COPY: confirm met Marlon */}
              Aangemaakt {formatShortDateWithYear(new Date(detail.createdAt))}
              {detail.createdByName ? ` door ${detail.createdByName}` : ""}
            </span>
            {detail.revokedAt && (
              <>
                <span>·</span>
                <span>
                  {/* COPY: confirm met Marlon */}
                  Ingetrokken {formatShortDateWithYear(new Date(detail.revokedAt))}
                  {detail.revokedByName ? ` door ${detail.revokedByName}` : ""}
                </span>
              </>
            )}
          </div>
        </div>
        {detail.status !== "revoked" && <RevokeCodeButton id={detail.id} code={detail.code} />}
      </header>

      <section>
        <h2 className="tmc-eyebrow mb-4">
          {/* COPY: confirm met Marlon */}
          Inwisselingen ({detail.redemptions.length})
        </h2>
        <RedemptionsTable rows={detail.redemptions} codeId={detail.id} />
      </section>
    </div>
  );
}
