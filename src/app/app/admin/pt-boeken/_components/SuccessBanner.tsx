"use client";

import { useState } from "react";

interface SuccessBannerProps {
  title: string;
  detail: string;
  payUrl: string | null;
  warning: string | null;
  onReset: () => void;
}

/**
 * PT-agenda C2: gedeelde bevestiging na een geslaagde boeking, programma
 * of intake. De klant-bevestigingsmail en een eventuele Mollie-link
 * regelt de backend (bookPtForMember/planPtProgram) al; dit toont alleen
 * de betaallink zelf als de RPC er een teruggeeft, geen dubbele mail-copy.
 */
export function SuccessBanner({
  title,
  detail,
  payUrl,
  warning,
  onReset,
}: SuccessBannerProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      role="status"
      className="p-6 border border-[color:var(--success)]/40 bg-bg-elevated"
    >
      <p className="text-[color:var(--success)] font-medium mb-1">{title}</p>
      <p className="text-text text-sm mb-4">{detail}</p>

      {payUrl && (
        <div className="mb-4">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow block mb-2">Betaallink</span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={payUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 bg-bg border border-[color:var(--ink-500)] px-3 py-2.5 text-xs text-text-muted"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(payUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-accent px-3 py-2.5 border border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {copied ? "Gekopieerd" : "Kopieer"}
            </button>
          </div>
        </div>
      )}

      {warning && (
        <p className="text-[color:var(--warning)] text-xs mb-4">{warning}</p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        Nog een boeking maken
      </button>
    </div>
  );
}
