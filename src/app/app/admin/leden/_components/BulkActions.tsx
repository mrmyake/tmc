"use client";

import { useState, useTransition } from "react";
import { Download, Mail } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
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
  const [dialogOpen, setDialogOpen] = useState(false);

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

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title="Mass-email voorbereiden"
        size="narrow"
      >
        <p className="text-text-muted text-sm mb-6">
          We maken een MailerLite-groep aan met deze leden. Alleen leden met
          marketing-opt-in aan worden gesynced. Daarna stuur je de campagne
          in MailerLite zelf.
        </p>
        <AdminField label="Groepnaam" className="mb-6">
          <AdminInput
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Bv. leden-update-april-2026"
          />
        </AdminField>
        <DialogFooter
          result={result}
          onClose={closeDialog}
          onConfirm={confirmPush}
          confirmLabel={pending ? "Bezig" : "Push naar MailerLite"}
          confirmDisabled={pending || !label.trim()}
        />
      </Dialog>
    </>
  );
}
