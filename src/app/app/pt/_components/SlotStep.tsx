"use client";

import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatTime,
} from "@/lib/format-date";

export interface SlotOption {
  id: string;
  startAt: string;
  endAt: string;
}

interface SlotStepProps {
  slots: SlotOption[];
  selectedId: string | null;
  onSelect: (slotId: string) => void;
}

function dayKey(iso: string): string {
  const p = amsterdamParts(new Date(iso));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function dayLabel(iso: string): string {
  const p = amsterdamParts(new Date(iso));
  return `${DAY_SHORT_NL[p.weekday]} ${p.day} ${MONTH_SHORT_NL[p.month - 1]}`;
}

export function SlotStep({ slots, selectedId, onSelect }: SlotStepProps) {
  if (slots.length === 0) {
    return (
      <section aria-labelledby="slot-step-title">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Stap 03 · Moment
        </span>
        <h2
          id="slot-step-title"
          className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
        >
          Geen beschikbare slots.
        </h2>
        <p className="text-text-muted text-base leading-relaxed max-w-md">
          Deze trainer heeft momenteel geen open slots. Neem contact op met
          Marlon voor een maatwerk-afspraak, of kies een andere trainer.
        </p>
      </section>
    );
  }

  const grouped = new Map<string, { label: string; slots: SlotOption[] }>();
  for (const s of slots) {
    const key = dayKey(s.startAt);
    if (!grouped.has(key)) {
      grouped.set(key, { label: dayLabel(s.startAt), slots: [] });
    }
    grouped.get(key)!.slots.push(s);
  }

  return (
    <section aria-labelledby="slot-step-title">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Stap 03 · Moment
      </span>
      <h2
        id="slot-step-title"
        className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
      >
        Wanneer past je?
      </h2>
      <p className="text-text-muted text-base leading-relaxed max-w-xl mb-10">
        Beschikbare slots voor de komende twee weken.
      </p>

      <div className="flex flex-col gap-10">
        {Array.from(grouped.entries()).map(([key, day]) => (
          <section key={key}>
            <div className="flex items-baseline gap-4 mb-4">
              <span className="tmc-eyebrow">{day.label}</span>
              <span
                aria-hidden
                className="flex-1 h-px bg-[color:var(--ink-500)]/50"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              {day.slots.map((slot) => {
                const isSelected = selectedId === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => onSelect(slot.id)}
                    aria-pressed={isSelected}
                    className={`px-5 py-3 text-sm font-medium tracking-tight border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/10 text-text"
                        : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    {formatTime(new Date(slot.startAt))}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
