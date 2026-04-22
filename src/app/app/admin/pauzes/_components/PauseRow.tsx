"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  approveMembershipPause,
  rejectMembershipPause,
} from "@/lib/admin/pauses-actions";
import { formatShortDate, formatRelativeWhen } from "@/lib/format-date";

interface PauseRowProps {
  pauseId: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  profileId: string | null;
  planLabel: string;
  startDate: string;
  endDate: string;
  reasonLabel: string;
  attestUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export function PauseRow({
  pauseId,
  firstName,
  lastName,
  email,
  profileId,
  planLabel,
  startDate,
  endDate,
  reasonLabel,
  attestUrl,
  notes,
  createdAt,
}: PauseRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveMembershipPause(pauseId);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  function confirmReject() {
    if (!rejectReason.trim()) {
      setError("Geef een reden op.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await rejectMembershipPause(pauseId, rejectReason);
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  const name =
    [firstName, lastName].filter(Boolean).join(" ") || email || "Lid";

  return (
    <article className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 py-6 border-b border-[color:var(--ink-500)]/40">
      <div>
        <div className="flex items-baseline gap-3 flex-wrap">
          {profileId ? (
            <Link
              href={`/app/admin/leden/${profileId}`}
              className="text-text text-base font-medium hover:text-accent transition-colors"
            >
              {name}
            </Link>
          ) : (
            <span className="text-text text-base font-medium">{name}</span>
          )}
          <span className="tmc-eyebrow">{planLabel}</span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted/80">
            Aangevraagd {formatRelativeWhen(new Date(createdAt))}
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-2 mt-3">
          <div>
            <dt className="tmc-eyebrow">Periode</dt>
            <dd className="text-sm text-text mt-1">
              {formatShortDate(new Date(`${startDate}T00:00:00Z`))} &rarr;{" "}
              {formatShortDate(new Date(`${endDate}T00:00:00Z`))}
            </dd>
          </div>
          <div>
            <dt className="tmc-eyebrow">Reden</dt>
            <dd className="text-sm text-text mt-1">{reasonLabel}</dd>
          </div>
          <div>
            <dt className="tmc-eyebrow">Bijlage</dt>
            <dd className="text-sm text-text mt-1">
              {attestUrl ? (
                <a
                  href={attestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-text-muted hover:text-accent transition-colors"
                >
                  <ExternalLink size={12} strokeWidth={1.8} aria-hidden />
                  Attest bekijken
                </a>
              ) : (
                <span className="text-text-muted">Geen</span>
              )}
            </dd>
          </div>
        </dl>
        {notes && (
          <p className="mt-3 text-text-muted text-sm leading-relaxed">
            {notes}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs text-[color:var(--danger)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 md:items-end min-w-[200px]">
        {!rejectMode ? (
          <>
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {pending ? "Bezig" : "Goedkeuren"}
            </button>
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={pending}
              className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Afwijzen
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2 w-full md:max-w-sm">
            <label className="flex flex-col gap-1.5">
              <span className="tmc-eyebrow">Reden van afwijzing</span>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Korte toelichting voor het lid"
                className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmReject}
                disabled={pending || !rejectReason.trim()}
                className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {pending ? "Bezig" : "Bevestig afwijzing"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectMode(false);
                  setRejectReason("");
                }}
                className="text-[11px] uppercase tracking-[0.16em] text-text-muted hover:text-text transition-colors px-3 cursor-pointer"
              >
                Terug
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
