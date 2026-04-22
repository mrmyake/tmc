"use client";

import { useState, useTransition } from "react";
import { updateMarketingOptIn } from "@/lib/actions/profile";

interface MarketingOptInToggleProps {
  initialOptIn: boolean;
}

export function MarketingOptInToggle({
  initialOptIn,
}: MarketingOptInToggleProps) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    const next = !optIn;
    setOptIn(next);
    setError(null);
    startTransition(async () => {
      const res = await updateMarketingOptIn(next);
      if (!res.ok) {
        setOptIn(!next);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        <span className="tmc-eyebrow block mb-2">Marketing</span>
        <p className="text-text text-base tracking-[-0.01em] mb-1">
          Nieuws en uitnodigingen
        </p>
        <p className="text-text-muted text-sm leading-relaxed max-w-md">
          Af en toe een mailtje met clubnieuws, retreats en open dagen. Geen
          spam; je kunt &rsquo;m altijd uitzetten.
        </p>
        {error && (
          <p
            role="alert"
            className="text-[color:var(--danger)] text-xs mt-2"
          >
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={optIn}
        aria-label={optIn ? "Marketing uitschakelen" : "Marketing inschakelen"}
        disabled={pending}
        onClick={handleToggle}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer disabled:opacity-60 ${
          optIn
            ? "bg-accent border-accent"
            : "bg-transparent border-text-muted/40 hover:border-text-muted"
        }`}
      >
        <span
          aria-hidden
          className={`pointer-events-none block h-5 w-5 transform transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
            optIn
              ? "translate-x-6 bg-bg"
              : "translate-x-0.5 bg-text-muted"
          }`}
        />
      </button>
    </div>
  );
}
