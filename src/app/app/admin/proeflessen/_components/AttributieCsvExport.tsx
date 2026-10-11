"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportLeadAttributionsCsv } from "@/lib/admin/lead-attributions-actions";

/**
 * Knop "Attributie CSV" in de Boekingen-toolbar (spec-marketing-attribution.md):
 * haalt de export via de server action (requireAdmin, service-role) en
 * downloadt hem client-side als Blob, hetzelfde patroon als OmzetCsvExport.
 * Beide brontypen (proefboekingen en terugbelaanvragen) in een bestand.
 */
export function AttributieCsvExport() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function exportCsv() {
    setBusy(true);
    setMessage("");
    try {
      const result = await exportLeadAttributionsCsv();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attributie-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // COPY: confirm met Marlon
      setMessage(result.count === 0 ? "Nog geen attributierijen." : `${result.count} rijen geexporteerd.`);
    } catch {
      // COPY: confirm met Marlon
      setMessage("Export mislukt. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      {message && <span className="text-xs text-text-muted">{message}</span>}
      <button
        type="button"
        onClick={() => void exportCsv()}
        disabled={busy}
        className="flex items-center gap-2 px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] hover:bg-accent hover:text-bg transition-colors disabled:opacity-50 cursor-pointer"
      >
        <Download size={14} strokeWidth={1.5} aria-hidden />
        {/* COPY: confirm met Marlon */}
        {busy ? "Bezig..." : "Attributie CSV"}
      </button>
    </div>
  );
}
