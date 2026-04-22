"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  adminUpdateSession,
  adminCancelSession,
  type AdminActionResult,
} from "@/lib/admin/session-actions";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { AttendanceList } from "@/app/app/_shared/attendance/AttendanceList";
import type { SessionSummary } from "@/lib/admin/attendance-actions";
import {
  type AdminSessionBlockData,
  type AdminTrainerOption,
} from "./types";

type PanelTab = "edit" | "participants";

interface SessionEditPanelProps {
  session: AdminSessionBlockData | null;
  trainers: AdminTrainerOption[];
  onClose: () => void;
}

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

export function SessionEditPanel({
  session,
  trainers,
  onClose,
}: SessionEditPanelProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AdminActionResult | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [trainerId, setTrainerId] = useState("");
  const [capacity, setCapacity] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [tab, setTab] = useState<PanelTab>("edit");
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const open = Boolean(session);

  // Reset form when a new session is opened.
  useEffect(() => {
    if (session) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
      setTrainerId(session.trainerId);
      setCapacity(session.capacity);
      setNotes(session.notes ?? "");
      setResult(null);
      setConfirmCancel(false);
      setCancelReason("");
      setTab("edit");
    } else {
      lastFocusedRef.current?.focus?.();
    }
  }, [session]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function save() {
    if (!session) return;
    const patch: Parameters<typeof adminUpdateSession>[0] = { id: session.id };
    if (trainerId !== session.trainerId) patch.trainerId = trainerId;
    if (capacity !== session.capacity) patch.capacity = capacity;
    if ((notes || null) !== (session.notes || null)) patch.notes = notes;

    startTransition(async () => {
      const res = await adminUpdateSession(patch);
      setResult(res);
      if (res.ok) {
        window.setTimeout(onClose, 1000);
      }
    });
  }

  function cancel() {
    if (!session) return;
    if (!cancelReason.trim()) {
      setResult({ ok: false, message: "Geef een reden op." });
      return;
    }
    startTransition(async () => {
      const res = await adminCancelSession({
        id: session.id,
        reason: cancelReason.trim(),
      });
      setResult(res);
      if (res.ok) {
        window.setTimeout(onClose, 1200);
      }
    });
  }

  const sessionIsCancelled = session?.status === "cancelled";
  const dirty =
    session !== null &&
    (trainerId !== session.trainerId ||
      capacity !== session.capacity ||
      (notes || null) !== (session.notes || null));

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
            aria-labelledby="admin-edit-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: clubEase }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[560px] bg-bg border-l border-[color:var(--ink-500)] flex flex-col text-text"
          >
            <div className="flex items-start justify-between p-8">
              <span className="tmc-eyebrow tmc-eyebrow--accent">
                Sessie bewerken
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Sluit paneel"
                className="text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text cursor-pointer"
              >
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 pb-6 flex-1 overflow-y-auto">
              <h2
                id="admin-edit-title"
                className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-2"
              >
                {session.className}
              </h2>
              <p className="text-text-muted text-sm mb-2">
                {formatWeekdayDate(new Date(session.startAt))}
              </p>
              <p className="text-text-muted text-sm mb-6">
                {formatTimeRange(
                  new Date(session.startAt),
                  new Date(session.endAt),
                )}{" "}
                ·{" "}
                {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
              </p>

              <div
                role="tablist"
                aria-label="Paneel tabs"
                className="flex items-center gap-6 mb-8 border-b border-[color:var(--ink-500)]/60"
              >
                <TabButton
                  active={tab === "edit"}
                  onClick={() => setTab("edit")}
                >
                  Bewerken
                </TabButton>
                <TabButton
                  active={tab === "participants"}
                  onClick={() => setTab("participants")}
                >
                  Deelnemers ({session.bookedCount})
                </TabButton>
              </div>

              {tab === "participants" && (
                <AttendanceList
                  embedded
                  selfFetch
                  canRefund
                  initialParticipants={[]}
                  session={toSessionSummary(session)}
                />
              )}

              {tab === "edit" && sessionIsCancelled && (
                <div
                  role="status"
                  className="mb-8 text-sm p-4 border border-[color:var(--danger)]/40 text-[color:var(--danger)]"
                >
                  Deze sessie is geannuleerd.
                </div>
              )}

              {tab === "edit" && (
              <>
              <div className="flex flex-col gap-6 mb-8">
                <label className="flex flex-col gap-2">
                  <span className="tmc-eyebrow">Trainer</span>
                  <select
                    value={trainerId}
                    onChange={(e) => setTrainerId(e.target.value)}
                    disabled={sessionIsCancelled || pending}
                    className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent disabled:opacity-50"
                  >
                    {trainers.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={!t.isActive && t.id !== session.trainerId}
                      >
                        {t.displayName}
                        {!t.isActive ? " (inactief)" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="tmc-eyebrow">Capaciteit</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value) || 0)}
                    disabled={sessionIsCancelled || pending}
                    className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent disabled:opacity-50"
                  />
                  <span className="text-xs text-text-muted">
                    {session.bookedCount} boeking(en) nu. Nieuwe waarde moet ≥{" "}
                    {session.bookedCount} zijn.
                  </span>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="tmc-eyebrow">Notities</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={sessionIsCancelled || pending}
                    rows={3}
                    placeholder="Intern zichtbaar voor trainers en admin."
                    className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent disabled:opacity-50 resize-none"
                  />
                </label>
              </div>

              {!sessionIsCancelled && (
                <div className="pt-6 border-t border-[color:var(--ink-500)]/60">
                  {!confirmCancel ? (
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--danger)] hover:text-[color:var(--danger)]/80 transition-colors cursor-pointer"
                    >
                      Sessie annuleren
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-text-muted leading-relaxed">
                        {session.bookedCount === 0
                          ? "Geen boekingen voor deze sessie."
                          : `${session.bookedCount} boeking(en) worden geannuleerd en credits teruggezet.`}
                      </p>
                      <label className="flex flex-col gap-2">
                        <span className="tmc-eyebrow">Reden</span>
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Bv. trainer ziek"
                          className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
                        />
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={cancel}
                          disabled={pending || !cancelReason.trim()}
                          className="inline-flex items-center justify-center px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/60 text-[color:var(--danger)] transition-colors hover:bg-[color:var(--danger)]/10 disabled:opacity-50 cursor-pointer"
                        >
                          {pending ? "Bezig" : "Bevestig annuleren"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(false)}
                          className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
                        >
                          Terug
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              </>
              )}
            </div>

            <div className="p-8 pt-6 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-4">
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

              {tab === "edit" && !sessionIsCancelled && (
                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || pending}
                  className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {pending ? "Bezig" : "Opslaan"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-text-muted hover:text-text transition-colors duration-300 py-2 cursor-pointer"
              >
                Sluiten
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative pb-3 text-xs font-medium uppercase tracking-[0.18em] transition-colors duration-300 cursor-pointer ${
        active ? "text-accent" : "text-text-muted hover:text-text"
      }`}
    >
      {children}
      {active && (
        <span
          aria-hidden
          className="absolute left-0 right-0 -bottom-px h-px bg-accent"
        />
      )}
    </button>
  );
}

function toSessionSummary(s: AdminSessionBlockData): SessionSummary {
  return {
    id: s.id,
    classTypeName: s.className,
    trainerName: s.trainerName,
    pillar: s.pillar,
    startAt: s.startAt,
    endAt: s.endAt,
    capacity: s.capacity,
    status: s.status,
  };
}
