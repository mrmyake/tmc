"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { revealMyAccessPin } from "@/lib/actions/access";
import type { AccessSummary } from "@/lib/access/summary";

/** Hoe lang de code zichtbaar blijft na een tik. */
const REVEAL_SECONDS = 30;

// COPY: confirm met Marlon
const GROUP_LABELS: Record<string, string> = {
  standard: "tijdens de openingstijden",
  extended: "van 06:00 tot 23:00",
  staff: "24 uur per dag",
};

interface Props {
  summary: AccessSummary;
}

/**
 * Deurcode op het profiel (spec-akiles-access.md: "de PIN wordt in de
 * ledenapp getoond achter een expliciete tik en verbergt zichzelf"). De
 * code komt pas na de tik via een server action bij Akiles vandaan, staat
 * nooit in de server-render of in een prop, en verdwijnt na REVEAL_SECONDS
 * of bij "Verberg". Geen kopieerknop, geen opslag in de browser.
 */
export function AccessPinCard({ summary }: Props) {
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | null>(null);

  function hide() {
    setPin(null);
    setSecondsLeft(0);
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => hide, []);

  function reveal() {
    setError(null);
    startTransition(async () => {
      const res = await revealMyAccessPin();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPin(res.pin);
      setSecondsLeft(REVEAL_SECONDS);
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            hide();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    });
  }

  if (summary.state === "none") {
    return (
      <p className="text-text-muted text-sm leading-relaxed max-w-md">
        {/* COPY: confirm met Marlon */}
        Zodra je abonnement actief is, maken we automatisch een persoonlijke
        deurcode voor je aan. Die verschijnt hier.
      </p>
    );
  }

  if (summary.state === "expired") {
    return (
      <p className="text-text-muted text-sm leading-relaxed max-w-md">
        {/* COPY: confirm met Marlon */}
        Je deurtoegang is op dit moment niet actief. Zodra je abonnement
        weer loopt, werkt je code automatisch weer.
      </p>
    );
  }

  const windowLabel = summary.group ? GROUP_LABELS[summary.group] : null;

  return (
    <div>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-md">
        Toets je persoonlijke code in op het paneel bij de deur
        {windowLabel ? `, ${windowLabel}` : ""}. De code is van jou alleen;
        deel hem niet.
      </p>

      {pin ? (
        <div className="relative bg-bg-elevated p-6 md:p-8 mb-4">
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Jouw deurcode
          </span>
          <p
            aria-live="polite"
            className="font-[family-name:var(--font-playfair)] text-5xl md:text-6xl text-text tracking-[0.3em] leading-none mb-4"
          >
            {pin}
          </p>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={hide}
              className="text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Verberg
            </button>
            <span className="text-text-muted text-xs">
              {/* COPY: confirm met Marlon */}
              Verdwijnt over {secondsLeft}s
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={reveal}
          disabled={pending}
          className={`inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer hover:bg-accent-hover hover:border-accent-hover ${
            pending ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Ophalen..." : "Toon mijn deurcode"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-[color:var(--danger)] text-sm mt-3 max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}
