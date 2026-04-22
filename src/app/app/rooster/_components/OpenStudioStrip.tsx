"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
} from "@/lib/format-date";
import {
  createBooking,
  cancelBooking,
} from "@/lib/member/booking-actions";

export interface OpenStudioDay {
  isoDate: string;
  sessionId: string;
  startAt: string;
  state: "open" | "booked" | "past";
  bookingId: string | null;
}

interface OpenStudioStripProps {
  days: OpenStudioDay[];
}

export function OpenStudioStrip({ days }: OpenStudioStripProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  function book(sessionId: string) {
    setMessage(null);
    setPendingId(sessionId);
    startTransition(async () => {
      const res = await createBooking(sessionId);
      setPendingId(null);
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
      } else {
        setMessage({
          tone: "success",
          text:
            res.action === "waitlisted"
              ? res.message
              : "Staat. Tot dan.",
        });
        router.refresh();
      }
    });
  }

  function cancel(bookingId: string) {
    setMessage(null);
    setPendingId(bookingId);
    startTransition(async () => {
      const res = await cancelBooking(bookingId);
      setPendingId(null);
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
      } else {
        setMessage({ tone: "success", text: res.message });
        router.refresh();
      }
    });
  }

  return (
    <section
      aria-labelledby="open-studio-title"
      className="mb-16 pb-12 border-b border-[color:var(--ink-500)]/60"
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-8">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
            Vrij trainen
          </span>
          <h2
            id="open-studio-title"
            className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em]"
          >
            Open studio · kom wanneer je wil.
          </h2>
        </div>
        <p className="text-text-muted text-sm max-w-xs">
          Boek een dag, kom binnen tussen 06:00 en 22:00. Cancel kan tot vijf
          minuten voor sluiting.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {days.map((d) => {
          const parts = amsterdamParts(new Date(d.startAt));
          const dayLabel = DAY_SHORT_NL[parts.weekday];
          const dateLabel = `${parts.day} ${MONTH_SHORT_NL[parts.month - 1]}`;
          const isPending =
            pending && (pendingId === d.sessionId || pendingId === d.bookingId);
          const isPast = d.state === "past";
          const isBooked = d.state === "booked";

          return (
            <button
              key={d.isoDate}
              type="button"
              disabled={isPast || isPending}
              onClick={() =>
                isBooked && d.bookingId
                  ? cancel(d.bookingId)
                  : book(d.sessionId)
              }
              className={`min-w-[88px] flex flex-col items-start gap-1 px-4 py-3 border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                isPast
                  ? "border-transparent bg-bg-elevated text-[color:var(--stone-600)] cursor-default"
                  : isBooked
                    ? "border-[color:var(--success)] bg-bg-elevated text-text hover:border-[color:var(--danger)]"
                    : "border-text-muted/30 text-text hover:border-accent hover:text-accent"
              } ${isPending ? "opacity-50 pointer-events-none" : ""} ${
                !isPast && !isBooked ? "cursor-pointer" : ""
              } ${isBooked ? "cursor-pointer" : ""}`}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                {dayLabel} · {dateLabel}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em]">
                {isPast
                  ? "Afgelopen"
                  : isBooked
                    ? isPending
                      ? "Bezig"
                      : "Geboekt"
                    : isPending
                      ? "Bezig"
                      : "Boek"}
              </span>
            </button>
          );
        })}
      </div>

      {message && (
        <p
          role={message.tone === "success" ? "status" : "alert"}
          className={`mt-5 text-sm ${
            message.tone === "success"
              ? "text-[color:var(--success)]"
              : "text-[color:var(--danger)]"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
