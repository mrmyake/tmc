"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveTrainerHours,
  rejectTrainerHours,
} from "@/lib/admin/trainer-actions";
import { formatShortDate } from "@/lib/format-date";
import { Chip } from "@/components/ui/Chip";
import type { TrainerHoursRow as TrainerHoursData } from "@/lib/admin/trainer-query";

interface HoursRowProps {
  row: TrainerHoursData;
}

export function HoursRow({ row }: HoursRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveTrainerHours(row.id);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  function reject() {
    if (!reason.trim()) {
      setError("Geef een reden op.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await rejectTrainerHours(row.id, reason);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  const date = new Date(`${row.workDate}T00:00:00Z`);

  return (
    <article className="py-4 border-b border-[color:var(--ink-500)]/40 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-text text-sm">
            <span className="tabular-nums font-medium">
              {row.hours.toFixed(1)}u
            </span>{" "}
            op {formatShortDate(date)}
          </p>
          {row.notes && (
            <p className="text-text-muted text-xs mt-1 leading-relaxed">
              {row.notes}
            </p>
          )}
          {row.status === "rejected" && row.rejectionReason && (
            <p className="text-[color:var(--danger)] text-xs mt-1">
              Afgewezen: {row.rejectionReason}
            </p>
          )}
          {row.status === "approved" && row.approvedByName && (
            <p className="text-text-muted text-xs mt-1">
              Goedgekeurd door {row.approvedByName}
            </p>
          )}
        </div>
        <StatusChip status={row.status} />
      </div>

      {row.status === "pending" && !rejectMode && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--success)]/40 text-[color:var(--success)] hover:bg-[color:var(--success)]/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {pending ? "Bezig" : "Keur goed"}
          </button>
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Afwijzen
          </button>
        </div>
      )}

      {row.status === "pending" && rejectMode && (
        <div className="flex flex-col gap-2 mt-1">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reden voor afwijzing"
            className="bg-bg border border-[color:var(--ink-500)] px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending || !reason.trim()}
              className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] border border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {pending ? "Bezig" : "Bevestig afwijzing"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false);
                setReason("");
              }}
              className="text-[11px] uppercase tracking-[0.16em] text-text-muted hover:text-text transition-colors px-3 cursor-pointer"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-[color:var(--danger)]">
          {error}
        </p>
      )}
    </article>
  );
}

function StatusChip({ status }: { status: "pending" | "approved" | "rejected" }) {
  if (status === "approved") return <Chip tone="success">Goedgekeurd</Chip>;
  if (status === "rejected") return <Chip tone="danger">Afgewezen</Chip>;
  return <Chip tone="accent">In behandeling</Chip>;
}
