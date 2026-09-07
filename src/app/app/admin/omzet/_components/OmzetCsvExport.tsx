"use client";

import { Download } from "lucide-react";
import type { RevenueGroup } from "@/lib/admin/revenue-report-query";
import { categoryLabel } from "@/lib/admin/revenue-categories";

/**
 * Zelfde quoting-patroon als BulkActions.tsx (client-side Blob,
 * "…".replace(/"/g,'""')). De export leest de al-gefilterde `groups` die
 * het scherm zelf net rendert -- geen eigen databasequery, dus de export
 * kan per definitie niet meer of minder bevatten dan wat er op het scherm
 * stond (7.6).
 */
export function OmzetCsvExport({
  groups,
  fromMonth,
  toMonth,
}: {
  groups: RevenueGroup[];
  fromMonth: string;
  toMonth: string;
}) {
  function exportCsv() {
    const headers = [
      "Maand",
      "Categorie",
      "Netto (EUR)",
      "BTW (EUR)",
      "Bruto (EUR)",
      "Gecorrigeerd (EUR)",
    ];
    const body = groups.map((g) => [
      g.month.slice(0, 7),
      categoryLabel(g.category),
      g.netCents === null ? "" : (g.netCents / 100).toFixed(2),
      g.vatCents === null ? "" : (g.vatCents / 100).toFixed(2),
      (g.grossCents / 100).toFixed(2),
      (g.correctedCents / 100).toFixed(2),
    ]);
    const csv = [headers, ...body]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omzet-${fromMonth}-tot-${toMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={exportCsv}
      disabled={groups.length === 0}
      className="ml-auto flex items-center gap-2 px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
    >
      <Download size={14} strokeWidth={1.5} aria-hidden />
      {/* COPY: confirm met Marlon */}
      CSV exporteren
    </button>
  );
}
