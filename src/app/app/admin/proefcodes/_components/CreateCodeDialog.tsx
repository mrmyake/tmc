"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Download, Minus } from "lucide-react";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import {
  createTrialCode,
  createTrialCodesBatch,
  type CreatedTrialCode,
  type TrialCodeKind,
} from "@/lib/admin/trial-codes-actions";
import { normalizeTrialCode } from "@/lib/trial-codes/normalize";
import { trialCodesCsv } from "@/lib/trial-codes/csv";
import {
  SCOPE_DESCRIPTION,
  SCOPE_LABEL,
  SELECTABLE_TRIAL_CODE_SCOPES,
  type TrialCodeScope,
} from "@/lib/trial-codes/scope";
import { ScopeChip, kindLabel } from "./status";

// COPY: confirm met Marlon
const KIND_OPTIONS: Array<{ value: TrialCodeKind; label: string }> = [
  { value: "single", label: "Eenmalig" },
  { value: "multi", label: "Aantal keer" },
  { value: "unlimited", label: "Onbeperkt" },
];

const MAX_BATCH = 50;

export function CreateCodeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"form" | "result">("form");
  const [own, setOwn] = useState(false);
  const [amount, setAmount] = useState(10);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TrialCodeKind>("single");
  const [maxUses, setMaxUses] = useState(5);
  const [scope, setScope] = useState<TrialCodeScope>("group");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTrialCode[]>([]);
  const [copied, setCopied] = useState(false);

  function openDialog() {
    setStep("form");
    setError(null);
    setOwn(false);
    setAmount(10);
    setCode("");
    setLabel("");
    setKind("single");
    setMaxUses(5);
    setScope("group");
    setCreated([]);
    setCopied(false);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    if (step === "result") router.refresh();
  }

  function clampAmount(n: number) {
    setAmount(Number.isFinite(n) ? Math.max(1, Math.min(MAX_BATCH, Math.trunc(n))) : 1);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const common = {
        label,
        kind,
        maxUses: kind === "multi" ? maxUses : undefined,
        scope,
      };
      if (own) {
        const res = await createTrialCode({ ...common, code });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setCreated([res.code]);
      } else {
        const res = await createTrialCodesBatch({ ...common, count: amount });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setCreated(res.codes);
      }
      setStep("result");
    });
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(created.map((c) => c.code).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn; de codes staan leesbaar in beeld.
    }
  }

  function downloadCsv() {
    const blob = new Blob([trialCodesCsv(created)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proefcodes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const canSubmit =
    !pending &&
    label.trim().length > 0 &&
    (!own || normalizeTrialCode(code).length >= 4) &&
    (kind !== "multi" || (Number.isInteger(maxUses) && maxUses >= 1));

  // COPY: confirm met Marlon
  const submitLabel = pending
    ? "Bezig"
    : own
      ? "Code opslaan"
      : amount === 1
        ? "Maak 1 code"
        : `Maak ${amount} codes`;

  const first = created[0];

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] cursor-pointer"
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden />
        {/* COPY: confirm met Marlon */}
        Codes maken
      </button>

      <Dialog
        open={open}
        onClose={closeDialog}
        // COPY: confirm met Marlon
        title={
          step === "form"
            ? "Codes maken"
            : created.length === 1
              ? "1 code gemaakt"
              : `${created.length} codes gemaakt`
        }
        eyebrow="Proefcodes"
        size="wide"
      >
        {step === "form" ? (
          <div className="flex flex-col gap-5">
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              Elke code geeft een gratis proefles. Een code blijft geldig tot je hem intrekt.
            </p>

            {own ? (
              // COPY: confirm met Marlon
              <AdminField label="Eigen code">
                <AdminInput
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  // COPY: confirm met Marlon
                  placeholder="Bv. ZOMERYOGA"
                  className="font-mono uppercase tracking-[0.08em]"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </AdminField>
            ) : (
              // COPY: confirm met Marlon
              <AdminField label="Aantal codes">
                <div className="grid grid-cols-[44px_1fr_44px] h-12 border border-[color:var(--ink-500)] max-w-[220px]">
                  <button
                    type="button"
                    // COPY: confirm met Marlon
                    aria-label="Minder"
                    onClick={() => clampAmount(amount - 1)}
                    className="grid place-items-center bg-bg-elevated text-text-muted hover:text-text cursor-pointer"
                  >
                    <Minus size={16} strokeWidth={1.5} aria-hidden />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_BATCH}
                    value={amount}
                    onChange={(e) => clampAmount(e.target.valueAsNumber)}
                    // COPY: confirm met Marlon
                    aria-label="Aantal codes"
                    className="bg-bg text-center text-base text-text tabular-nums focus:outline-none focus:bg-bg-elevated w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    // COPY: confirm met Marlon
                    aria-label="Meer"
                    onClick={() => clampAmount(amount + 1)}
                    className="grid place-items-center bg-bg-elevated text-text-muted hover:text-text cursor-pointer"
                  >
                    <Plus size={16} strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              </AdminField>
            )}

            {/* COPY: confirm met Marlon */}
            <AdminField
              label="Label"
              hint="Alleen voor jou zichtbaar, bv. waar de codes voor zijn uitgedeeld."
            >
              <AdminInput
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                // COPY: confirm met Marlon
                placeholder="Bv. Flyers bakkerij"
              />
            </AdminField>

            {/* COPY: confirm met Marlon */}
            <AdminField label="Hoe vaak mag elke code gebruikt worden">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  role="radiogroup"
                  // COPY: confirm met Marlon
                  aria-label="Soort"
                  className="inline-flex gap-1 p-1 border border-[color:var(--ink-500)] bg-bg"
                >
                  {KIND_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={kind === o.value}
                      onClick={() => setKind(o.value)}
                      className={`h-10 px-3 sm:px-4 text-sm cursor-pointer transition-colors ${
                        kind === o.value
                          ? "bg-bg-elevated text-accent"
                          : "text-text-muted hover:text-text"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {kind === "multi" && (
                  <span className="inline-flex items-center gap-2 text-sm text-text-muted">
                    <AdminInput
                      type="number"
                      min={1}
                      value={maxUses}
                      onChange={(e) => setMaxUses(Number(e.target.value))}
                      className="w-20 text-center"
                      // COPY: confirm met Marlon
                      aria-label="Aantal keer"
                    />
                    {/* COPY: confirm met Marlon */}
                    keer
                  </span>
                )}
              </div>
            </AdminField>

            {/* COPY: confirm met Marlon */}
            <AdminField label="Geldig voor">
              <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SELECTABLE_TRIAL_CODE_SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={scope === s}
                    onClick={() => setScope(s)}
                    className={`text-left p-4 border flex flex-col gap-1.5 min-h-[88px] cursor-pointer transition-colors ${
                      scope === s
                        ? "border-accent bg-bg-elevated"
                        : "border-[color:var(--ink-500)] bg-bg hover:border-text-muted/50"
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${scope === s ? "text-accent" : "text-text"}`}
                    >
                      {SCOPE_LABEL[s]}
                    </span>
                    <span className="text-xs leading-snug text-text-muted">
                      {SCOPE_DESCRIPTION[s]}
                    </span>
                  </button>
                ))}
              </div>
            </AdminField>

            <button
              type="button"
              onClick={() => {
                setOwn((v) => !v);
                setError(null);
              }}
              className="self-start text-sm text-text-muted underline underline-offset-4 hover:text-text transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {own ? "Liever codes laten maken" : "Liever zelf een code intypen"}
            </button>

            <DialogFooter
              result={error ? { ok: false, message: error } : null}
              onClose={closeDialog}
              onConfirm={submit}
              confirmLabel={submitLabel}
              confirmDisabled={!canSubmit}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              {first && (
                <>
                  <span className="text-xs px-3 py-1 bg-bg-elevated text-text">{first.label}</span>
                  <span className="text-xs px-3 py-1 bg-bg-elevated text-text">
                    {kindLabel(first.maxUses)}
                  </span>
                  <ScopeChip scope={first.scope} />
                </>
              )}
            </div>

            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto">
              {created.map((c) => (
                <li
                  key={c.id}
                  className="h-12 grid place-items-center bg-bg border border-[color:var(--ink-500)] font-mono text-sm tracking-[0.1em] text-text"
                >
                  {c.code}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyAll}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
              >
                <Copy size={14} strokeWidth={1.5} aria-hidden />
                {/* COPY: confirm met Marlon */}
                {copied ? "Gekopieerd" : "Alles kopiëren"}
              </button>
              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
              >
                <Download size={14} strokeWidth={1.5} aria-hidden />
                {/* COPY: confirm met Marlon */}
                CSV downloaden
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-text-muted">
                {/* COPY: confirm met Marlon */}
                De codes staan ook in het overzicht, met dit label.
              </p>
              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex items-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Klaar
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
