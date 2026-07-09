"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  /** ISO deadline, e.g. from getCampaignDeadline() in src/lib/campaign.ts. */
  deadline: string;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeTimeLeft(deadline: string): TimeLeft {
  const diffMs = Math.max(0, new Date(deadline).getTime() - Date.now());
  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

const UNITS: { key: keyof TimeLeft; label: string }[] = [
  { key: "days", label: "dagen" },
  { key: "hours", label: "uur" },
  { key: "minutes", label: "min" },
  { key: "seconds", label: "sec" },
];

/**
 * Client-side ticking countdown to the Early Member deadline. Purely a
 * visual scarcity signal — the real gate is server-side and deadline-only
 * (tmc._compute_order_price checks now() against get_campaign_deadline()
 * inside the create_order transaction). Nothing here blocks
 * checkout if the tab has been open past the deadline; a stale countdown
 * showing 00:00:00:00 is cosmetic only.
 */
export function Countdown({ deadline, className = "" }: CountdownProps) {
  // null until mounted client-side, so the server-rendered markup and the
  // first client render match (both show 00 everywhere) and there's no
  // hydration mismatch from a live clock. Same setState-in-effect pattern
  // already used throughout this codebase for mount-gated client state.
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTimeLeft(computeTimeLeft(deadline));
    const interval = setInterval(() => {
      setTimeLeft(computeTimeLeft(deadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const display = timeLeft ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div
      role="timer"
      aria-label="Tijd tot einde Early Member"
      className={`flex items-start justify-center gap-3 sm:gap-6 border-t border-b border-bg-subtle py-8 md:py-10 ${className}`}
    >
      {UNITS.map((unit, i) => (
        <div key={unit.key} className="flex items-start gap-3 sm:gap-6">
          <div className="flex flex-col items-center w-14 sm:w-20">
            <span className="font-[family-name:var(--font-playfair)] tabular-nums text-4xl sm:text-5xl md:text-6xl text-text leading-none">
              {pad2(display[unit.key])}
            </span>
            <span className="text-text-muted text-[10px] sm:text-[11px] uppercase tracking-[0.18em] mt-2">
              {unit.label}
            </span>
          </div>
          {i < UNITS.length - 1 && (
            <span
              aria-hidden
              className="font-[family-name:var(--font-playfair)] text-3xl sm:text-4xl text-text-muted/40 mt-0.5 sm:mt-1"
            >
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
