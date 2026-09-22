"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import {
  formatDateLong,
  formatRelativeWhen,
  parseIsoDateToAmsterdamMidnight,
} from "@/lib/format-date";
import type { AccountDeletionListRow } from "@/lib/admin/account-deletion-query";
import {
  cancelAccountDeletionByAdmin,
  hardstopAccountDeletionByAdmin,
} from "@/lib/admin/account-deletion-actions";
import { DeletionStatusBadge, StepStateChip, stepLabel } from "./DeletionStatusBadge";

interface Props {
  row: AccountDeletionListRow;
  /** false voor de historie: geen intrekken/hardstop-knoppen meer. */
  actionable: boolean;
}

function memberLabel(row: AccountDeletionListRow): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
  // COPY: confirm met Marlon
  return name || `Verwijderd lid (${row.memberCode})`;
}

export function AccountDeletionRow({ row, actionable }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [hardstopOpen, setHardstopOpen] = useState(false);
  const name = memberLabel(row);
  const now = new Date();

  function cancelRequest() {
    setResult(null);
    startTransition(async () => {
      const r = await cancelAccountDeletionByAdmin(row.id);
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  function confirmHardstop() {
    startTransition(async () => {
      const r = await hardstopAccountDeletionByAdmin(row.id);
      setResult(r);
      if (r.ok) {
        setHardstopOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <li className="border-b border-[color:var(--ink-500)]/40 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text">
            {row.profileId ? (
              <Link
                href={`/app/admin/leden/${row.profileId}`}
                className="hover:text-accent transition-colors"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </p>
          {row.email && <p className="text-text-muted text-xs mt-0.5">{row.email}</p>}
          <p className="text-text-muted text-xs mt-1">
            Lid {row.memberCode} &middot; via {row.requestedVia === "admin" ? "admin" : "app"}
          </p>
        </div>
        <DeletionStatusBadge status={row.status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs">
        <div>
          {/* COPY: confirm met Marlon */}
          <dt className="text-text-muted uppercase tracking-[0.14em]">Aangevraagd</dt>
          <dd className="text-text mt-1">{formatRelativeWhen(new Date(row.requestedAt), now)}</dd>
        </div>
        <div>
          {/* COPY: confirm met Marlon */}
          <dt className="text-text-muted uppercase tracking-[0.14em]">Sluiting</dt>
          <dd className="text-text mt-1">
            {row.closesOn ? (
              <>
                na{" "}
                {(() => {
                  const d = parseIsoDateToAmsterdamMidnight(row.closesOn as string);
                  return d ? formatDateLong(d) : row.closesOn;
                })()}
              </>
            ) : row.steps.find((s) => s.name === "freeze")?.state === "pending" ? (
              "-"
            ) : (
              "al gesloten"
            )}
          </dd>
        </div>
        <div>
          {/* COPY: confirm met Marlon */}
          <dt className="text-text-muted uppercase tracking-[0.14em]">Purge</dt>
          <dd className="text-text mt-1">{formatDateLong(new Date(row.purgeAfter))}</dd>
        </div>
        <div>
          {/* COPY: confirm met Marlon */}
          <dt className="text-text-muted uppercase tracking-[0.14em]">Pogingen</dt>
          <dd className="text-text mt-1">{row.attempts}</dd>
        </div>
      </dl>

      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {row.steps.map((step) => (
          <li key={step.name} className="flex items-center gap-2">
            <span className="text-text-muted text-xs">{stepLabel(step.name)}</span>
            <StepStateChip state={step.state} />
            {step.error && (
              <span
                title={step.error}
                className="text-[color:var(--danger)] text-xs underline decoration-dotted cursor-help"
              >
                {/* COPY: confirm met Marlon */}
                fout
              </span>
            )}
          </li>
        ))}
      </ul>

      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-4 text-sm ${
            result.ok ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
          }`}
        >
          {result.message}
        </p>
      )}

      {actionable && (
        <div className="mt-5 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={cancelRequest}
            disabled={pending}
            className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors disabled:opacity-50 cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            {pending ? "Bezig..." : "Verzoek intrekken"}
          </button>
          <button
            type="button"
            onClick={() => setHardstopOpen(true)}
            disabled={pending}
            className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--danger)] hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Nu sluiten
          </button>
        </div>
      )}

      <Dialog
        open={hardstopOpen}
        onClose={() => setHardstopOpen(false)}
        title="Nu sluiten"
        tone="danger"
      >
        {/* COPY: confirm met Marlon */}
        <p className="text-text text-sm mb-3">
          Weet je het zeker? Een lopend abonnement wordt per direct stopgezet
          en de toegang, boekingen en het tegoed van {name} gaan meteen dicht.
          Dit kan niet teruggedraaid worden.
        </p>
        <DialogFooter
          result={result}
          onClose={() => setHardstopOpen(false)}
          onConfirm={confirmHardstop}
          confirmLabel={pending ? "Bezig..." : "Nu sluiten"}
          confirmTone="danger"
          confirmDisabled={pending}
        />
      </Dialog>
    </li>
  );
}
