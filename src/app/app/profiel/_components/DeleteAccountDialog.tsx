"use client";

import { forwardRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Field, fieldInputClasses } from "@/components/ui/Field";
import { requestAccountDeletion } from "@/lib/actions/profile";

interface DeleteAccountDialogProps {
  onDone?: () => void;
}

export const DeleteAccountDialog = forwardRef<
  HTMLDialogElement,
  DeleteAccountDialogProps
>(function DeleteAccountDialog({ onDone }, ref) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    const reason = String(formData.get("reason") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (confirm.trim().toLowerCase() !== "verwijder") {
      setError("Typ 'verwijder' in het bevestigingsveld.");
      return;
    }
    startTransition(async () => {
      const res = await requestAccountDeletion(reason);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSuccess(
          "Je verzoek staat. Marlon bevestigt binnen 30 dagen en verwijdert dan je account.",
        );
        window.setTimeout(() => onDone?.(), 2400);
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
      aria-labelledby="delete-dialog-title"
      className="bg-transparent p-0 w-full max-w-md backdrop:bg-bg/60 backdrop:backdrop-blur-sm"
    >
      <div className="bg-bg border border-[color:var(--ink-500)] p-8 md:p-10 text-text">
        <div className="flex items-start justify-between mb-6">
          <span className="tmc-eyebrow">Account verwijderen</span>
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
          id="delete-dialog-title"
          className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-6"
        >
          Weet je het zeker?
        </h2>
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          Na je bevestiging hebben we maximaal 30 dagen om je account definitief
          te verwijderen. Je abonnement wordt apart afgehandeld via het
          opzeg-proces.
        </p>
        <p className="text-text-muted text-sm leading-relaxed mb-8">
          Typ{" "}
          <strong className="text-text font-medium">verwijder</strong> in het
          veld hieronder om te bevestigen.
        </p>

        <form action={handleSubmit} className="space-y-5">
          <Field label="Reden" hint="Optioneel">
            <textarea
              name="reason"
              rows={3}
              placeholder="Waarom wil je je account verwijderen? Helpt ons om beter te worden."
              className={`${fieldInputClasses} resize-none`}
            />
          </Field>
          <Field label="Bevestig met 'verwijder'">
            <input
              type="text"
              name="confirm"
              required
              autoComplete="off"
              className={fieldInputClasses}
            />
          </Field>

          {error && (
            <p role="alert" className="text-[color:var(--danger)] text-sm">
              {error}
            </p>
          )}
          {success && (
            <p
              role="status"
              className="text-[color:var(--success)] text-sm"
            >
              {success}
            </p>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending || !!success}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-[color:var(--danger)] hover:text-[color:var(--danger)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {pending ? "Bezig" : "Verzoek indienen"}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-xs text-text-muted hover:text-text transition-colors duration-300 py-2 cursor-pointer"
            >
              Nee, toch niet
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
});
