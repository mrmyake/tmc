"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import { formatEuro } from "@/lib/crowdfunding-helpers";

interface ProgressPanelProps {
  totalRaised: number;
  totalBackers: number;
  goal: number;
  daysLeft: number | null;
  compact?: boolean;
}

function AnimatedNumber({
  value,
  formatter,
}: {
  value: number;
  formatter: (n: number) => string;
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => formatter(Math.floor(latest)));

  useEffect(() => {
    const controls = animate(count, value, {
      duration: 1.4,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
}

export function ProgressPanel({
  totalRaised,
  totalBackers,
  goal,
  daysLeft,
  compact = false,
}: ProgressPanelProps) {
  const pct = Math.min(100, goal > 0 ? (totalRaised / goal) * 100 : 0);

  return (
    <div
      className={`w-full ${
        compact ? "" : "bg-bg-elevated/70 backdrop-blur-sm border border-accent/20 p-6 md:p-8"
      }`}
    >
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-1">
            Opgehaald
          </div>
          <div className="font-[family-name:var(--font-playfair)] text-3xl md:text-5xl text-text leading-none">
            <AnimatedNumber value={totalRaised} formatter={formatEuro} />
          </div>
          <div className="text-xs text-text-muted mt-2">
            van {formatEuro(goal)} doel
          </div>
        </div>
        <div className="text-right">
          <div className="font-[family-name:var(--font-playfair)] text-3xl md:text-5xl text-accent leading-none">
            <AnimatedNumber
              value={Math.round(pct)}
              formatter={(n) => `${n}%`}
            />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-bg-subtle overflow-hidden mb-5">
        <motion.div
          className="absolute inset-y-0 left-0 bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </div>

      <div className="flex items-center justify-between gap-4 text-sm">
        <div>
          <span className="text-text font-medium">
            <AnimatedNumber value={totalBackers} formatter={(n) => String(n)} />
          </span>
          <span className="text-text-muted ml-2">
            {totalBackers === 1 ? "backer" : "backers"}
          </span>
        </div>
        {daysLeft !== null && (
          <div>
            <span className="text-text font-medium">{daysLeft}</span>
            <span className="text-text-muted ml-2">
              {daysLeft === 1 ? "dag te gaan" : "dagen te gaan"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
