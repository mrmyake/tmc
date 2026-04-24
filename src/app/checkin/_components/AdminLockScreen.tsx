"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { unlockAdminMode } from "@/lib/check-in/admin-lock";
import { Keypad } from "./Keypad";

interface Props {
  onUnlocked: () => void;
  onCancel: () => void;
}

export function AdminLockScreen({ onUnlocked, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function attempt() {
    setError(null);
    startTransition(async () => {
      const res = await unlockAdminMode(pin);
      if (res.ok) {
        onUnlocked();
      } else {
        setError(res.message);
        setPin("");
      }
    });
  }

  return (
    <div className="relative flex-1 flex items-center justify-center p-8 md:p-12">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Sluit"
        className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center text-text-muted hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
      >
        <X size={22} strokeWidth={1.5} />
      </button>

      <div className="w-full max-w-md flex flex-col items-center">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
          Admin modus
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text leading-[1.02] tracking-[-0.02em] mb-10 text-center">
          PIN invoeren.
        </h1>
        <div
          role="status"
          aria-live="polite"
          className="h-16 flex items-center justify-center mb-8 font-[family-name:var(--font-playfair)] text-4xl md:text-5xl tabular-nums tracking-[0.3em] text-text"
        >
          {pin ? "•".repeat(pin.length) : <span className="text-text-muted/30">—</span>}
        </div>
        <Keypad
          value={pin}
          onChange={setPin}
          disabled={pending}
          maxLength={6}
        />
        <button
          type="button"
          onClick={attempt}
          disabled={pending || pin.length < 4}
          className="mt-8 inline-flex items-center justify-center px-10 py-4 text-sm font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Bezig" : "Ontgrendel"}
        </button>
        {error && (
          <p
            role="alert"
            className="mt-5 text-sm text-[color:var(--danger)]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
