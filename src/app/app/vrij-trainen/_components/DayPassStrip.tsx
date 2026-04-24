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

/**
 * Strip met één tile per dag, boek/cancel-gedrag ingebouwd. Elke dag
 * heeft exact één state die de tile visual + gedrag bepaalt. Gebruikt
 * op de /app/vrij-trainen pagina voor day-pass bookings.
 *
 * Server-gate: de daadwerkelijke can-book check gebeurt in
 * createBooking() / cancelBooking(). Deze UI voorkomt alleen clicks
 * die zeker falen (cap bereikt, gepauzeerd, afgelopen) zodat we geen
 * server-round-trip hoeven voor iets dat we al weten.
 */

export type DayPassState =
  | "past" // einde verstreken
  | "booked" // user heeft geboekt, kan nog cancellen
  | "open" // boekbaar
  | "capped" // niet geboekt + week-cap op
  | "paused"; // membership gepauzeerd

export interface DayPassDay {
  isoDate: string;
  sessionId: string;
  startAt: string;
  state: DayPassState;
  bookingId: string | null;
}

interface DayPassStripProps {
  days: DayPassDay[];
}

const STATE_LABELS: Record<DayPassState, string> = {
  past: "Afgelopen",
  booked: "Geboekt",
  open: "Boek",
  capped: "Cap bereikt",
  paused: "Gepauzeerd",
};

function tileClasses(state: DayPassState): string {
  switch (state) {
    case "past":
    case "capped":
    case "paused":
      return "border-transparent bg-bg-elevated text-[color:var(--stone-600)] cursor-default";
    case "booked":
      return "border-[color:var(--success)] bg-bg-elevated text-text hover:border-[color:var(--danger)] cursor-pointer";
    case "open":
      return "border-text-muted/30 text-text hover:border-accent hover:text-accent cursor-pointer";
  }
}

export function DayPassStrip({ days }: DayPassStripProps) {
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
        setMessage({ tone: "success", text: "Staat. Tot dan." });
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
    <div>
      <div className="flex flex-wrap gap-3">
        {days.map((d) => {
          const parts = amsterdamParts(new Date(d.startAt));
          const dayLabel = DAY_SHORT_NL[parts.weekday];
          const dateLabel = `${parts.day} ${MONTH_SHORT_NL[parts.month - 1]}`;
          const isPending =
            pending &&
            (pendingId === d.sessionId || pendingId === d.bookingId);
          const clickable = d.state === "open" || d.state === "booked";

          return (
            <button
              key={d.isoDate}
              type="button"
              disabled={!clickable || isPending}
              aria-label={`${dayLabel} ${dateLabel} — ${STATE_LABELS[d.state]}`}
              onClick={() => {
                if (d.state === "booked" && d.bookingId) cancel(d.bookingId);
                else if (d.state === "open") book(d.sessionId);
              }}
              className={`min-w-[96px] flex flex-col items-start gap-1 px-4 py-3 border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${tileClasses(
                d.state,
              )} ${isPending ? "opacity-50 pointer-events-none" : ""}`}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                {dayLabel} · {dateLabel}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.18em]">
                {isPending ? "Bezig" : STATE_LABELS[d.state]}
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
    </div>
  );
}
