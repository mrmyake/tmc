"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import {
  createTrialCode,
  type CreatedTrialCode,
  type TrialCodeKind,
} from "@/lib/admin/trial-codes-actions";
import { normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { kindLabel } from "./status";

// COPY: confirm met Marlon
const KIND_OPTIONS: Array<{ value: TrialCodeKind; label: string; hint: string }> = [
  { value: "single", label: "Eenmalig", hint: "Een keer te gebruiken, voor een persoon." },
  { value: "multi", label: "Aantal keer", hint: "Een vast aantal keer te gebruiken." },
  { value: "unlimited", label: "Onbeperkt", hint: "Actiecode, geldig tot je hem intrekt." },
];

export function CreateCodeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"form" | "result">("form");
  const [mode, setMode] = useState<"generate" | "custom">("generate");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TrialCodeKind>("single");
  const [maxUses, setMaxUses] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTrialCode | null>(null);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setStep("form");
    setError(null);
    setMode("generate");
    setCode("");
    setLabel("");
    setKind("single");
    setMaxUses(5);
    setCreated(null);
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
      const res = await createTrialCode({
        code: mode === "custom" ? code : "",
        label,
        kind,
        maxUses: kind === "multi" ? maxUses : undefined,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setCreated(res.code);
      setStep("result");
    });
  }

  async function copyCode() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn; de code staat leesbaar in beeld.
    }
  }

  const canSubmit =
    !pending &&
    label.trim().length > 0 &&
    (mode === "generate" || normalizeTrialCode(code).length >= 4) &&
    (kind !== "multi" || (Number.isInteger(maxUses) && maxUses >= 1));

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden />
        {/* COPY: confirm met Marlon */}
        Nieuwe code
      </button>

      <Dialog
        open={open}
        onClose={closeDialog}
        // COPY: confirm met Marlon
        title={step === "form" ? "Nieuwe proefcode" : "Code aangemaakt"}
        eyebrow="Proefcodes"
        size="wide"
      >
        {step === "form" ? (
          <div className="flex flex-col gap-5">
            {/* COPY: confirm met Marlon */}
            <AdminField label="Code">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input
                      type="radio"
                      name="code-mode"
                      checked={mode === "generate"}
                      onChange={() => setMode("generate")}
                    />
                    {/* COPY: confirm met Marlon */}
                    Laat genereren (8 tekens)
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input
                      type="radio"
                      name="code-mode"
                      checked={mode === "custom"}
                      onChange={() => setMode("custom")}
                    />
                    {/* COPY: confirm met Marlon */}
                    Zelf kiezen
                  </label>
                </div>
                {mode === "custom" && (
                  <AdminInput
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    // COPY: confirm met Marlon
                    placeholder="Bv. FLYER2026"
                    className="font-mono uppercase"
                    autoCapitalize="characters"
                    spellCheck={false}
                  />
                )}
              </div>
            </AdminField>
            {/* COPY: confirm met Marlon */}
            <AdminField label="Omschrijving" hint="Intern, bv. waar de code voor is uitgedeeld.">
              <AdminInput
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                // COPY: confirm met Marlon
                placeholder="Bv. Actie flyer oktober"
              />
            </AdminField>
            {/* COPY: confirm met Marlon */}
            <AdminField label="Soort">
              <div className="flex flex-col gap-3">
                {KIND_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className="flex items-start gap-3 text-sm text-text cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="code-kind"
                      className="mt-1"
                      checked={kind === o.value}
                      onChange={() => setKind(o.value)}
                    />
                    <span className="flex flex-col gap-0.5">
                      <span>{o.label}</span>
                      <span className="text-xs text-text-muted">{o.hint}</span>
                    </span>
                    {o.value === "multi" && kind === "multi" && (
                      <AdminInput
                        type="number"
                        min={1}
                        value={maxUses}
                        onChange={(e) => setMaxUses(Number(e.target.value))}
                        className="ml-auto w-24"
                        aria-label="Aantal keer"
                      />
                    )}
                  </label>
                ))}
              </div>
            </AdminField>
            <DialogFooter
              result={error ? { ok: false, message: error } : null}
              onClose={closeDialog}
              onConfirm={submit}
              // COPY: confirm met Marlon
              confirmLabel={pending ? "Bezig" : "Aanmaken"}
              confirmDisabled={!canSubmit}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              {created?.label} · {kindLabel(created?.maxUses ?? null)}
            </p>
            <div className="bg-bg border border-[color:var(--ink-500)] p-5 flex items-center justify-between gap-4">
              <span className="font-mono text-2xl tracking-[0.12em] text-text">
                {created?.code}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
              >
                <Copy size={14} strokeWidth={1.5} aria-hidden />
                {/* COPY: confirm met Marlon */}
                {copied ? "Gekopieerd" : "Kopieer"}
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
