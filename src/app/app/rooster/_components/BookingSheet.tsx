"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createBooking,
  cancelBooking,
  type BookingActionResult,
} from "@/lib/member/booking-actions";
import {
  bookGuest,
  getGuestPassStatus,
  type GuestPassStatus,
} from "@/lib/member/guest-pass-actions";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import {
  formatShortDate,
  formatTimeRange,
  formatWeekdayDate,
} from "@/lib/format-date";
import {
  trackBookingStart,
  trackBookingComplete,
  trackBookingCancel,
  trackWaitlistJoin,
} from "@/lib/analytics";
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
  const [rentMat, setRentMat] = useState(false);
  const [rentTowel, setRentTowel] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestMsg, setGuestMsg] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [passStatus, setPassStatus] = useState<GuestPassStatus | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const open = Boolean(session);
  const isYogaMobility = session?.pillar === "yoga_mobility";

  useEffect(() => {
    if (open && session) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
      // Panel opent → booking_start event (user toont intent).
      trackBookingStart({
        sessionId: session.id,
        classType: session.className,
        pillar: session.pillar,
      });
    } else if (!open) {
      lastFocusedRef.current?.focus?.();
      setResult(null);
      setRentMat(false);
      setRentTowel(false);
      setGuestOpen(false);
      setGuestName("");
      setGuestEmail("");
      setGuestMsg(null);
      setPassStatus(null);
    }
  }, [open, session]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch guest-pass status on open so the "Neem een gast mee" button
  // can be disabled with a helpful message when 0 remaining.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getGuestPassStatus().then((s) => {
      if (!cancelled) setPassStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function runBook(acknowledgeOverCap: boolean) {
    if (!session) return;
    startTransition(async () => {
      const res = await createBooking(session.id, {
        rentals: isYogaMobility
          ? { mat: rentMat, towel: rentTowel }
          : undefined,
        acknowledgeOverCap,
      });
      setResult(res);
      if (res.ok) {
        const hoursBefore = hoursUntil(session.startAt);
        if (res.action === "booked") {
          trackBookingComplete({
            sessionId: session.id,
            classType: session.className,
            pillar: session.pillar,
            planType: "unknown", // plan info zit niet in session-row; GA4 custom dim afleidt uit user_id
            creditCharged: false,
            hoursBeforeStart: hoursBefore,
          });
        } else if (res.action === "waitlisted") {
          // res.message bevat "plek N" — parse 'm, fallback 0.
          const posMatch = /(\d+)/.exec(res.message);
          trackWaitlistJoin({
            sessionId: session.id,
            classType: session.className,
            position: posMatch ? Number(posMatch[1]) : 0,
          });
        }
        window.setTimeout(onClose, 1200);
      }
    });
  }

  function doBook() {
    runBook(false);
  }

  function confirmOverCap() {
    runBook(true);
  }

  const needsConfirmation =
    result && !result.ok && result.needsConfirmation
      ? result.needsConfirmation
      : null;

  function doCancel() {
    if (!session?.bookingId) return;
    const target = session;
    startTransition(async () => {
      const res = await cancelBooking(target.bookingId!);
      setResult(res);
      if (res.ok && res.action === "cancelled") {
        const hoursBefore = hoursUntil(target.startAt);
        trackBookingCancel({
          sessionId: target.id,
          pillar: target.pillar,
          hoursBeforeStart: hoursBefore,
          withinWindow: hoursBefore >= cancellationWindowHours,
        });
        window.setTimeout(onClose, 1200);
      }
    });
  }

  function doBookGuest() {
    if (!session) return;
    setGuestMsg(null);
    startTransition(async () => {
      const res = await bookGuest({
        sessionId: session.id,
        guestName,
        guestEmail,
      });
      if (res.ok) {
        setGuestMsg({ tone: "success", text: res.message });
        setGuestName("");
        setGuestEmail("");
        // Refresh status inline so the remaining count decrements.
        const fresh = await getGuestPassStatus();
        setPassStatus(fresh);
      } else {
        setGuestMsg({ tone: "error", text: res.message });
      }
    });
  }

  const isBooked = session?.status === "booked";
  const isWaitlisted = session?.status === "waitlisted";
  const isFull = session?.status === "full";
  const lateCancel =
    isBooked && session && hoursUntil(session.startAt) < cancellationWindowHours;
  const canInviteGuest =
    isBooked &&
    passStatus?.eligible &&
    (passStatus?.remaining ?? 0) > 0 &&
    !isFull;

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

              {/* Rentals — only for yoga/mobility, only before booking. */}
              {isYogaMobility && !isBooked && !isWaitlisted && !isFull && (
                <div className="mb-10 pt-8 border-t border-[color:var(--ink-500)]/60">
                  <span className="tmc-eyebrow block mb-3">
                    Wil je iets huren?
                  </span>
                  <div className="flex flex-col gap-3">
                    <RentalCheckbox
                      label="Yogamat (€2,50)"
                      checked={rentMat}
                      onChange={setRentMat}
                    />
                    <RentalCheckbox
                      label="Handdoek (€1,50)"
                      checked={rentTowel}
                      onChange={setRentTowel}
                    />
                    {rentMat && rentTowel && (
                      <p className="text-xs text-text-muted">
                        Combinatie: €3,50
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-text-muted/80 mt-3 italic">
                    Verhuur wordt ter plekke afgerekend.
                  </p>
                </div>
              )}

              {trainerBio && (
                <div className="mb-10 pt-8 border-t border-[color:var(--ink-500)]/60">
                  <span className="tmc-eyebrow block mb-3">Over de coach</span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {trainerBio}
                  </p>
                </div>
              )}

              {/* Guest-pass invite — only when already booked */}
              {isBooked && (
                <div className="mb-6 pt-8 border-t border-[color:var(--ink-500)]/60">
                  <span className="tmc-eyebrow block mb-3">Gast meenemen</span>
                  {!passStatus ? (
                    <p className="text-text-muted text-xs">Bezig...</p>
                  ) : !passStatus.eligible ? (
                    <p className="text-text-muted text-xs leading-relaxed">
                      Je huidige abonnement geeft geen guest passes. Check je
                      abonnement voor een upgrade.
                    </p>
                  ) : passStatus.remaining === 0 ? (
                    <p className="text-text-muted text-xs leading-relaxed">
                      Je guest passes voor deze periode zijn op. Nieuwe
                      passes op{" "}
                      {passStatus.periodEnd
                        ? formatShortDate(
                            new Date(`${passStatus.periodEnd}T00:00:00Z`),
                          )
                        : "volgende periode"}
                      .
                    </p>
                  ) : guestOpen ? (
                    <div className="flex flex-col gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="tmc-eyebrow">Naam gast</span>
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-base text-text focus:outline-none focus:border-accent"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="tmc-eyebrow">E-mail gast</span>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-base text-text focus:outline-none focus:border-accent"
                        />
                      </label>
                      <p className="text-[11px] text-text-muted">
                        Nog {passStatus.remaining} pass
                        {passStatus.remaining === 1 ? "" : "es"} deze periode
                        (tot{" "}
                        {passStatus.periodEnd
                          ? formatShortDate(
                              new Date(`${passStatus.periodEnd}T00:00:00Z`),
                            )
                          : "?"}
                        ).
                      </p>
                      {guestMsg && (
                        <p
                          role={
                            guestMsg.tone === "success" ? "status" : "alert"
                          }
                          className={`text-xs ${
                            guestMsg.tone === "success"
                              ? "text-[color:var(--success)]"
                              : "text-[color:var(--danger)]"
                          }`}
                        >
                          {guestMsg.text}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={doBookGuest}
                          disabled={
                            pending ||
                            !guestName.trim() ||
                            !guestEmail.trim()
                          }
                          className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {pending ? "Bezig" : "Gast toevoegen"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGuestOpen(false);
                            setGuestMsg(null);
                          }}
                          className="text-[11px] uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-2 cursor-pointer"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setGuestOpen(true);
                        setGuestMsg(null);
                      }}
                      disabled={!canInviteGuest || pending}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-colors duration-300 hover:border-accent hover:text-accent cursor-pointer"
                    >
                      <UserPlus size={14} strokeWidth={1.5} />
                      Neem een gast mee ({passStatus.remaining} over)
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-10 pt-6 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-4">
              {result && !needsConfirmation && (
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

              {needsConfirmation && (
                <div
                  role="alert"
                  className="text-sm p-4 border border-[color:var(--warning)]/50 text-[color:var(--warning)]"
                >
                  Je hebt deze week al {needsConfirmation.combined} van{" "}
                  {needsConfirmation.cap} trainingen voor deze discipline.
                  Toch een extra sessie boeken?
                </div>
              )}

              {!isBooked && !isWaitlisted && !isFull && !needsConfirmation && (
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

              {needsConfirmation && (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={confirmOverCap}
                    disabled={pending}
                    className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  >
                    {pending ? "Bezig" : "Toch boeken"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    disabled={pending}
                    className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-2 py-2 cursor-pointer"
                  >
                    Annuleren
                  </button>
                </div>
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

function RentalCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer text-sm text-text">
      <span
        className={`w-4 h-4 border flex items-center justify-center transition-colors ${
          checked
            ? "border-accent bg-accent"
            : "border-text-muted/40 bg-transparent"
        }`}
        aria-hidden
      >
        {checked && (
          <span className="block w-2 h-2 bg-bg" />
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {label}
    </label>
  );
}
