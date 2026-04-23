"use client";

import { ChevronRight } from "lucide-react";
import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";
import { durationMinutes, formatTime } from "@/lib/format-date";

export interface SessionRowData {
  id: string;
  startAt: Date;
  endAt: Date;
  className: string;
  trainerName: string;
  pillar: string;
  capacity: number;
  bookedCount: number;
  status: SessionStatus;
  bookingId: string | null;
}

interface SessionRowProps {
  session: SessionRowData;
  onOpen: (session: SessionRowData) => void;
}

export function SessionRow({ session, onOpen }: SessionRowProps) {
  const disabled =
    session.status === "past" ||
    session.status === "cancelled" ||
    session.status === "ongoing";
  const muted = disabled;

  return (
    <button
      type="button"
      onClick={() => !disabled && onOpen(session)}
      disabled={disabled}
      className={`w-full grid grid-cols-[72px_1fr_auto_auto] items-center gap-6 py-6 text-left border-t border-[color:var(--ink-500)]/60 transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
        disabled
          ? "cursor-default text-[color:var(--stone-600)]"
          : "cursor-pointer hover:bg-bg-elevated/60 text-text"
      }`}
    >
      <span
        className={`font-[family-name:var(--font-playfair)] text-lg leading-none ${
          muted ? "text-[color:var(--stone-600)]" : "text-text-muted"
        }`}
      >
        {formatTime(session.startAt)}
      </span>
      <span className="flex flex-col gap-1">
        <span
          className={`font-[family-name:var(--font-playfair)] text-2xl md:text-3xl leading-[1.05] tracking-[-0.01em] ${
            muted ? "text-[color:var(--stone-600)]" : "text-text"
          }`}
        >
          {session.className}
        </span>
        <span
          className={`text-xs ${
            muted ? "text-[color:var(--stone-600)]" : "text-text-muted"
          }`}
        >
          met {session.trainerName} ·{" "}
          {durationMinutes(session.startAt, session.endAt)} min
        </span>
      </span>
      <StatusBadge
        status={session.status}
        spotsAvailable={Math.max(0, session.capacity - session.bookedCount)}
      />
      <ChevronRight
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className={
          disabled ? "text-transparent" : "text-text-muted/70"
        }
      />
    </button>
  );
}
