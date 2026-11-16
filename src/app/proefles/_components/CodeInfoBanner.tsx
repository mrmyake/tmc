"use client";

import { SCOPE_LABEL, scopeValidityText, type TrialCodeScope } from "@/lib/trial-codes/scope";

/**
 * Wat de codeflow van de toegang toont. "code": de bezoeker voerde zelf een
 * code in (of kwam van de yoga-quiz) en ziet die terug. "actie": de bezoeker
 * kwam via een actiepagina (/actie/[slug]); de code staat dan nergens bij de
 * bezoeker en hier staat alleen de naam van het aanbod
 * (spec-proefles-funnel.md, B1). Een client-component krijgt in dat geval dus
 * nooit een code als prop.
 */
export type CodeDisplay =
  | { kind: "code"; code: string }
  | { kind: "actie"; offerName: string };

/** Stabiele React-key per toegang: nieuwe code of ander aanbod = verse lijst. */
export function codeDisplayKey(display: CodeDisplay): string {
  return display.kind === "code" ? display.code : `actie:${display.offerName}`;
}

/** Eyebrow boven de stappen van de codeflow. */
export function codeFlowEyebrow(display: CodeDisplay | null | undefined): string {
  // COPY: confirm met Marlon
  return display?.kind === "actie" ? "Gratis proefles" : "Gratis · Met proefcode";
}

/** "Je gratis proefles is geldig voor ..." in de actieflow, per scope. */
function actieValidityText(scope: TrialCodeScope): string {
  // COPY: confirm met Marlon
  switch (scope) {
    case "yoga_mobility":
      return "Je proefles is gratis. Kies hieronder je yoga- of mobilityles.";
    case "kettlebell":
      return "Je proefles is gratis. Kies hieronder je kettlebellles.";
    case "group":
      return "Je proefles is gratis. Kies hieronder je groepsles.";
    case "vrij_trainen":
      return "Je proefuur vrij trainen is gratis. Kies hieronder je moment.";
    case "all":
      return "Je proefles is gratis: een groepsles of een uur vrij trainen. Kies zelf.";
  }
}

/**
 * "Je code is geldig voor ..." plus de ingevoerde code met zijn scope, voor
 * beide stappen van de codeflow (sessielijst en vrij-trainen-slotkiezer). In
 * de actieflow dezelfde balk met de aanbodnaam in plaats van de code en
 * zonder "Andere code". Alleen weergave; de scope komt uit een server-side
 * opzoeking.
 */
export function CodeInfoBanner({
  display,
  scope,
  onChangeCode,
}: {
  display: CodeDisplay;
  scope: TrialCodeScope;
  onChangeCode: () => void;
}) {
  const isActie = display.kind === "actie";
  return (
    <>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-lg leading-relaxed mb-6 max-w-xl">
        {isActie ? actieValidityText(scope) : scopeValidityText(scope)}
      </p>
      <div className="flex items-center gap-4 bg-bg-elevated px-5 py-4 mb-8">
        <span
          aria-hidden
          className="w-8 h-8 shrink-0 rounded-full bg-accent text-bg grid place-items-center text-sm"
        >
          ✓
        </span>
        <div className="min-w-0">
          {display.kind === "code" ? (
            <div className="font-mono tracking-[0.08em] text-text break-all">{display.code}</div>
          ) : (
            <div className="text-text font-medium">{display.offerName}</div>
          )}
          {/* COPY: confirm met Marlon */}
          <div className="text-sm text-text-muted">
            {scope === "vrij_trainen"
              ? `${SCOPE_LABEL[scope]}, 1 uur, gratis`
              : scope === "all"
                ? "Groepsles of 1 uur vrij trainen, gratis"
                : `${SCOPE_LABEL[scope]}, gratis`}
          </div>
        </div>
        {!isActie && (
          <button
            type="button"
            onClick={onChangeCode}
            className="ml-auto shrink-0 text-sm text-text-muted underline underline-offset-4 hover:text-text transition-colors cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Andere code
          </button>
        )}
      </div>
    </>
  );
}
