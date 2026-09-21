import Link from "next/link";
import { formatDateLong } from "@/lib/format-date";
import { CancelDeletionButton } from "./CancelDeletionButton";

interface Props {
  /** Open verwijderverzoek van dit lid, als dat er is (account_deletions self-read). */
  open: { requestedAt: string; purgeAfter: string; closingPending: boolean } | null;
}

/**
 * Ingang van de accountverwijdering op /app/profiel. De flow zelf staat op
 * /app/profiel/verwijderen (preflight, bevestigingscode, status), zodat hij
 * in de app en op het web hetzelfde werkt. Loopt er een verzoek, dan staat
 * hier de status en, zolang de sluiting op de einddatum wacht, de knop om
 * het in te trekken.
 */
export function AccountDeletionSection({ open }: Props) {
  if (open) {
    return (
      <div className="mt-14 border-t border-[color:var(--ink-500)]/60 pt-10">
        {/* COPY: confirm met Marlon */}
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Verwijderverzoek loopt
        </span>
        <p className="text-text text-sm mb-2">
          Aangevraagd op {formatDateLong(new Date(open.requestedAt))}.
        </p>
        {open.closingPending ? (
          <p className="text-text-muted text-sm leading-relaxed max-w-md">
            Tot en met de laatste dag van je abonnement blijft alles werken:
            inloggen, boeken, de deur openen. De dag daarna sluiten we je
            account. Je gegevens worden verwijderd na{" "}
            {formatDateLong(new Date(open.purgeAfter))}.
          </p>
        ) : (
          <p className="text-text-muted text-sm leading-relaxed max-w-md">
            Je account is gesloten. Je gegevens worden verwijderd na{" "}
            {formatDateLong(new Date(open.purgeAfter))}.
          </p>
        )}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
          {open.closingPending && <CancelDeletionButton />}
          <Link
            href="/app/profiel/verwijderen"
            className="text-xs text-text-muted hover:text-text transition-colors duration-300 uppercase tracking-[0.2em]"
          >
            {/* COPY: confirm met Marlon */}
            Details
          </Link>
        </div>
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
        met een code per mail. Een lopend abonnement zeg je eerst op.
      </p>
    </div>
  );
}
