"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, UserX } from "lucide-react";
import {
  autoMarkNoShows,
  markAttendance,
  type ParticipantRow,
  type SessionSummary,
} from "@/lib/admin/attendance-actions";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

const CHECK_IN_TIME_FMT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
import { AvatarBubble } from "./AvatarBubble";
import { PlanBadge } from "./PlanBadge";
import { InjuryFlag } from "./InjuryFlag";

type LocalStatus = "booked" | "attended" | "no_show";
type SyncState = "idle" | "saving" | "saved" | "error";

function hasEnded(endAt: string): boolean {
  return new Date(endAt).getTime() < Date.now();
}

export interface MobileAttendanceListProps {
  session: SessionSummary;
  initialParticipants: ParticipantRow[];
}

export function MobileAttendanceList({
  session,
  initialParticipants,
}: MobileAttendanceListProps) {
  const [rows, setRows] = useState<ParticipantRow[]>(initialParticipants);
  const [syncByBooking, setSyncByBooking] = useState<Record<string, SyncState>>(
    {},
  );
  const [errorByBooking, setErrorByBooking] = useState<Record<string, string>>(
    {},
  );
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkMessage, setBulkMessage] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  const sessionEnded = hasEnded(session.endAt);

  const active = rows.filter((r) => r.status !== "cancelled");
  const cancelled = rows.filter((r) => r.status === "cancelled");

  const stats = useMemo(() => {
    const attended = active.filter((r) => r.status === "attended").length;
    const noShow = active.filter((r) => r.status === "no_show").length;
    return { total: active.length, attended, noShow };
  }, [active]);

  function setStatusLocal(bookingId: string, status: LocalStatus) {
    setRows((prev) =>
      prev.map((r) =>
        r.bookingId === bookingId
          ? {
              ...r,
              status,
              attendedAt:
                status === "attended"
                  ? new Date().toISOString()
                  : status === "booked"
                    ? null
                    : r.attendedAt,
            }
          : r,
      ),
    );
  }

  function persist(bookingId: string, next: LocalStatus, previous: LocalStatus) {
    setSyncByBooking((s) => ({ ...s, [bookingId]: "saving" }));
    setErrorByBooking((e) => {
      const copy = { ...e };
      delete copy[bookingId];
      return copy;
    });

    void (async () => {
      const res = await markAttendance(session.id, [
        { bookingId, status: next },
      ]);
      if (res.ok) {
        setSyncByBooking((s) => ({ ...s, [bookingId]: "saved" }));
        // Clear the "saved" tick after a moment so it's not sticky.
        window.setTimeout(() => {
          setSyncByBooking((s) => {
            const copy = { ...s };
            if (copy[bookingId] === "saved") delete copy[bookingId];
            return copy;
          });
        }, 1500);
      } else {
        setSyncByBooking((s) => ({ ...s, [bookingId]: "error" }));
        setErrorByBooking((e) => ({ ...e, [bookingId]: res.message }));
        // Rollback optimistic change.
        setStatusLocal(bookingId, previous);
      }
    })();
  }

  function toggleAttended(row: ParticipantRow) {
    if (row.status === "cancelled") return;
    const next: LocalStatus = row.status === "attended" ? "booked" : "attended";
    const previous = row.status as LocalStatus;
    setStatusLocal(row.bookingId, next);
    persist(row.bookingId, next, previous);
  }

  function toggleNoShow(row: ParticipantRow) {
    if (row.status === "cancelled") return;
    const next: LocalStatus = row.status === "no_show" ? "booked" : "no_show";
    const previous = row.status as LocalStatus;
    setStatusLocal(row.bookingId, next);
    persist(row.bookingId, next, previous);
  }

  function runAutoNoShows() {
    setBulkMessage(null);
    startBulkTransition(async () => {
      const res = await autoMarkNoShows(session.id);
      setBulkMessage({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.status === "booked" ? { ...r, status: "no_show" } : r,
          ),
        );
      }
    });
  }

  const start = new Date(session.startAt);
  const end = new Date(session.endAt);

  return (
    <div className="max-w-xl mx-auto">
      <header className="mb-8">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          Deelnemers
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-5xl text-text leading-[1.05] tracking-[-0.02em] mb-3">
          {session.classTypeName}
        </h1>
        <p className="text-text-muted text-sm leading-relaxed">
          {formatWeekdayDate(start)}
        </p>
        <p className="text-text-muted text-sm leading-relaxed">
          {formatTimeRange(start, end)} ·{" "}
          {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-6 pb-6 border-b border-[color:var(--ink-500)]/60">
        <Stat label="Totaal" value={`${stats.total}/${session.capacity}`} />
        <Stat
          label="Aanwezig"
          value={String(stats.attended)}
          tone="success"
        />
        <Stat label="No-show" value={String(stats.noShow)} tone="danger" />
      </div>

      {active.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center">
          Nog geen boekingen voor deze sessie.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 mb-8">
          {active.map((row) => {
            const sync = syncByBooking[row.bookingId] ?? "idle";
            const error = errorByBooking[row.bookingId];
            const status = row.status as LocalStatus;
            const isAttended = status === "attended";
            const isNoShow = status === "no_show";
            return (
              <li
                key={row.bookingId}
                className={`flex items-center gap-4 p-4 bg-bg-elevated border transition-colors duration-300 ${
                  isAttended
                    ? "border-[color:var(--success)]/40"
                    : isNoShow
                      ? "border-[color:var(--danger)]/40"
                      : "border-[color:var(--ink-500)]"
                }`}
              >
                <AvatarBubble
                  firstName={row.firstName}
                  lastName={row.lastName}
                  avatarUrl={row.avatarUrl}
                  size={48}
                />

                <div className="flex-1 min-w-0">
                  <p className="text-text text-base font-medium truncate">
                    {row.firstName} {row.lastName}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <PlanBadge
                      planType={row.planType}
                      planVariant={row.planVariant}
                    />
                    {row.checkedInAt && (
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--success)]">
                        Ingecheckt{" "}
                        {CHECK_IN_TIME_FMT.format(new Date(row.checkedInAt))}
                      </span>
                    )}
                    {row.hasInjury && <InjuryFlag />}
                  </div>
                  {row.injuryText && (
                    <p
                      role="note"
                      className="mt-2 text-[11px] text-[color:var(--warning)] leading-relaxed whitespace-pre-wrap"
                    >
                      {row.injuryText}
                    </p>
                  )}
                  <SyncLine state={sync} error={error} />
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAttended(row)}
                    aria-label={
                      isAttended
                        ? `Markeer ${row.firstName} als niet aanwezig`
                        : `Markeer ${row.firstName} als aanwezig`
                    }
                    aria-pressed={isAttended}
                    className={`w-[52px] h-[52px] rounded-full border-2 flex items-center justify-center transition-colors duration-300 cursor-pointer ${
                      isAttended
                        ? "bg-[color:var(--success)] border-[color:var(--success)] text-bg"
                        : "bg-transparent border-text-muted/40 text-text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    <Check size={24} strokeWidth={2.2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleNoShow(row)}
                    aria-label={
                      isNoShow
                        ? `Herstel status voor ${row.firstName}`
                        : `Markeer ${row.firstName} als no-show`
                    }
                    aria-pressed={isNoShow}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors duration-300 cursor-pointer ${
                      isNoShow
                        ? "bg-[color:var(--danger)]/10 border-[color:var(--danger)]/60 text-[color:var(--danger)]"
                        : "bg-transparent border-text-muted/30 text-text-muted hover:border-[color:var(--danger)]/60 hover:text-[color:var(--danger)]"
                    }`}
                  >
                    <UserX size={15} strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cancelled.length > 0 && (
        <details className="mb-8 opacity-80">
          <summary className="tmc-eyebrow cursor-pointer text-text-muted hover:text-text transition-colors">
            Geannuleerd ({cancelled.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {cancelled.map((c) => (
              <li
                key={c.bookingId}
                className="flex items-center gap-3 text-sm text-text-muted"
              >
                <AvatarBubble
                  firstName={c.firstName}
                  lastName={c.lastName}
                  avatarUrl={c.avatarUrl}
                  size={32}
                />
                <span>
                  {c.firstName} {c.lastName}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="pt-6 border-t border-[color:var(--ink-500)]/60 flex flex-col gap-3">
        <button
          type="button"
          onClick={runAutoNoShows}
          disabled={bulkPending || !sessionEnded}
          title={
            sessionEnded
              ? "Markeer alle open boekingen als no-show"
              : "Kan pas na einde sessie"
          }
          className="inline-flex items-center justify-center px-7 py-4 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text-muted transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          {bulkPending ? "Bezig" : "Auto-mark no-shows"}
        </button>
        {bulkMessage && (
          <p
            role={bulkMessage.tone === "success" ? "status" : "alert"}
            className={`text-sm ${
              bulkMessage.tone === "success"
                ? "text-[color:var(--success)]"
                : "text-[color:var(--danger)]"
            }`}
          >
            {bulkMessage.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
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
    <div className="flex flex-col items-center">
      <span className="tmc-eyebrow">{label}</span>
      <span
        className={`font-[family-name:var(--font-playfair)] text-2xl mt-1 leading-none ${valueClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function SyncLine({
  state,
  error,
}: {
  state: SyncState;
  error?: string | null;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <p
        role="status"
        aria-live="polite"
        className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-text-muted"
      >
        Bezig
      </p>
    );
  }
  if (state === "saved") {
    return (
      <p
        role="status"
        aria-live="polite"
        className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--success)]"
      >
        Opgeslagen
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--danger)]"
    >
      {error ?? "Opslaan mislukt"}
    </p>
  );
}
