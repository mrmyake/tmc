"use client";

import { forwardRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { requestMembershipCancellation } from "@/lib/member/membership-actions";
import { formatDateLong } from "@/lib/format-date";
import { trackMembershipCancelComplete } from "@/lib/analytics";

interface CancellationDialogProps {
  membershipId: string;
  commitEndDate: string;
  currentPlan: string;
  onDone?: () => void;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return formatDateLong(new Date(d));
  } catch {
    return d;
  }
}

function expectedEffectiveDate(commitEndDate: string): string {
  const notice = new Date();
  notice.setDate(notice.getDate() + 28);
  const commit = new Date(commitEndDate);
  return (notice > commit ? notice : commit).toISOString().slice(0, 10);
}

export const CancellationDialog = forwardRef<
  HTMLDialogElement,
  CancellationDialogProps
>(function CancellationDialog(
  { membershipId, commitEndDate, currentPlan, onDone },
  ref,
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const estEffective = expectedEffectiveDate(commitEndDate);

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await requestMembershipCancellation({ membershipId });
      if (!res.ok) {
        setError(res.message);
      } else {
        setSuccess(res.message);
        const effectiveDate = estEffective;
        const daysUntil = Math.max(
          0,
          Math.round(
            (new Date(effectiveDate).getTime() - Date.now()) / 86_400_000,
          ),
        );
        trackMembershipCancelComplete({
          currentPlan,
          effectiveDate,
          daysUntilEffective: daysUntil,
        });
        window.setTimeout(() => {
          onDone?.();
        }, 1600);
      }
    });
  }

  function close() {
    const dialog = typeof ref === "function" ? null : (ref?.current ?? null);
    dialog?.close();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="cancel-dialog-title"
      className="bg-transparent p-0 w-full max-w-md backdrop:bg-bg/60 backdrop:backdrop-blur-sm"
    >
      <div className="bg-bg border border-[color:var(--ink-500)] p-8 md:p-10 text-text">
        <div className="flex items-start justify-between mb-6">
          <span className="tmc-eyebrow">Opzeggen</span>
          <button
            type="button"
            onClick={close}
            aria-label="Sluit"
            className="text-text-muted hover:text-text transition-colors"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <h2
          id="cancel-dialog-title"
          className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-6"
        >
          Abbo opzeggen.
        </h2>
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          Je commitment loopt tot <strong className="text-text">{formatDate(commitEndDate)}</strong>.
          Daarna geldt een opzegtermijn van vier weken.
        </p>
        <p className="text-text-muted text-sm leading-relaxed mb-8">
          Je abbo blijft actief tot{" "}
          <strong className="text-text">{formatDate(estEffective)}</strong>. Tot
          die datum kun je gewoon doorboeken. Daarna stopt de incasso
          automatisch.
          {/* COPY: confirm with Marlon — 4 weken opzegtermijn per spec, check of dit klopt met AV. */}
        </p>

        {error && (
          <p role="alert" className="text-[color:var(--danger)] text-sm mb-4">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-[color:var(--success)] text-sm mb-4">
            {success}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !!success}
            className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-[color:var(--danger)] hover:text-[color:var(--danger)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {pending ? "Bezig" : "Bevestig opzegging"}
          </button>
          <button
            type="button"
            onClick={close}
            className="text-xs text-text-muted hover:text-text transition-colors duration-300 py-2 cursor-pointer"
          >
            Nee, toch niet
          </button>
        </div>
      </div>
    </dialog>
  );
});
