"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import { OverrideWarning } from "../../boeken/_components/OverrideWarning";
import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { zonedWallClockToUtc } from "@/lib/scheduling/amsterdam-time";
import {
  markPtAttendance,
  cancelPtBookingAsStaff,
  reschedulePtBookingAsStaff,
  deletePtBlock,
} from "@/lib/trainer/pt-agenda-actions";
import type { AgendaSessionBlockData } from "./types";

interface SessionDetailPanelProps {
  session: AgendaSessionBlockData;
  isAdmin: boolean;
  onClose: () => void;
}

// COPY: confirm met Marlon
const KIND_LABEL: Record<AgendaSessionBlockData["kind"], string> = {
  bookable: "PT-sessie",
  intake: "Intake",
  block: "Geblokkeerde tijd",
};

// COPY: confirm met Marlon
const FORMAT_LABEL: Record<string, string> = {
  one_on_one: "1-op-1",
  duo: "Duo",
  small_group_4: "Small group",
};

// COPY: confirm met Marlon
const STATUS_LABEL: Record<string, string> = {
  pending: "In afwachting",
  booked: "Geboekt",
  cancelled: "Geannuleerd",
  attended: "Aanwezig geweest",
  no_show: "No-show",
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * PT-agenda PR D: detailpaneel voor een bestaande sessie. Sinds C4
 * (20260802-migratie) werken aanwezigheid/annuleren/verzetten ook voor
 * de trainer van de sessie: de RPC's bewaken de eigen-sessie-grens, dus
 * de knoppen zijn hier voor alle staff enabled. De klantnaam linkt
 * rol-afhankelijk: admin naar het ledenbeheer, trainer naar de smalle
 * read-only klantweergave (/app/trainer/klant). Blokken kunnen sinds C4
 * verwijderd worden via deletePtBlock.
 */
export function SessionDetailPanel({
  session,
  isAdmin,
  onClose,
}: SessionDetailPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "reschedule">("view");

  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("09:00");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [allowNoTurnaround, setAllowNoTurnaround] = useState(false);
  const [overlapConflictAt, setOverlapConflictAt] = useState<string | null>(
    null,
  );
  const [turnaroundConflictAt, setTurnaroundConflictAt] = useState<
    string | null
  >(null);

  const [now] = useState(() => Date.now());
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  const hasStarted = start.getTime() <= now;
  const booking = session.booking;
  const canManage =
    booking !== null && booking.status === "booked" && !hasStarted;
  const canMarkAttendance =
    booking !== null &&
    hasStarted &&
    ["booked", "attended", "no_show"].includes(booking.status);

  function refreshAndClose() {
    router.refresh();
    onClose();
  }

  function handleAttendance(status: "attended" | "no_show") {
    if (!booking) return;
    setError(null);
    startTransition(async () => {
      const res = await markPtAttendance(booking.id, status);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refreshAndClose();
    });
  }

  function handleCancel() {
    if (!booking) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelPtBookingAsStaff(booking.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refreshAndClose();
    });
  }

  function handleDeleteBlock() {
    setError(null);
    startTransition(async () => {
      const res = await deletePtBlock(session.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      refreshAndClose();
    });
  }

  function handleReschedule() {
    if (!booking) return;
    setError(null);
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const newStartAt = zonedWallClockToUtc(year, month, day, hour, minute);

    startTransition(async () => {
      const res = await reschedulePtBookingAsStaff(
        booking.id,
        newStartAt.toISOString(),
        { allowOverlap, allowNoTurnaround },
      );
      if (!res.ok) {
        if (res.reason === "pt_overlap") {
          setOverlapConflictAt(res.conflictAt ?? "");
        } else if (res.reason === "pt_no_turnaround") {
          setTurnaroundConflictAt(res.conflictAt ?? "");
        } else {
          setError(res.message);
        }
        return;
      }
      refreshAndClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative w-full max-w-md h-full bg-bg-elevated border-l border-[color:var(--ink-500)] overflow-y-auto p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="absolute top-6 right-6 text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          <X size={20} strokeWidth={1.5} />
        </button>

        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {KIND_LABEL[session.kind]}
        </span>
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-1 pr-10">
          {formatWeekdayDate(start)}
        </h2>
        <p className="text-text-muted text-sm mb-6">
          {formatTimeRange(start, end)}
          {session.status === "cancelled" && (
            <span className="text-[color:var(--danger)]"> · Geannuleerd</span>
          )}
        </p>

        {session.overlapping && (
          <div className="mb-6 p-3 border border-[color:var(--danger)]/40 text-xs text-[color:var(--danger)]">
            {/* COPY: confirm met Marlon */}
            Dit moment overlapt met een andere sessie in de agenda.
          </div>
        )}

        {/* Klant / prospect / block-info */}
        {session.kind === "bookable" && booking && (
          <div className="mb-6 pb-6 border-b border-[color:var(--ink-500)]/60">
            <span className="tmc-eyebrow block mb-2">Klant</span>
            <Link
              href={
                isAdmin
                  ? `/app/admin/leden/${booking.profileId}?tab=schema`
                  : `/app/trainer/klant/${booking.profileId}`
              }
              className="text-text text-base hover:text-accent transition-colors"
            >
              {booking.firstName} {booking.lastName}
            </Link>
            {booking.introduceeName && (
              <p className="text-text-muted text-sm mt-1">
                {/* COPY: confirm met Marlon */}+ introducee:{" "}
                {booking.introduceeName}
              </p>
            )}
            <p className="text-text-muted text-sm mt-3">
              {session.format ? FORMAT_LABEL[session.format] : ""}
              {session.mode ? ` · ${session.mode === "studio" ? "Studio" : "Online"}` : ""}
              {" · "}
              {STATUS_LABEL[booking.status] ?? booking.status}
            </p>
            {session.program && (
              <p className="text-text-muted text-sm mt-1">
                {/* COPY: confirm met Marlon */}
                Onderdeel van 12-weken programma (
                {session.program.type === "studio" ? "studio" : "online"},{" "}
                {session.program.totalSessions} sessies)
              </p>
            )}
          </div>
        )}

        {session.kind === "intake" && session.prospect && (
          <div className="mb-6 pb-6 border-b border-[color:var(--ink-500)]/60">
            <span className="tmc-eyebrow block mb-2">Intake-prospect</span>
            <p className="text-text text-base">{session.prospect.name}</p>
            <p className="text-text-muted text-sm mt-1">
              {session.prospect.email}
              {session.prospect.phone ? ` · ${session.prospect.phone}` : ""}
            </p>
            <p className="text-text-muted/70 text-xs mt-3">
              {/* COPY: confirm met Marlon */}
              Intake-acties (afronden, annuleren) zijn nog niet gebouwd —
              er bestaat nog geen RPC hiervoor.
            </p>
          </div>
        )}

        {session.kind === "block" && (
          <div className="mb-6 pb-6 border-b border-[color:var(--ink-500)]/60">
            <p className="text-text-muted text-sm">
              {/* COPY: confirm met Marlon */}
              Geblokkeerde tijd, niet boekbaar.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={handleDeleteBlock}
              className="mt-4 w-full px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {pending ? "Bezig..." : "Blok verwijderen"}
            </button>
          </div>
        )}

        {/* Acties */}
        {session.kind === "bookable" && booking && mode === "view" && (
          <div className="flex flex-col gap-4">
            {canMarkAttendance && (
              <div>
                <span className="tmc-eyebrow block mb-2">Aanwezigheid</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAttendance("attended")}
                    className="flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border border-[color:var(--success)]/40 text-[color:var(--success)] hover:bg-[color:var(--success)]/10 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    {/* COPY: confirm met Marlon */}
                    Aanwezig
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleAttendance("no_show")}
                    className="flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border border-[color:var(--warning)]/40 text-[color:var(--warning)] hover:bg-[color:var(--warning)]/10 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    {/* COPY: confirm met Marlon */}
                    No-show
                  </button>
                </div>
              </div>
            )}

            {canManage && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setMode("reschedule")}
                  className="flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border border-[color:var(--ink-500)] text-text hover:border-accent hover:text-accent transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  Verzetten
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleCancel}
                  className="flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  Annuleren
                </button>
              </div>
            )}
          </div>
        )}

        {session.kind === "bookable" && booking && mode === "reschedule" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <AdminField label="Nieuwe datum">
                <AdminInput
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setOverlapConflictAt(null);
                    setTurnaroundConflictAt(null);
                  }}
                />
              </AdminField>
              <AdminField label="Nieuwe tijd">
                <AdminInput
                  type="time"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value);
                    setOverlapConflictAt(null);
                    setTurnaroundConflictAt(null);
                  }}
                />
              </AdminField>
            </div>

            {overlapConflictAt !== null && (
              <OverrideWarning
                tone="danger"
                // COPY: confirm met Marlon
                title="Dit moment overlapt met een bestaande sessie."
                detail={
                  overlapConflictAt
                    ? `Conflict rond ${new Date(overlapConflictAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}.`
                    : ""
                }
                checked={allowOverlap}
                onCheckedChange={setAllowOverlap}
                checkboxLabel="Toch verzetten, ik weet dat dit overlapt"
              />
            )}
            {turnaroundConflictAt !== null && (
              <OverrideWarning
                tone="warning"
                // COPY: confirm met Marlon
                title="Geen omkleedtijd tussen de sessies."
                detail={
                  turnaroundConflictAt
                    ? `Te krap rond ${new Date(turnaroundConflictAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}.`
                    : ""
                }
                checked={allowNoTurnaround}
                onCheckedChange={setAllowNoTurnaround}
                checkboxLabel="Toch verzetten, zonder omkleedtijd"
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("view")}
                className="flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] border border-[color:var(--ink-500)] text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Annuleren
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleReschedule}
                className="flex-1 px-3 py-3 text-xs font-medium uppercase tracking-[0.1em] bg-accent text-bg border border-accent hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                {pending ? "Bezig..." : "Bevestig verzetten"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
