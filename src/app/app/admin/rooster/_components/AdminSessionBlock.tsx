"use client";

import { type AdminSessionBlockData } from "./types";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

const PILLAR_TONE: Record<string, string> = {
  vrij_trainen: "border-l-[color:var(--stone-500)]",
  yoga_mobility: "border-l-accent",
  kettlebell: "border-l-[color:var(--warning)]",
  kids: "border-l-[color:var(--success)]",
  senior: "border-l-[color:var(--stone-600)]",
};

interface AdminSessionBlockProps {
  session: AdminSessionBlockData;
  onSelect: (id: string) => void;
}

export function AdminSessionBlock({ session, onSelect }: AdminSessionBlockProps) {
  const isCancelled = session.status === "cancelled";
  const full = session.bookedCount >= session.capacity;
  const tone = PILLAR_TONE[session.pillar] ?? "border-l-text-muted";

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      style={{
        top: `${session.startOffsetMin}px`,
        height: `${Math.max(30, session.durationMin) - 2}px`,
      }}
      className={`absolute left-1 right-1 flex flex-col items-start gap-0.5 px-3 py-2 border border-[color:var(--ink-500)] border-l-4 ${tone} bg-bg-elevated text-left transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:bg-bg-elevated/80 cursor-pointer overflow-hidden ${
        isCancelled ? "opacity-50 line-through decoration-text-muted/60" : ""
      }`}
      aria-label={`${session.className} om ${session.startLabel}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
        {session.startLabel}
      </span>
      <span className="text-xs font-medium text-text leading-tight line-clamp-2">
        {session.className}
      </span>
      <span className="text-[10px] text-text-muted leading-tight">
        {session.trainerName}
      </span>
      <span
        className={`text-[10px] mt-auto ${
          full ? "text-[color:var(--warning)]" : "text-text-muted"
        }`}
      >
        {session.bookedCount}/{session.capacity} ·{" "}
        {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
      </span>
    </button>
  );
}
