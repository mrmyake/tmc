"use client";

// COPY: confirm met Marlon
const COPY = {
  done: (x: number, y: number) => `${x} van ${y} sets gedaan`,
  edited: (n: number) => `${n} aangepast`,
};

interface Props {
  done: number;
  total: number;
  edited: number;
}

/** Voortgang van de sessie: afgevinkte sets en hoeveel daarvan afwijken van vorige keer. */
export function WorkoutProgressBar({ done, total, edited }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-xs text-text-muted">
        <span className="text-text tabular-nums">{COPY.done(done, total)}</span>
        {edited > 0 && <span className="text-accent tabular-nums">{COPY.edited(edited)}</span>}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1 w-full rounded-[4px] bg-[color:var(--ink-500)] overflow-hidden"
      >
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
