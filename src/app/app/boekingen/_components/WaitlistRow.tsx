"use client";

import { useState, useTransition } from "react";
import {
  createBooking,
  leaveWaitlist,
  type BookingActionResult,
} from "@/lib/member/booking-actions";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { confirmDeadlineLabel } from "@/lib/member/waitlist";
import {
  amsterdamParts,
  DAY_SHORT_NL,
  MONTH_SHORT_NL,
  formatRelativeWhen,
  formatTimeRange,
} from "@/lib/format-date";

/**
 * Eigen open wachtlijstentry bij "Aankomend" op /app/boekingen
 * (spec-community-growth.md, sectie Wachtlijst). Twee staten: wachtend
 * (met plek onder de wachtenden) of open promotie (plek gereserveerd tot
 * de deadline, met bevestig- en opgeefknop). Bevestigen loopt via
 * createBooking; een weigering om een andere reden dan capaciteit toont de
 * gewone reden-melding en laat "Plek opgeven" staan.
 */
export interface WaitlistRowData {
  entryId: string;
  sessionId: string;
  startAt: string;
  endAt: string;
  className: string;
  trainerName: string;
  state: "waiting" | "promoted";
  /** Plek onder de wachtenden, 1 = eerste; alleen bij state waiting. */
  rank: number;
  /** Bevestigingsdeadline (ISO); alleen bij state promoted. */
  confirmationDeadline: string | null;
}

interface WaitlistRowProps {
  row: WaitlistRowData;
}

export function WaitlistRow({ row }: WaitlistRowProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  const start = new Date(row.startAt);
  const end = new Date(row.endAt);
  const promoted = row.state === "promoted";
  const deadlineLabel = row.confirmationDeadline
    ? confirmDeadlineLabel(new Date(row.confirmationDeadline))
    : null;

  function run(action: () => Promise<BookingActionResult>) {
    setMessage(null);
    startTransition(async () => {
      let res: BookingActionResult;
      try {
        res = await action();
      } catch {
        // Zelfde vangnet als UpcomingRow: een mislukte action-fetch (bv.
        // offline in de PWA) mag de lijst niet wegvagen.
        setMessage({
          tone: "error",
          text: "Geen verbinding. Controleer je internet en probeer het opnieuw.",
        });
        return;
      }
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
    });
  }

  return (
    <article
      className={`grid grid-cols-[72px_1fr_auto] items-start gap-6 py-8 border-b border-[color:var(--ink-500)]/60 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <div className="flex flex-col items-start gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
          {DAY_SHORT_NL[amsterdamParts(start).weekday]} ·{" "}
          {MONTH_SHORT_NL[amsterdamParts(start).month - 1]}
        </span>
        <span className="font-[family-name:var(--font-playfair)] text-5xl leading-none tracking-[-0.02em]">
          {amsterdamParts(start).day}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.01em]">
          {row.className}
        </h3>
        <p className="text-text-muted text-sm">Met {row.trainerName}</p>
        <p className="text-text-muted text-sm">{formatTimeRange(start, end)}</p>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          {formatRelativeWhen(start)}
        </p>
        <p className="text-text-muted text-sm">
          {promoted
            ? // COPY: confirm met Marlon
              `Er is een plek voor je vrijgekomen. Bevestig ${deadlineLabel ?? "op tijd"}, anders gaat de plek door naar de volgende.`
            : // COPY: confirm met Marlon
              `Je staat op de wachtlijst, plek ${row.rank}. Komt er een plek vrij, dan krijg je bericht om te bevestigen.`}
        </p>
        {message && (
          <p
            role={message.tone === "success" ? "status" : "alert"}
            className={`text-xs mt-2 ${
              message.tone === "success"
                ? "text-[color:var(--success)]"
                : "text-[color:var(--danger)]"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-4">
        <StatusBadge status={promoted ? "promoted" : "waitlisted"} />
        {promoted && (
          <button
            type="button"
            onClick={() => run(() => createBooking(row.sessionId))}
            disabled={pending}
            className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-colors duration-300 hover:bg-accent-hover hover:border-accent-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            {pending ? "Bezig" : "Bevestig plek"}
          </button>
        )}
        <button
          type="button"
          onClick={() => run(() => leaveWaitlist(row.entryId))}
          disabled={pending}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig" : promoted ? "Plek opgeven" : "Wachtlijst verlaten"}
        </button>
      </div>
    </article>
  );
}
