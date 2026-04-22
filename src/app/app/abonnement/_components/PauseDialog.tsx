"use client";

import { forwardRef, useState, useTransition } from "react";
import { X, ChevronDown } from "lucide-react";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import {
  requestMembershipPause,
  type PauseReason,
} from "@/lib/member/membership-actions";

interface PauseDialogProps {
  membershipId: string;
  minStartDate: string;
  onDone?: () => void;
}

export const PauseDialog = forwardRef<HTMLDialogElement, PauseDialogProps>(
  function PauseDialog({ membershipId, minStartDate, onDone }, ref) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    function handleSubmit(formData: FormData) {
      setError(null);
      setSuccess(null);
      const startDate = String(formData.get("start_date") ?? "");
      const endDate = String(formData.get("end_date") ?? "");
      const reason = String(formData.get("reason") ?? "") as PauseReason;
      const notes = String(formData.get("notes") ?? "");

      startTransition(async () => {
        const res = await requestMembershipPause({
          membershipId,
          startDate,
          endDate,
          reason,
          notes: notes || undefined,
        });
        if (!res.ok) {
          setError(res.message);
        } else {
          setSuccess(res.message);
          window.setTimeout(() => {
            onDone?.();
          }, 1600);
        }
      });
    }

    function close() {
      const dialog =
        typeof ref === "function" ? null : (ref?.current ?? null);
      dialog?.close();
    }

    return (
      <dialog
        ref={ref}
        aria-labelledby="pause-dialog-title"
        className="bg-transparent p-0 w-full max-w-md backdrop:bg-bg/60 backdrop:backdrop-blur-sm"
      >
        <div className="bg-bg border border-[color:var(--ink-500)] p-8 md:p-10 text-text">
          <div className="flex items-start justify-between mb-6">
            <span className="tmc-eyebrow tmc-eyebrow--accent">
              Pauze aanvragen
            </span>
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
            id="pause-dialog-title"
            className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-6"
          >
            Tijdelijk op pauze.
          </h2>
          <p className="text-text-muted text-sm leading-relaxed mb-8">
            Pauze kan bij zwangerschap of medisch attest, tot drie maanden per
            commit-jaar. We beoordelen je verzoek binnen een werkdag.
          </p>

          <form action={handleSubmit} className="space-y-6">
            <Field label="Startdatum">
              <input
                type="date"
                name="start_date"
                required
                min={minStartDate}
                className={fieldInputClasses}
              />
            </Field>
            <Field label="Einddatum">
              <input
                type="date"
                name="end_date"
                required
                min={minStartDate}
                className={fieldInputClasses}
              />
            </Field>
            <Field label="Reden">
              <div className="relative">
                <select
                  name="reason"
                  required
                  defaultValue=""
                  className={`${fieldInputClasses} appearance-none pr-8`}
                >
                  <option value="" disabled>
                    Kies een reden
                  </option>
                  <option value="pregnancy">Zwangerschap</option>
                  <option value="medical">Medisch attest</option>
                  <option value="other_approved">Anders</option>
                </select>
                <ChevronDown
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </Field>
            <Field label="Toelichting" hint="Optioneel">
              <textarea
                name="notes"
                rows={3}
                placeholder="Context voor Marlon — bijvoorbeeld een link naar een attest of een korte toelichting."
                className={`${fieldInputClasses} resize-none`}
              />
            </Field>

            {error && (
              <p role="alert" className="text-[color:var(--danger)] text-sm">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="text-[color:var(--success)] text-sm">
                {success}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={pending || !!success}
                className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {pending ? "Bezig" : "Verzoek indienen"}
              </button>
              <button
                type="button"
                onClick={close}
                className="text-xs text-text-muted hover:text-text transition-colors duration-300 py-2 cursor-pointer"
              >
                Annuleren
              </button>
            </div>
          </form>
        </div>
      </dialog>
    );
  },
);
