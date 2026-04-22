export interface PtStep {
  id: string;
  label: string;
}

interface PtStepperProps {
  steps: PtStep[];
  currentIndex: number;
}

export function PtStepper({ steps, currentIndex }: PtStepperProps) {
  return (
    <nav aria-label="Voortgang" className="flex items-center gap-3 mb-14">
      {steps.map((s, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        return (
          <div key={s.id} className="flex-1 flex flex-col gap-2">
            <span
              aria-hidden
              className={`h-px w-full ${
                done || active ? "bg-accent" : "bg-[color:var(--ink-500)]/60"
              }`}
            />
            <span
              className={`text-[10px] font-medium uppercase tracking-[0.18em] ${
                active
                  ? "text-accent"
                  : done
                    ? "text-text-muted"
                    : "text-text-muted/60"
              }`}
            >
              {String(i + 1).padStart(2, "0")} · {s.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
