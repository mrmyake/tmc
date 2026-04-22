"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { overrideNoShow } from "@/lib/admin/member-actions";
import { formatTimeRange, formatShortDate } from "@/lib/format-date";
import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";
import type { MemberBookingRow } from "@/lib/admin/member-detail-query";

interface AdminBookingRowProps {
  profileId: string;
  booking: MemberBookingRow;
  allowOverride: boolean;
}

export function AdminBookingRow({
  profileId,
  booking,
  allowOverride,
}: AdminBookingRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = booking.startAt ? new Date(booking.startAt) : null;
  const end = booking.endAt ? new Date(booking.endAt) : null;

  function override(next: "attended" | "booked" | "no_show") {
    setError(null);
    startTransition(async () => {
      const res = await overrideNoShow({
        profileId,
        bookingId: booking.id,
        newStatus: next,
      });
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  return (
    <article className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto] items-start gap-5 py-5 border-b border-[color:var(--ink-500)]/60">
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="tmc-eyebrow text-text-muted/80">
          {start ? formatShortDate(start) : "—"}
          {start && end ? ` · ${formatTimeRange(start, end)}` : ""}
        </span>
        <h3 className="text-text text-base leading-snug truncate">
          {booking.className}
        </h3>
        <p className="text-text-muted text-xs">
          {booking.trainerName}
          {booking.creditsUsed > 0 ? " · 1 credit gebruikt" : ""}
        </p>
        <Link
          href={`/app/admin/sessies/${booking.sessionId}`}
          className="text-[11px] uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors mt-1"
        >
          Deelnemerslijst
        </Link>
        {error && (
          <p role="alert" className="text-xs text-[color:var(--danger)] mt-1">
            {error}
          </p>
        )}
      </div>

      <span className="hidden md:inline-flex items-center pt-1">
        <StatusBadge status={booking.status as SessionStatus} />
      </span>

      {allowOverride && booking.status !== "cancelled" ? (
        <div className="flex flex-col items-end gap-2">
          <span className="md:hidden">
            <StatusBadge status={booking.status as SessionStatus} />
          </span>
          <div
            role="group"
            aria-label="Status override"
            className="inline-flex flex-wrap justify-end gap-1.5"
          >
            <OverrideButton
              active={booking.status === "attended"}
              onClick={() => override("attended")}
              disabled={pending}
              tone="success"
            >
              Aanwezig
            </OverrideButton>
            <OverrideButton
              active={booking.status === "booked"}
              onClick={() => override("booked")}
              disabled={pending}
            >
              Open
            </OverrideButton>
            <OverrideButton
              active={booking.status === "no_show"}
              onClick={() => override("no_show")}
              disabled={pending}
              tone="danger"
            >
              No-show
            </OverrideButton>
          </div>
        </div>
      ) : (
        <span className="md:hidden">
          <StatusBadge status={booking.status as SessionStatus} />
        </span>
      )}
    </article>
  );
}

function OverrideButton({
  children,
  onClick,
  active,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  tone?: "success" | "danger";
}) {
  const activeClass =
    tone === "success"
      ? "border-[color:var(--success)] text-[color:var(--success)]"
      : tone === "danger"
        ? "border-[color:var(--danger)] text-[color:var(--danger)]"
        : "border-accent text-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] border transition-colors duration-300 cursor-pointer ${
        active
          ? activeClass
          : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
      } disabled:opacity-50 disabled:pointer-events-none`}
    >
      {children}
    </button>
  );
}
