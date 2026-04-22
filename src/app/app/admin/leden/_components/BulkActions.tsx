"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, Mail } from "lucide-react";
import {
  pushSelectionToMailerLite,
  type MembersActionResult,
} from "@/lib/admin/members-actions";
import type { MemberRow } from "@/lib/admin/members-query";

interface BulkActionsProps {
  rows: MemberRow[];
  selection: Set<string>;
  onClear: () => void;
}

export function BulkActions({ rows, selection, onClear }: BulkActionsProps) {
  const selected = rows.filter((r) => selection.has(r.profileId));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MembersActionResult | null>(null);
  const [label, setLabel] = useState("");
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (dialogOpen && dialogRef.current) {
      dialogRef.current.showModal();
    }
  }, [dialogOpen]);

  function exportCsv() {
    const headers = [
      "Naam",
      "Email",
      "Abonnement",
      "Status",
      "Credits",
      "Laatste sessie",
      "MRR (EUR)",
    ];
    const body = selected.map((r) => [
      `${r.firstName} ${r.lastName}`.trim(),
      r.email,
      r.planType ?? "",
      r.membershipStatus,
      r.creditsRemaining == null ? "" : String(r.creditsRemaining),
      r.lastSessionDate ?? "",
      (r.mrrCents / 100).toFixed(2),
    ]);
    const csv = [headers, ...body]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leden-selectie-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openDialog() {
    setResult(null);
    setLabel("");
    setDialogOpen(true);
  }

  function closeDialog() {
    dialogRef.current?.close();
    setDialogOpen(false);
  }

  function confirmPush() {
    if (!label.trim()) {
      setResult({ ok: false, message: "Geef een groepnaam op." });
      return;
    }
    startTransition(async () => {
      const res = await pushSelectionToMailerLite(
        selected.map((r) => r.profileId),
        label,
      );
      setResult(res);
      if (res.ok) {
        window.setTimeout(() => {
          closeDialog();
          onClear();
        }, 1800);
      }
    });
  }

  if (selection.size === 0) return null;

  return (
    <>
      <div className="sticky bottom-6 z-10 flex flex-wrap items-center gap-3 px-5 py-3 bg-bg-elevated border border-accent/40">
        <span className="tmc-eyebrow tmc-eyebrow--accent">
          {selection.size} geselecteerd
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
          >
            <Download size={14} strokeWidth={1.5} />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openDialog}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-300 hover:bg-accent-hover hover:border-accent-hover cursor-pointer"
          >
            <Mail size={14} strokeWidth={1.5} />
            Mass-email
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text px-3 py-2.5 cursor-pointer"
          >
            Annuleren
          </button>
        </div>
      </div>

      {dialogOpen && (
        <dialog
          ref={dialogRef}
          onClose={closeDialog}
          className="bg-bg border border-[color:var(--ink-500)] text-text p-8 w-[min(92vw,520px)] backdrop:bg-bg/55 backdrop:backdrop-blur-sm"
        >
          <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl tracking-[-0.01em] mb-2">
            Mass-email voorbereiden
          </h3>
          <p className="text-text-muted text-sm mb-6">
            We maken een MailerLite-groep aan met deze leden. Alleen leden met
            marketing-opt-in aan worden gesynced. Daarna stuur je de campagne
            in MailerLite zelf.
          </p>
          <label className="flex flex-col gap-2 mb-6">
            <span className="tmc-eyebrow">Groepnaam</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bv. leden-update-april-2026"
              className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
            />
          </label>
          {result && (
            <div
              role={result.ok ? "status" : "alert"}
              className={`text-sm p-4 border mb-6 ${
                result.ok
                  ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
                  : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
              }`}
            >
              {result.message}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeDialog}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={confirmPush}
              disabled={pending || !label.trim()}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {pending ? "Bezig" : "Push naar MailerLite"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
