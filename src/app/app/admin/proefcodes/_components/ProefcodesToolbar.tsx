"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X, Download } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { revokeTrialCodeBatch } from "@/lib/admin/trial-codes-actions";
import type {
  TrialCodeBatchOption,
  TrialCodeRow,
  TrialCodeStatusFilter,
} from "@/lib/admin/trial-codes-query";
import { formatShortDateWithYear } from "@/lib/format-date";

// COPY: confirm met Marlon
const STATUS_LABEL: Record<TrialCodeStatusFilter, string> = {
  active: "Actief",
  redeemed: "Verzilverd",
  revoked: "Ingetrokken",
  all: "Alles",
};

// COPY: confirm met Marlon
const PILLAR_LABEL: Record<string, string> = {
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
};

function pillarLabel(pillar: string | null): string {
  // COPY: confirm met Marlon
  return pillar ? (PILLAR_LABEL[pillar] ?? pillar) : "Beide";
}

function downloadCsv(
  headers: string[],
  rows: string[][],
  filenamePrefix: string,
) {
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ProefcodesToolbarProps {
  status: TrialCodeStatusFilter;
  batch: string;
  q: string;
  batches: TrialCodeBatchOption[];
  rows: TrialCodeRow[];
}

export function ProefcodesToolbar({
  status,
  batch,
  q,
  batches,
  rows,
}: ProefcodesToolbarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [query, setQuery] = useState(q);
  const [batchRevokeOpen, setBatchRevokeOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  useEffect(() => {
    setQuery(q);
  }, [q]);

  function pushWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`/app/admin/proefcodes?${next.toString()}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushWith({ q: query.trim() || null });
  }

  function resetAll() {
    router.push("/app/admin/proefcodes");
  }

  const hasFilters = Boolean(q) || status !== "active" || Boolean(batch);

  const selectedBatch = batches.find((b) => b.batchId === batch);

  function openBatchRevoke() {
    setResult(null);
    setBatchRevokeOpen(true);
  }

  function confirmBatchRevoke() {
    startTransition(async () => {
      const res = await revokeTrialCodeBatch(batch);
      setResult(res);
      if (res.ok) {
        router.refresh();
      }
    });
  }

  function exportCsv() {
    if (status === "active") {
      // COPY: confirm met Marlon
      const headers = ["Code", "Pillar", "Batch", "Vervalt"];
      const body = rows.map((r) => [
        r.code,
        pillarLabel(r.pillar),
        r.batchLabel ?? "",
        formatShortDateWithYear(new Date(r.expiresAt)),
      ]);
      downloadCsv(headers, body, "proefcodes-actief");
    } else if (status === "redeemed") {
      // COPY: confirm met Marlon
      const headers = [
        "Code",
        "Naam",
        "E-mail",
        "Telefoon",
        "Les",
        "Datum",
        "Verzilverd op",
      ];
      const body = rows.map((r) => [
        r.code,
        r.redeemer?.name ?? "",
        r.redeemer?.email ?? "",
        r.redeemer?.phone ?? "",
        r.redeemer?.className ?? "",
        r.redeemer?.sessionStartAt
          ? formatShortDateWithYear(new Date(r.redeemer.sessionStartAt))
          : "",
        r.redeemedAt ? formatShortDateWithYear(new Date(r.redeemedAt)) : "",
      ]);
      downloadCsv(headers, body, "proefcodes-verzilverd");
    }
  }

  const showExport = status === "active" || status === "redeemed";

  return (
    <div className="flex flex-col gap-4 mb-8">
      <form onSubmit={submitSearch} className="relative">
        <label htmlFor="proefcodes-search" className="sr-only">
          {/* COPY: confirm met Marlon */}
          Zoek op code, batch, naam of e-mail
        </label>
        <Search
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id="proefcodes-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // COPY: confirm met Marlon
          placeholder="Zoek op code, batch, naam of e-mail"
          className="w-full bg-bg-elevated border border-[color:var(--ink-500)] px-12 py-3.5 text-sm text-text focus:outline-none focus:border-accent"
        />
        {query && (
          <button
            type="button"
            aria-label="Wis zoekopdracht"
            onClick={() => {
              setQuery("");
              pushWith({ q: null });
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={Object.entries(STATUS_LABEL)}
          onChange={(v) => pushWith({ status: v === "active" ? null : v })}
        />
        <FilterSelect
          label="Batch"
          value={batch}
          options={[
            // COPY: confirm met Marlon
            ["", "Alle batches"],
            ...batches.map(
              (b): [string, string] => [b.batchId, b.label],
            ),
          ]}
          onChange={(v) => pushWith({ batch: v === "" ? null : v })}
        />
        {batch && (
          <button
            type="button"
            onClick={openBatchRevoke}
            className="inline-flex items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Hele batch intrekken
          </button>
        )}
        {showExport && (
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
          >
            <Download size={14} strokeWidth={1.5} aria-hidden />
            {/* COPY: confirm met Marlon */}
            Export CSV
          </button>
        )}
        {hasFilters && (
          <Link
            href="/app/admin/proefcodes"
            onClick={(e) => {
              e.preventDefault();
              resetAll();
            }}
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
          >
            {/* COPY: confirm met Marlon */}
            Reset filters
          </Link>
        )}
      </div>

      <Dialog
        open={batchRevokeOpen}
        onClose={() => setBatchRevokeOpen(false)}
        // COPY: confirm met Marlon
        title="Hele batch intrekken?"
        eyebrow="Proefcodes"
        tone="danger"
        size="narrow"
      >
        <p className="text-text-muted text-sm mb-3">
          {/* COPY: confirm met Marlon */}
          Dit trekt alle nog actieve codes in batch &ldquo;
          {selectedBatch?.label ?? batch}&rdquo; in, ongeacht welke statusweergave
          je nu open hebt staan. Al verzilverde codes in deze batch blijven
          gewoon geldig.
        </p>
        <DialogFooter
          result={result}
          onClose={() => setBatchRevokeOpen(false)}
          onConfirm={confirmBatchRevoke}
          // COPY: confirm met Marlon
          cancelLabel="Terug"
          confirmLabel={pending ? "Bezig" : "Batch intrekken"}
          confirmDisabled={pending}
          confirmTone="danger"
        />
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="tmc-eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text focus:outline-none focus:border-accent cursor-pointer"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
