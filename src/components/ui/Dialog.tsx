"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Shared native-`<dialog>` chrome. Centralises the dark ink border box,
 * champagne backdrop, escape-to-close behaviour, and open/close lifecycle
 * so each dialog consumer only owns its body + footer buttons.
 *
 * Call sites open it by toggling `open` from the parent — the component
 * calls `showModal()` / `close()` internally. Closing via Esc, backdrop
 * click, or an in-body close-button all route through `onClose`.
 */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  tone?: "neutral" | "danger";
  /** Container width. `wide` ≈ 560px (default), `narrow` ≈ 480px. */
  size?: "narrow" | "wide";
  children: React.ReactNode;
  /** If true, show the X close-button in the top-right. Default true. */
  closable?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  tone = "neutral",
  size = "wide",
  closable = true,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const widthClass =
    size === "narrow" ? "w-[min(92vw,480px)]" : "w-[min(92vw,560px)]";

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`bg-bg border border-[color:var(--ink-500)] text-text p-8 ${widthClass} backdrop:bg-bg/55 backdrop:backdrop-blur-sm`}
    >
      <div className="flex items-start justify-between mb-5">
        <div>
          {eyebrow && (
            <span className="tmc-eyebrow tmc-eyebrow--accent block mb-2">
              {eyebrow}
            </span>
          )}
          <h3
            className={`font-[family-name:var(--font-playfair)] text-2xl md:text-3xl tracking-[-0.01em] ${
              tone === "danger" ? "text-[color:var(--danger)]" : "text-text"
            }`}
          >
            {title}
          </h3>
        </div>
        {closable && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluit dialoog"
            className="text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}

export interface DialogFooterProps {
  result?: { ok: boolean; message: string } | null;
  onClose: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  confirmTone?: "accent" | "danger";
}

export function DialogFooter({
  result,
  onClose,
  onConfirm,
  cancelLabel = "Annuleren",
  confirmLabel,
  confirmDisabled,
  confirmTone = "accent",
}: DialogFooterProps) {
  return (
    <>
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`text-sm p-4 border mb-5 ${
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
          onClick={onClose}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
        >
          {cancelLabel}
        </button>
        {onConfirm && confirmLabel && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${
              confirmTone === "danger"
                ? "border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
                : "bg-accent text-bg border-accent hover:bg-accent-hover hover:border-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </>
  );
}
