"use client";

import { Delete } from "lucide-react";

interface KeypadProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Maximaal aantal tekens. Default 10 (10-cijferige NL-phone). */
  maxLength?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function Keypad({
  value,
  onChange,
  disabled,
  maxLength = 10,
}: KeypadProps) {
  function press(key: string) {
    if (disabled) return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  }

  return (
    <div
      role="group"
      aria-label="Nummer invoeren"
      className="grid grid-cols-3 gap-3 md:gap-4 w-full max-w-md"
    >
      {KEYS.map((key, i) => {
        if (key === "") return <div key={i} aria-hidden />;
        const isDelete = key === "del";
        return (
          <button
            key={i}
            type="button"
            onClick={() => press(key)}
            disabled={disabled}
            aria-label={isDelete ? "Wissen" : `Cijfer ${key}`}
            className="aspect-square flex items-center justify-center bg-bg-elevated border border-[color:var(--ink-500)]/60 text-text font-[family-name:var(--font-playfair)] text-4xl md:text-5xl transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            {isDelete ? <Delete size={28} strokeWidth={1.5} /> : key}
          </button>
        );
      })}
    </div>
  );
}
