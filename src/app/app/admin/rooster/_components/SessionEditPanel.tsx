"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/ui/AdminField";
import {
  adminUpdateSession,
  adminCancelSession,
  adminRescheduleSession,
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
/** Eenmalige wijziging die open staat (spec-session-overrides.md). */
type OverrideMode = null | "trainer" | "time" | "cancel";

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
  const [mode, setMode] = useState<OverrideMode>(null);
  const [trainerId, setTrainerId] = useState("");
  const [pillarConfirmed, setPillarConfirmed] = useState(false);
  const [newStartTime, setNewStartTime] = useState("");
  const [newDuration, setNewDuration] = useState(0);
  // NULL betekent onbeperkt (alleen kettlebell).
  const [capacity, setCapacity] = useState<number | null>(0);
  const [notes, setNotes] = useState("");
  const [blocksFreeTraining, setBlocksFreeTraining] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [tab, setTab] = useState<PanelTab>("edit");
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const open = Boolean(session);

  // Reset form when a new session is opened.
  useEffect(() => {
    if (session) {
      lastFocusedRef.current = document.activeElement as HTMLElement;
      setTrainerId(session.trainerId);
      setPillarConfirmed(false);
      setNewStartTime(session.startLabel);
      setNewDuration(session.durationMin);
      setCapacity(session.capacity);
      setNotes(session.notes ?? "");
      setBlocksFreeTraining(session.blocksFreeTraining);
      setResult(null);
      setMode(null);
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
    if (capacity !== session.capacity) patch.capacity = capacity;
    if ((notes || null) !== (session.notes || null)) patch.notes = notes;
    if (blocksFreeTraining !== session.blocksFreeTraining) {
      patch.blocksFreeTraining = blocksFreeTraining;
    }

    startTransition(async () => {
      const res = await adminUpdateSession(patch);
      setResult(res);
      if (res.ok) {
        window.setTimeout(onClose, 1000);
      }
    });
  }

  function replaceTrainer() {
    if (!session || trainerId === session.trainerId) return;
    startTransition(async () => {
      const res = await adminUpdateSession({
        id: session.id,
        trainerId,
        pillarWarningOverridden: pillarMismatch && pillarConfirmed,
      });
      setResult(res);
      if (res.ok) window.setTimeout(onClose, 1200);
    });
  }

  function reschedule() {
    if (!session) return;
    startTransition(async () => {
      const res = await adminRescheduleSession({
        id: session.id,
        startTime: newStartTime,
        durationMinutes:
          newDuration !== session.durationMin ? newDuration : undefined,
      });
      setResult(res);
      if (res.ok) window.setTimeout(onClose, 1500);
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
  const canOverride =
    session !== null && !sessionIsCancelled && !session.hasStarted;
  const selectedTrainer = trainers.find((t) => t.id === trainerId);
  // Waarschuwing, geen blokkade (besluit Ilja): elke actieve trainer mag,
  // Marlon bevestigt als de pijler niet in de specialisaties staat.
  const pillarMismatch = Boolean(
    session &&
      selectedTrainer &&
      trainerId !== session.trainerId &&
      !selectedTrainer.pillarSpecialties.includes(session.pillar),
  );
  const dirty =
    session !== null &&
    (capacity !== session.capacity ||
      (notes || null) !== (session.notes || null) ||
      blocksFreeTraining !== session.blocksFreeTraining);

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
              <p
                className={`text-text-muted text-sm ${session.templateId ? "mb-2" : "mb-6"}`}
              >
                {formatTimeRange(
                  new Date(session.startAt),
                  new Date(session.endAt),
                )}{" "}
                ·{" "}
                {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
                {session.templateId && (
                  <>
                    {" "}
                    ·{" "}
                    <span
                      className="text-accent"
                      aria-label="Onderdeel van een herhalende serie"
                    >
                      {/* COPY: confirm met Marlon */}
                      Herhalend
                    </span>
                  </>
                )}
              </p>
              {(session.rescheduledFromLabel || session.trainerReplaced) &&
                !sessionIsCancelled && (
                  <p className="text-accent text-xs mb-2">
                    {/* COPY: confirm met Marlon */}
                    {[
                      session.rescheduledFromLabel
                        ? `Eenmalig verschoven, was ${session.rescheduledFromLabel}`
                        : null,
                      session.trainerReplaced
                        ? `Vervangende trainer: ${session.trainerName}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              {session.templateId && (
                <p className="text-text-muted text-xs mb-6">
                  {/* COPY: confirm met Marlon */}
                  Onderdeel van een serie. Wijzig of stop de hele serie via
                  &quot;Series beheren&quot; in de rooster-toolbar.
                </p>
              )}

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
                  {/* Totale bezetting uit de view, zelfde getal als het blok in het rooster. */}
                  Deelnemers ({session.takenCount})
                </TabButton>
              </div>

              {tab === "participants" && (
                <AttendanceList
                  embedded
                  selfFetch
                  canRefund
                  initialParticipants={[]}
                  initialTakenCount={session.takenCount}
                  session={toSessionSummary(session)}
                />
              )}

              {tab === "edit" && sessionIsCancelled && (
                <div
                  role="status"
                  className="mb-8 text-sm p-4 border border-[color:var(--danger)]/40 text-[color:var(--danger)]"
                >
                  {/* COPY: confirm met Marlon */}
                  Deze les vervalt.
                  {session.cancellationReason
                    ? ` Reden: ${session.cancellationReason}.`
                    : ""}
                </div>
              )}

              {tab === "edit" && (
              <>
              <div className="flex flex-col gap-6 mb-8">
                <AdminField
                  label="Capaciteit"
                  // COPY: confirm met Marlon
                  hint={`Nu ${session.takenCount} bezet. Leeg betekent onbeperkt.`}
                >
                  <AdminInput
                    type="number"
                    min={1}
                    max={50}
                    value={capacity ?? ""}
                    // COPY: confirm met Marlon
                    placeholder="Onbeperkt"
                    onChange={(e) =>
                      setCapacity(
                        e.target.value.trim() === ""
                          ? null
                          : Number(e.target.value) || 0,
                      )
                    }
                    disabled={sessionIsCancelled || pending}
                  />
                  {/* Geen harde blokkade: bij kapot materiaal moet Marlon de
                      capaciteit kunnen verlagen en de overschrijding zelf
                      afhandelen. Alleen signaleren, opslaan blijft mogelijk. */}
                  {capacity !== null &&
                    capacity >= 1 &&
                    capacity < session.takenCount && (
                      <p className="text-[color:var(--warning)] text-xs leading-relaxed">
                        {/* COPY: confirm met Marlon */}
                        Let op: er zijn al {session.takenCount} plekken bezet
                        ({session.bookedCount} leden, {session.trialCount}{" "}
                        proeflessen, {session.guestCount} gasten). Met
                        capaciteit {capacity} zit deze sessie dus over de
                        limiet. Opslaan kan gewoon; de overboeking handel je
                        zelf af.
                      </p>
                    )}
                </AdminField>

                <AdminField label="Notities">
                  <AdminTextarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={sessionIsCancelled || pending}
                    rows={3}
                    placeholder="Intern zichtbaar voor trainers en admin."
                  />
                </AdminField>

                <AdminField
                  label="Blokkeert vrij trainen"
                  // COPY: confirm met Marlon
                  hint="Tijdens deze sessie is de studio niet beschikbaar voor vrij trainen."
                >
                  <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blocksFreeTraining}
                      onChange={(e) => setBlocksFreeTraining(e.target.checked)}
                      disabled={sessionIsCancelled || pending}
                      className="cursor-pointer"
                    />
                    {/* COPY: confirm met Marlon */}
                    {blocksFreeTraining ? "Ja" : "Nee"}
                  </label>
                </AdminField>
              </div>

              {!sessionIsCancelled && session.hasStarted && (
                <p className="pt-6 border-t border-[color:var(--ink-500)]/60 text-xs text-text-muted leading-relaxed">
                  {/* COPY: confirm met Marlon */}
                  Deze les is begonnen of voorbij. Trainer, tijd en annuleren
                  kunnen alleen voor lessen die nog moeten beginnen.
                </p>
              )}

              {canOverride && (
                <div className="pt-6 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-4">
                  <span className="tmc-eyebrow">
                    {/* COPY: confirm met Marlon */}
                    Eenmalig aanpassen
                  </span>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {/* COPY: confirm met Marlon */}
                    Alleen deze les. De serie en de andere weken blijven zoals
                    ze zijn.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <OverrideButton
                      active={mode === "trainer"}
                      onClick={() => setMode(mode === "trainer" ? null : "trainer")}
                    >
                      {/* COPY: confirm met Marlon */}
                      Trainer vervangen
                    </OverrideButton>
                    <OverrideButton
                      active={mode === "time"}
                      onClick={() => setMode(mode === "time" ? null : "time")}
                    >
                      {/* COPY: confirm met Marlon */}
                      Tijd wijzigen
                    </OverrideButton>
                    <OverrideButton
                      danger
                      active={mode === "cancel"}
                      onClick={() => setMode(mode === "cancel" ? null : "cancel")}
                    >
                      {/* COPY: confirm met Marlon */}
                      Les annuleren
                    </OverrideButton>
                  </div>

                  {mode === "trainer" && (
                    <div className="flex flex-col gap-3">
                      <AdminField label="Nieuwe trainer">
                        <AdminSelect
                          value={trainerId}
                          onChange={(e) => {
                            setTrainerId(e.target.value);
                            setPillarConfirmed(false);
                          }}
                          disabled={pending}
                        >
                          {trainers
                            .filter((t) => t.isActive || t.id === session.trainerId)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.displayName}
                                {t.id === session.trainerId
                                  ? // COPY: confirm met Marlon
                                    " (huidig)"
                                  : ""}
                              </option>
                            ))}
                        </AdminSelect>
                      </AdminField>
                      {pillarMismatch && (
                        <div className="text-xs leading-relaxed text-[color:var(--warning)] flex flex-col gap-2">
                          <p>
                            {/* COPY: confirm met Marlon */}
                            {selectedTrainer?.displayName} heeft{" "}
                            {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}{" "}
                            niet als specialisatie. Toch deze trainer inzetten?
                          </p>
                          <label className="flex items-center gap-2 text-text cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pillarConfirmed}
                              onChange={(e) => setPillarConfirmed(e.target.checked)}
                              className="cursor-pointer"
                            />
                            {/* COPY: confirm met Marlon */}
                            Ja, deze trainer geeft deze les
                          </label>
                        </div>
                      )}
                      <p className="text-xs text-text-muted leading-relaxed">
                        {/* COPY: confirm met Marlon */}
                        Leden krijgen hier geen bericht van. De nieuwe trainer
                        ziet de les en de deelnemers meteen.
                      </p>
                      <ActionButton
                        onClick={replaceTrainer}
                        disabled={
                          pending ||
                          trainerId === session.trainerId ||
                          (pillarMismatch && !pillarConfirmed)
                        }
                        pending={pending}
                      >
                        {/* COPY: confirm met Marlon */}
                        Trainer vervangen
                      </ActionButton>
                    </div>
                  )}

                  {mode === "time" && (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-4">
                        <AdminField label="Nieuwe starttijd">
                          <AdminInput
                            type="time"
                            value={newStartTime}
                            onChange={(e) => setNewStartTime(e.target.value)}
                            disabled={pending}
                          />
                        </AdminField>
                        <AdminField label="Duur (min)">
                          <AdminInput
                            type="number"
                            min={5}
                            max={600}
                            value={newDuration || ""}
                            onChange={(e) => setNewDuration(Number(e.target.value) || 0)}
                            disabled={pending}
                          />
                        </AdminField>
                      </div>
                      <p className="text-xs text-text-muted leading-relaxed">
                        {/* COPY: confirm met Marlon */}
                        Alleen binnen dezelfde dag.{" "}
                        {session.bookedCount > 0
                          ? `${session.bookedCount} geboekte leden krijgen een mail en push met de oude en nieuwe tijd, en mogen tot de nieuwe starttijd kosteloos annuleren.`
                          : "Er zijn nog geen boekingen."}
                      </p>
                      <ActionButton
                        onClick={reschedule}
                        disabled={
                          pending ||
                          !/^\d{2}:\d{2}$/.test(newStartTime) ||
                          newDuration < 5 ||
                          (newStartTime === session.startLabel &&
                            newDuration === session.durationMin)
                        }
                        pending={pending}
                      >
                        {/* COPY: confirm met Marlon */}
                        Tijd wijzigen
                      </ActionButton>
                    </div>
                  )}

                  {mode === "cancel" && (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs text-text-muted leading-relaxed">
                        {/* COPY: confirm met Marlon */}
                        {session.bookedCount +
                          session.waitlistCount +
                          session.guestCount +
                          session.trialCount ===
                        0
                          ? "Geen boekingen, wachtlijst, gasten of proeflessen voor deze les."
                          : `Wordt geannuleerd met volledige teruggave: ${session.bookedCount} boeking(en), ${session.waitlistCount} wachtlijstplek(ken), ${session.guestCount} gast(en) en ${session.trialCount} proefles(sen). Iedereen krijgt bericht.`}
                      </p>
                      <AdminField label="Reden">
                        <AdminInput
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Bv. trainer ziek"
                          disabled={pending}
                        />
                      </AdminField>
                      <ActionButton
                        danger
                        onClick={cancel}
                        disabled={pending || !cancelReason.trim()}
                        pending={pending}
                      >
                        {/* COPY: confirm met Marlon */}
                        Bevestig annuleren
                      </ActionButton>
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

function OverrideButton({
  active,
  danger = false,
  onClick,
  children,
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tone = danger
    ? "border-[color:var(--danger)]/50 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
    : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors cursor-pointer ${tone} ${
        active ? (danger ? "bg-[color:var(--danger)]/10" : "border-accent text-accent") : ""
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  disabled,
  pending,
  danger = false,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`self-start inline-flex items-center justify-center px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] border transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${
        danger
          ? "border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10"
          : "border-accent text-accent hover:bg-accent/10"
      }`}
    >
      {pending ? "Bezig" : children}
    </button>
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
