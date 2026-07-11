import type { WizardStep } from "./BetaalverzoekWizard";

// COPY: confirm met Marlon
const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "klant", label: "Klant" },
  { id: "product", label: "Product" },
  { id: "voorwaarden", label: "Voorwaarden" },
  { id: "versturen", label: "Versturen" },
];

export function Stepper({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current);

  return (
    <div
      role="list"
      aria-label="Stappen"
      className="flex flex-wrap items-center gap-2 mb-8"
    >
      {STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              role="listitem"
              aria-current={isActive ? "step" : undefined}
              className={`flex items-center gap-2 text-xs ${
                isActive
                  ? "text-text font-medium"
                  : isDone
                    ? "text-accent"
                    : "text-text-muted"
              }`}
            >
              <span
                aria-hidden
                className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-medium ${
                  isActive
                    ? "border-accent bg-accent text-bg"
                    : isDone
                      ? "border-accent text-accent"
                      : "border-[color:var(--ink-500)] text-text-muted"
                }`}
              >
                {i + 1}
              </span>
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="w-5 h-px bg-[color:var(--ink-500)]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
