import Link from "next/link";
import { formatDateLong } from "@/lib/format-date";

interface Props {
  /** Open verwijderverzoek van dit lid, als dat er is (account_deletions self-read). */
  open: { requestedAt: string; purgeAfter: string } | null;
}

/**
 * Ingang van de accountverwijdering op /app/profiel. De flow zelf staat op
 * /app/profiel/verwijderen (preflight, bevestigingscode, status), zodat hij
 * in de app en op het web hetzelfde werkt.
 */
export function AccountDeletionSection({ open }: Props) {
  if (open) {
    return (
      <div className="mt-14 border-t border-[color:var(--ink-500)]/60 pt-10">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Verwijderverzoek loopt
        </span>
        <p className="text-text text-sm">
          Aangevraagd op {formatDateLong(new Date(open.requestedAt))}. Je gegevens
          worden verwijderd na {formatDateLong(new Date(open.purgeAfter))}.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-10 text-center">
      <Link
        href="/app/profiel/verwijderen"
        className="text-[11px] font-medium uppercase tracking-[0.25em] text-text-muted/70 transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-[color:var(--danger)]"
      >
        {/* COPY: confirm met Marlon */}
        Account verwijderen
      </Link>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted/60 text-xs mt-3 max-w-prose mx-auto">
        Je ziet eerst wat er gebeurt en wat er bewaard blijft, en bevestigt
        met een code per mail. Een lopend lidmaatschap zeg je eerst op.
      </p>
    </div>
  );
}
