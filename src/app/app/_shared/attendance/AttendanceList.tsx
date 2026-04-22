"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Undo2 } from "lucide-react";
import {
  autoMarkNoShows,
  loadParticipants,
  markAttendance,
  refundCredit,
  type AttendanceActionResult,
  type ParticipantRow,
  type SessionSummary,
} from "@/lib/admin/attendance-actions";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";
import { AvatarBubble } from "./AvatarBubble";
import { PlanBadge } from "./PlanBadge";

type DirtyMap = Map<string, "attended" | "booked" | "no_show">;

export interface AttendanceListProps {
  session: SessionSummary;
  initialParticipants: ParticipantRow[];
  canRefund: boolean;
  embedded?: boolean;
  /**
   * When true, the component calls `loadParticipants` itself on mount and on
   * save. Useful inside the C2 sidepanel where the parent doesn't pre-fetch.
   */
  selfFetch?: boolean;
}

export function AttendanceList({
  session,
  initialParticipants,
  canRefund,
  embedded = false,
  selfFetch = false,
}: AttendanceListProps) {
  const [participants, setParticipants] =
    useState<ParticipantRow[]>(initialParticipants);
  const [dirty, setDirty] = useState<DirtyMap>(new Map());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);
  const [refundFor, setRefundFor] = useState<ParticipantRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const refundDialogRef = useRef<HTMLDialogElement | null>(null);
  const [loading, setLoading] = useState(false);

  // When embedded in C2, the parent may pass empty initialParticipants and
  // ask us to self-fetch. Also refetch when session id changes.
  useEffect(() => {
    if (!selfFetch) return;
    let cancelled = false;
    setLoading(true);
    loadParticipants(session.id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setParticipants(res.participants);
      } else {
        setMessage({ tone: "error", text: res.message });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selfFetch, session.id]);

  useEffect(() => {
    if (refundFor && refundDialogRef.current) {
      refundDialogRef.current.showModal();
    }
  }, [refundFor]);

  const sessionEnded = useMemo(
    () => new Date(session.endAt).getTime() < Date.now(),
    [session.endAt],
  );

  const stats = useMemo(() => {
    const active = participants.filter((p) => p.status !== "cancelled");
    const attended = active.filter((p) => {
      const next = dirty.get(p.bookingId) ?? p.status;
      return next === "attended";
    }).length;
    const noShow = active.filter((p) => {
      const next = dirty.get(p.bookingId) ?? p.status;
      return next === "no_show";
    }).length;
    return { total: active.length, attended, noShow };
  }, [participants, dirty]);

  function currentStatus(p: ParticipantRow): AttendanceStatus {
    return dirty.get(p.bookingId) ?? p.status;
  }

  function toggleAttended(p: ParticipantRow) {
    if (p.status === "cancelled") return;
    const next = currentStatus(p) === "attended" ? "booked" : "attended";
    const copy = new Map(dirty);
    if (next === p.status) copy.delete(p.bookingId);
    else copy.set(p.bookingId, next);
    setDirty(copy);
  }

  function markNoShow(p: ParticipantRow) {
    if (p.status === "cancelled") return;
    const next = currentStatus(p) === "no_show" ? "booked" : "no_show";
    const copy = new Map(dirty);
    if (next === p.status) copy.delete(p.bookingId);
    else copy.set(p.bookingId, next);
    setDirty(copy);
  }

  function save() {
    if (dirty.size === 0) {
      setMessage({ tone: "success", text: "Geen wijzigingen." });
      return;
    }
    setMessage(null);
    const payload = Array.from(dirty.entries()).map(([bookingId, status]) => ({
      bookingId,
      status,
    }));
    startTransition(async () => {
      const res = await markAttendance(session.id, payload);
      reflect(res);
      if (res.ok) {
        // Merge dirty into participants + clear dirty.
        setParticipants((prev) =>
          prev.map((p) => {
            const next = dirty.get(p.bookingId);
            if (!next) return p;
            return {
              ...p,
              status: next,
              attendedAt:
                next === "attended"
                  ? new Date().toISOString()
                  : next === "booked"
                    ? null
                    : p.attendedAt,
            };
          }),
        );
        setDirty(new Map());
      }
    });
  }

  function runAutoNoShows() {
    setMessage(null);
    startTransition(async () => {
      const res = await autoMarkNoShows(session.id);
      reflect(res);
      if (res.ok) {
        // Refetch to keep state canonical.
        const reload = await loadParticipants(session.id);
        if (reload.ok) {
          setParticipants(reload.participants);
          setDirty(new Map());
        }
      }
    });
  }

  function reflect(res: AttendanceActionResult) {
    setMessage({ tone: res.ok ? "success" : "error", text: res.message });
  }

  function openRefund(p: ParticipantRow) {
    setRefundReason("");
    setRefundFor(p);
  }

  function closeRefund() {
    refundDialogRef.current?.close();
    setRefundFor(null);
  }

  function confirmRefund() {
    if (!refundFor) return;
    const target = refundFor;
    startTransition(async () => {
      const res = await refundCredit(target.bookingId, refundReason);
      reflect(res);
      if (res.ok) {
        setParticipants((prev) =>
          prev.map((p) =>
            p.bookingId === target.bookingId
              ? {
                  ...p,
                  creditsUsed: 0,
                  creditsRemaining:
                    (p.creditsRemaining ?? 0) + (target.creditsUsed ?? 0),
                }
              : p,
          ),
        );
        closeRefund();
      }
    });
  }

  function exportCsv() {
    const headers = [
      "Naam",
      "Abonnement",
      "Status",
      "Geboekt op",
      "Aanwezig sinds",
      "Credits gebruikt",
    ];
    const rows = participants.map((p) => [
      `${p.firstName} ${p.lastName}`.trim(),
      p.planType ?? "drop-in",
      currentStatus(p),
      p.bookedAt,
      p.attendedAt ?? "",
      String(p.creditsUsed ?? 0),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deelnemers-${session.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const active = participants.filter((p) => p.status !== "cancelled");
  const cancelled = participants.filter((p) => p.status === "cancelled");

  const paddingClass = embedded ? "" : "px-6 md:px-10 lg:px-12 py-10 md:py-14";

  return (
    <div className={paddingClass}>
      {!embedded && (
        <header className="mb-10">
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
            Deelnemers
          </span>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-6xl text-text leading-[1.02] tracking-[-0.02em] mb-4">
            {session.classTypeName}
          </h1>
          <p className="text-text-muted text-base md:text-lg">
            {formatWeekdayDate(new Date(session.startAt))} ·{" "}
            {formatTimeRange(new Date(session.startAt), new Date(session.endAt))}{" "}
            · {session.trainerName} ·{" "}
            {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
          </p>
        </header>
      )}

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-6 pb-6 border-b border-[color:var(--ink-500)]/60">
        <SummaryStat label="Totaal" value={`${stats.total}/${session.capacity}`} />
        <SummaryStat label="Aanwezig" value={String(stats.attended)} tone="success" />
        <SummaryStat label="No-show" value={String(stats.noShow)} tone="danger" />
        <div className="ml-auto flex items-center gap-3">
          {canRefund && active.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 hover:text-accent cursor-pointer"
            >
              <Download size={14} strokeWidth={1.5} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden
              className="h-16 bg-bg-elevated border border-[color:var(--ink-500)]/60 animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && active.length === 0 && (
        <p className="text-text-muted text-sm py-8">
          Nog geen boekingen voor deze sessie.
        </p>
      )}

      {!loading && active.length > 0 && (
        <ul className="flex flex-col divide-y divide-[color:var(--ink-500)]/60 mb-8">
          {active.map((p) => (
            <li
              key={p.bookingId}
              className="flex flex-wrap items-center gap-4 py-5"
            >
              <AvatarBubble
                firstName={p.firstName}
                lastName={p.lastName}
                avatarUrl={p.avatarUrl}
              />
              <div className="flex-1 min-w-0">
                <p className="text-text text-sm font-medium truncate">
                  {p.firstName} {p.lastName}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <PlanBadge
                    planType={p.planType}
                    planVariant={p.planVariant}
                  />
                  {currentStatus(p) !== "booked" && (
                    <StatusBadge
                      status={currentStatus(p) as SessionStatus}
                    />
                  )}
                  {p.creditsUsed > 0 && (
                    <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                      1 credit gebruikt
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AttendanceCheckbox
                  id={`att-${p.bookingId}`}
                  label="Aanwezig"
                  checked={currentStatus(p) === "attended"}
                  onChange={() => toggleAttended(p)}
                  disabled={pending}
                />
                <AttendanceCheckbox
                  id={`ns-${p.bookingId}`}
                  label="No-show"
                  tone="danger"
                  checked={currentStatus(p) === "no_show"}
                  onChange={() => markNoShow(p)}
                  disabled={pending}
                />
                {canRefund && (
                  <button
                    type="button"
                    onClick={() => openRefund(p)}
                    disabled={p.creditsUsed === 0 || !p.membershipId || pending}
                    title={
                      p.creditsUsed === 0
                        ? "Geen credits gebruikt"
                        : "Credit terugzetten"
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-text-muted/30 text-text-muted transition-colors duration-300 hover:border-accent hover:text-accent disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Undo2 size={12} strokeWidth={1.8} />
                    Credit
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {cancelled.length > 0 && (
        <details className="mb-8">
          <summary className="tmc-eyebrow cursor-pointer text-text-muted hover:text-text transition-colors">
            Geannuleerde boekingen ({cancelled.length})
          </summary>
          <ul className="mt-4 flex flex-col divide-y divide-[color:var(--ink-500)]/40">
            {cancelled.map((p) => (
              <li
                key={p.bookingId}
                className="flex items-center gap-4 py-3 opacity-60"
              >
                <AvatarBubble
                  firstName={p.firstName}
                  lastName={p.lastName}
                  avatarUrl={p.avatarUrl}
                  size={32}
                />
                <span className="text-sm text-text-muted">
                  {p.firstName} {p.lastName}
                </span>
                <span className="ml-auto">
                  <StatusBadge status="cancelled" />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Footer actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-[color:var(--ink-500)]/60">
        <button
          type="button"
          onClick={save}
          disabled={pending || dirty.size === 0}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {pending && dirty.size > 0
            ? "Bezig"
            : dirty.size === 0
              ? "Opgeslagen"
              : `Opslaan (${dirty.size})`}
        </button>
        <button
          type="button"
          onClick={runAutoNoShows}
          disabled={pending || !sessionEnded}
          title={
            sessionEnded
              ? "Markeer alle resterende boekingen als no-show"
              : "Kan pas na einde sessie"
          }
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          Auto-mark no-shows
        </button>
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

      {/* Refund dialog */}
      {canRefund && refundFor && (
        <dialog
          ref={refundDialogRef}
          onClose={closeRefund}
          className="bg-bg border border-[color:var(--ink-500)] text-text p-8 w-[min(92vw,480px)] backdrop:bg-bg/55 backdrop:backdrop-blur-sm"
        >
          <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl tracking-[-0.01em] mb-2">
            Credit terugzetten
          </h3>
          <p className="text-text-muted text-sm mb-6">
            Voor {refundFor.firstName} {refundFor.lastName}. De credit wordt
            toegevoegd aan het lopende abonnement.
          </p>
          <label className="flex flex-col gap-2 mb-6">
            <span className="tmc-eyebrow">Reden (verplicht)</span>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              placeholder="Bv. trainer ziek, technisch probleem in studio"
              className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent resize-none"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeRefund}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={confirmRefund}
              disabled={pending || !refundReason.trim()}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {pending ? "Bezig" : "Bevestig"}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}

type AttendanceStatus = "booked" | "attended" | "no_show" | "cancelled";

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-[color:var(--success)]"
      : tone === "danger"
        ? "text-[color:var(--danger)]"
        : "text-text";
  return (
    <div className="flex flex-col">
      <span className="tmc-eyebrow">{label}</span>
      <span
        className={`font-[family-name:var(--font-playfair)] text-2xl mt-1 leading-none ${valueClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function AttendanceCheckbox({
  id,
  label,
  checked,
  onChange,
  disabled,
  tone,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  const checkedColor =
    tone === "danger"
      ? "border-[color:var(--danger)] bg-[color:var(--danger)]/10 text-[color:var(--danger)]"
      : "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]";
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border transition-colors duration-300 cursor-pointer ${
        checked
          ? checkedColor
          : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`w-3 h-3 border ${
          checked
            ? tone === "danger"
              ? "border-[color:var(--danger)] bg-[color:var(--danger)]"
              : "border-[color:var(--success)] bg-[color:var(--success)]"
            : "border-text-muted/60"
        }`}
      />
      {label}
    </label>
  );
}
