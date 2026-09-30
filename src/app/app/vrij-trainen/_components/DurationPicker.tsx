"use client";

import { durationLabel, SLOT_DURATIONS } from "@/lib/member/vrij-trainen-slots";

export function DurationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (minutes: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      // COPY: confirm met Marlon
      aria-label="Hoe lang wil je trainen?"
      className="grid grid-cols-5 gap-1.5"
    >
      {SLOT_DURATIONS.map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={`rounded px-1 py-2 text-[13px] whitespace-nowrap border transition-colors duration-300 cursor-pointer ${
              active
                ? "border-accent bg-accent text-bg"
                : "border-[color:var(--ink-500)]/60 text-text hover:border-text-muted"
            }`}
          >
            {durationLabel(m)}
          </button>
        );
      })}
    </div>
  );
}
