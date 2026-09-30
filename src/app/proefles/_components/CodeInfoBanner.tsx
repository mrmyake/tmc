"use client";

import { SCOPE_LABEL, scopeValidityText, type TrialCodeScope } from "@/lib/trial-codes/scope";

/**
 * "Je code is geldig voor ..." plus de ingevoerde code met zijn scope, voor
 * beide stappen van de codeflow (sessielijst en vrij-trainen-slotkiezer).
 * Alleen weergave; de scope komt uit een server-side opzoeking.
 */
export function CodeInfoBanner({
  code,
  scope,
  onChangeCode,
}: {
  code: string;
  scope: TrialCodeScope;
  onChangeCode: () => void;
}) {
  return (
    <>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-lg leading-relaxed mb-6 max-w-xl">
        {scopeValidityText(scope)}
      </p>
      <div className="flex items-center gap-4 bg-bg-elevated px-5 py-4 mb-8">
        <span
          aria-hidden
          className="w-8 h-8 shrink-0 rounded-full bg-accent text-bg grid place-items-center text-sm"
        >
          ✓
        </span>
        <div className="min-w-0">
          <div className="font-mono tracking-[0.08em] text-text break-all">{code}</div>
          {/* COPY: confirm met Marlon */}
          <div className="text-sm text-text-muted">
            {scope === "vrij_trainen"
              ? `${SCOPE_LABEL[scope]}, 1 uur, gratis`
              : `${SCOPE_LABEL[scope]}, gratis`}
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeCode}
          className="ml-auto shrink-0 text-sm text-text-muted underline underline-offset-4 hover:text-text transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Andere code
        </button>
      </div>
    </>
  );
}
