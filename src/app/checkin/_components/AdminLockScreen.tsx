"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { unlockAdminMode } from "@/lib/check-in/admin-lock";
import { Keypad } from "./Keypad";
import { CHECKIN_PIN_LENGTH } from "@/lib/check-in/constants";

interface Props {
  onUnlocked: () => void;
  onCancel: () => void;
}

export function AdminLockScreen({ onUnlocked, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keypadWrapperRef = useRef<HTMLDivElement>(null);

  // Defensief filter op de state-setter zelf, niet alleen op Keypad: wat er
  // ook aan invoer binnenkomt (plakken, fysiek toetsenbord, een toekomstige
  // invoerbron), alleen cijfers komen door en nooit meer dan de PIN-lengte.
  function handlePinChange(next: string) {
    setError(null);
    setPin(next.replace(/[^0-9]/g, "").slice(0, CHECKIN_PIN_LENGTH));
  }

  function clear() {
    setPin("");
    setError(null);
  }

  // Auto-submit zodra de PIN de volledige lengte heeft. `pending` blokkeert
  // een dubbele poging op dezelfde volledige invoer; na een foute PIN wordt
  // het veld leeg gemaakt, dus deze effect-conditie is dan vanzelf weer
  // false totdat er opnieuw volledig is ingetikt.
  useEffect(() => {
    if (pin.length !== CHECKIN_PIN_LENGTH || pending) return;
    startTransition(async () => {
      const res = await unlockAdminMode(pin);
      if (res.ok) {
        onUnlocked();
        return;
      }
      setError(res.message);
      setPin("");
      keypadWrapperRef.current?.querySelector("button")?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <div className="relative flex-1 flex items-center justify-center p-8 md:p-12">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        aria-label="Sluit"
        className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center text-text-muted hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] disabled:opacity-40 disabled:pointer-events-none"
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
        <div ref={keypadWrapperRef}>
          <Keypad
            value={pin}
            onChange={handlePinChange}
            disabled={pending}
            maxLength={CHECKIN_PIN_LENGTH}
          />
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={pending || pin.length === 0}
          className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors duration-300 px-4 py-3 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Wissen
        </button>
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-sm text-text-muted min-h-[1.5em]"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "PIN controleren..." : ""}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-3 text-sm text-[color:var(--danger)]"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
