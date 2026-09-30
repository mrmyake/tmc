"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy } from "lucide-react";
import type { TrialCodeRow } from "@/lib/admin/trial-codes-query";
import { formatShortDateWithYear } from "@/lib/format-date";
import { RevokeCodeButton } from "./RevokeCodeButton";
import { ScopeChip, StatusChip, batchLabel, kindLabel, usageLabel } from "./status";

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn; de code staat leesbaar in de rij.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      // COPY: confirm met Marlon
      title="Kopieer code"
      className="inline-flex items-center gap-1.5 font-mono text-sm text-text hover:text-accent transition-colors cursor-pointer"
    >
      <Copy size={12} strokeWidth={1.5} aria-hidden />
      {/* COPY: confirm met Marlon */}
      {copied ? "Gekopieerd" : code}
    </button>
  );
}

function CreatedCell({ row }: { row: TrialCodeRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-text-muted">
        {formatShortDateWithYear(new Date(row.createdAt))}
      </span>
      {row.createdByName && (
        <span className="text-xs text-text-muted/70">
          {/* COPY: confirm met Marlon */}
          door {row.createdByName}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {/* COPY: confirm met Marlon */}
        Geen proefcodes
      </span>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        {/* COPY: confirm met Marlon */}
        Geen proefcodes gevonden bij deze filter.
      </p>
    </div>
  );
}

export function ProefcodesTable({ rows }: { rows: TrialCodeRow[] }) {
  if (rows.length === 0) return <EmptyState />;

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              {/* COPY: confirm met Marlon */}
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                <span className="tmc-eyebrow">Code</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Omschrijving</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Soort</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Geldig voor</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Gebruikt</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Aangemaakt</span>
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-right">
                <span className="tmc-eyebrow">Actie</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60 ${
                  row.status !== "active" ? "opacity-70" : ""
                }`}
              >
                <td className="py-4 pl-3 pr-4 align-middle">
                  <CopyCodeButton code={row.code} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  <Link
                    href={`/app/admin/proefcodes/${row.id}`}
                    className="hover:text-accent transition-colors"
                  >
                    {row.label}
                  </Link>
                  {batchLabel(row.batchSize) && (
                    <span className="block mt-0.5 text-xs text-text-muted">
                      {batchLabel(row.batchSize)}
                    </span>
                  )}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {kindLabel(row.maxUses)}
                </td>
                <td className="py-4 px-4 align-middle">
                  <ScopeChip scope={row.scope} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {usageLabel(row)}
                </td>
                <td className="py-4 px-4 align-middle">
                  <StatusChip status={row.status} />
                </td>
                <td className="py-4 px-4 align-middle">
                  <CreatedCell row={row} />
                </td>
                <td className="py-4 pl-4 pr-3 align-middle text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/app/admin/proefcodes/${row.id}`}
                      className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors"
                    >
                      {/* COPY: confirm met Marlon */}
                      Inwisselingen ({row.redemptionsTotal})
                    </Link>
                    {row.status !== "revoked" && (
                      <RevokeCodeButton id={row.id} code={row.code} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40 ${
              row.status !== "active" ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <CopyCodeButton code={row.code} />
              <StatusChip status={row.status} />
            </div>
            <Link
              href={`/app/admin/proefcodes/${row.id}`}
              className="text-sm text-text hover:text-accent transition-colors"
            >
              {row.label}
            </Link>
            {batchLabel(row.batchSize) && (
              <span className="-mt-2 text-xs text-text-muted">{batchLabel(row.batchSize)}</span>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <ScopeChip scope={row.scope} />
              <span>{kindLabel(row.maxUses)}</span>
              <span>·</span>
              {/* COPY: confirm met Marlon */}
              <span>Gebruikt {usageLabel(row)}</span>
              <span>·</span>
              <span>
                {/* COPY: confirm met Marlon */}
                Aangemaakt {formatShortDateWithYear(new Date(row.createdAt))}
                {row.createdByName ? ` door ${row.createdByName}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={`/app/admin/proefcodes/${row.id}`}
                className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors"
              >
                {/* COPY: confirm met Marlon */}
                Inwisselingen ({row.redemptionsTotal})
              </Link>
              {row.status !== "revoked" && <RevokeCodeButton id={row.id} code={row.code} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
