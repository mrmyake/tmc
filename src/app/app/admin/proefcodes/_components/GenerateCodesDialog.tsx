"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Download } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { AdminField, AdminInput, AdminSelect } from "@/components/ui/AdminField";
import {
  generateTrialCodes,
  type GeneratedTrialCode,
  type PillarChoice,
} from "@/lib/admin/trial-codes-actions";
import { formatShortDateWithYear } from "@/lib/format-date";

// COPY: confirm met Marlon
const PILLAR_OPTIONS: Array<{ value: PillarChoice; label: string }> = [
  { value: "both", label: "Beide" },
  { value: "yoga_mobility", label: "Yoga & mobility" },
  { value: "kettlebell", label: "Kettlebell" },
];

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

export function GenerateCodesDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"form" | "result">("form");
  const [count, setCount] = useState(10);
  const [pillar, setPillar] = useState<PillarChoice>("both");
  const [label, setLabel] = useState("");
  const [validDays, setValidDays] = useState(28);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedTrialCode[]>([]);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setStep("form");
    setError(null);
    setCount(10);
    setPillar("both");
    setLabel("");
    setValidDays(28);
    setGenerated([]);
    setCopied(false);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    if (step === "result") router.refresh();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await generateTrialCodes({ count, pillar, label, validDays });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setGenerated(res.codes);
      setStep("result");
    });
  }

  async function copyAllCodes() {
    try {
      await navigator.clipboard.writeText(
        generated.map((c) => c.code).join("\n"),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn; de codes staan gewoon leesbaar in de lijst.
    }
  }

  function downloadCsvResult() {
    // COPY: confirm met Marlon
    const headers = ["Code", "Pillar", "Batch", "Vervalt"];
    const body = generated.map((c) => [
      c.code,
      // COPY: confirm met Marlon
      c.pillar === "yoga_mobility"
        ? "Yoga & mobility"
        : c.pillar === "kettlebell"
          ? "Kettlebell"
          : "Beide",
      c.batchLabel ?? "",
      formatShortDateWithYear(new Date(c.expiresAt)),
    ]);
    downloadCsv(headers, body, "proefcodes-batch");
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden />
        {/* COPY: confirm met Marlon */}
        Codes genereren
      </button>

      <Dialog
        open={open}
        onClose={closeDialog}
        // COPY: confirm met Marlon
        title={step === "form" ? "Codes genereren" : "Codes klaar"}
        eyebrow="Proefcodes"
        size="wide"
      >
        {step === "form" ? (
          <div className="flex flex-col gap-5">
            <AdminField label="Aantal">
              <AdminInput
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </AdminField>
            <AdminField label="Pillar">
              <AdminSelect
                value={pillar}
                onChange={(e) => setPillar(e.target.value as PillarChoice)}
              >
                {PILLAR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="Batch-label">
              <AdminInput
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                // COPY: confirm met Marlon
                placeholder="Bv. instagram-actie-augustus"
              />
            </AdminField>
            <AdminField label="Geldigheidsduur (dagen)">
              <AdminInput
                type="number"
                min={1}
                value={validDays}
                onChange={(e) => setValidDays(Number(e.target.value))}
              />
            </AdminField>
            <DialogFooter
              result={error ? { ok: false, message: error } : null}
              onClose={closeDialog}
              onConfirm={submit}
              // COPY: confirm met Marlon
              confirmLabel={pending ? "Bezig" : "Genereren"}
              confirmDisabled={pending || !label.trim()}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              {generated.length} {generated.length === 1 ? "code" : "codes"}{" "}
              aangemaakt.
            </p>
            <div className="bg-bg border border-[color:var(--ink-500)] p-4 max-h-64 overflow-y-auto">
              <ul className="font-mono text-sm text-text flex flex-col gap-1">
                {generated.map((c) => (
                  <li key={c.code}>{c.code}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyAllCodes}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
              >
                <Copy size={14} strokeWidth={1.5} aria-hidden />
                {/* COPY: confirm met Marlon */}
                {copied ? "Gekopieerd" : "Kopieer alle codes"}
              </button>
              <button
                type="button"
                onClick={downloadCsvResult}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
              >
                <Download size={14} strokeWidth={1.5} aria-hidden />
                {/* COPY: confirm met Marlon */}
                Download CSV
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeDialog}
                className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Sluiten
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
