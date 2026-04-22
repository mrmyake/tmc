"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createBooking,
  cancelBooking,
  type BookingActionResult,
} from "@/lib/member/booking-actions";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import type { SessionRowData } from "./SessionRow";

interface BookingSheetProps {
  session: SessionRowData | null;
  trainerBio: string | null;
  cancellationWindowHours: number;
  onClose: () => void;
}

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

function hoursUntil(start: Date) {
  return (start.getTime() - Date.now()) / 3_600_000;
}

export function BookingSheet({
  session,
  trainerBio,
  cancellationWindowHours,
  onClose,
}: BookingSheetProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingActionResult | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const open = Boolean(session);

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
    } else {
      lastFocusedRef.current?.focus?.();
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function doBook() {
    if (!session) return;
    startTransition(async () => {
      const res = await createBooking(session.id);
      setResult(res);
      if (res.ok) {
        window.setTimeout(onClose, 1200);
      }
    });
  }

  function doCancel() {
    if (!session?.bookingId) return;
    startTransition(async () => {
      const res = await cancelBooking(session.bookingId!);
      setResult(res);
      if (res.ok) {
        window.setTimeout(onClose, 1200);
      }
    });
  }

  const isBooked = session?.status === "booked";
  const isWaitlisted = session?.status === "waitlisted";
  const isFull = session?.status === "full";
  const lateCancel =
    isBooked && session && hoursUntil(session.startAt) < cancellationWindowHours;

  return (
    <AnimatePresence>
      {open && session && (
        <>
          <motion.button
            type="button"
            aria-label="Sluit"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: clubEase }}
            className="fixed inset-0 z-40 bg-bg/55 backdrop-blur-sm cursor-default"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-sheet-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: clubEase }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[460px] bg-bg border-l border-[color:var(--ink-500)] flex flex-col text-text"
          >
            <div className="flex items-start justify-between p-10">
              <span className="tmc-eyebrow tmc-eyebrow--accent">
                {isBooked
                  ? "Jouw sessie"
                  : isWaitlisted
                    ? "Wachtlijst"
                    : "Sessie boeken"}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Sluit paneel"
                className="text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text"
              >
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-10 pb-10 flex-1 overflow-y-auto">
              <h2
                id="booking-sheet-title"
                className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl leading-[1.05] tracking-[-0.02em] mb-10"
              >
                {session.className}
              </h2>

              <dl className="flex flex-col gap-5 mb-10">
                <Detail label="Wanneer" value={formatWeekdayDate(session.startAt)} />
                <Detail
                  label="Tijd"
                  value={formatTimeRange(session.startAt, session.endAt)}
                />
                <Detail label="Coach" value={session.trainerName} />
                <Detail
                  label="Discipline"
                  value={PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
                />
                <Detail
                  label="Groep"
                  value={
                    isFull
                      ? `Vol · ${session.bookedCount} / ${session.capacity}`
                      : `${Math.max(0, session.capacity - session.bookedCount)} plekken nog vrij · max ${session.capacity}`
                  }
                />
              </dl>

              {trainerBio && (
                <div className="mb-10 pt-8 border-t border-[color:var(--ink-500)]/60">
                  <span className="tmc-eyebrow block mb-3">Over de coach</span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {trainerBio}
                  </p>
                </div>
              )}
            </div>

            <div className="p-10 pt-6 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-4">
              {result && (
                <div
                  role={result.ok ? "status" : "alert"}
                  className={`text-sm p-4 border ${
                    result.ok
                      ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
                      : "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
                  }`}
                >
                  {result.message}
                </div>
              )}

              {!isBooked && !isWaitlisted && !isFull && (
                <>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Annuleren kan tot {cancellationWindowHours} uur voor de
                    sessie. Daarna telt de sessie mee.
                  </p>
                  <button
                    type="button"
                    onClick={doBook}
                    disabled={pending}
                    className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {pending ? "Bezig" : "Boek sessie"}
                  </button>
                </>
              )}

              {isFull && (
                <>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Er is geen plek meer. Je kunt je op de wachtlijst zetten.
                    Bij een cancellation schuif je automatisch door.
                  </p>
                  <button
                    type="button"
                    onClick={doBook}
                    disabled={pending}
                    className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {pending ? "Bezig" : "Zet me op wachtlijst"}
                  </button>
                </>
              )}

              {(isBooked || isWaitlisted) && (
                <>
                  {lateCancel && (
                    <p className="text-xs text-[color:var(--danger)] leading-relaxed">
                      Je zit binnen het cancel-venster. Annuleren kan, maar de
                      sessie telt wel mee.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={doCancel}
                    disabled={pending || !session.bookingId}
                    className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {pending ? "Bezig" : "Annuleer sessie"}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-xs text-text-muted hover:text-text transition-colors duration-300 py-2 cursor-pointer"
              >
                Terug naar rooster
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-5 items-baseline pb-5 border-b border-[color:var(--ink-500)]/60">
      <dt className="tmc-eyebrow">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
