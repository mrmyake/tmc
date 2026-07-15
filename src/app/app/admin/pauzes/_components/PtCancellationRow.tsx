"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolvePtCancellation } from "@/lib/admin/pt-cancellation-actions";
import {
  formatRelativeWhen,
  formatTimeRange,
  formatWeekdayDate,
} from "@/lib/format-date";

interface PtCancellationRowProps {
  requestId: string;
  firstName: string;
  lastName: string;
  email: string;
  profileId: string | null;
  sessionLabel: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  hasCredit: boolean;
  creditLabel: string;
  withinWindow: boolean;
  cancelWindowHours: number;
  createdAt: string;
}

/**
 * PT-agenda PR E2: rij voor een openstaand PT-annuleer-verzoek in het
 * admin-dashboard, naast de pauze-aanvragen. Spiegelt PauseRow qua
 * opmaak en interactiepatroon (useTransition, error via role="alert",
 * router.refresh() na succes al dan niet nodig want de action
 * revalidate't zelf /app/admin/pauzes).
 *
 * De KERN is de restitutie-keuze bij een boeking met verrekende credit:
 * twee keuzeknoppen (zelfde consequentie-copy als het annuleerpaneel in
 * de trainer-agenda), voor-geselecteerd op basis van het
 * annuleringsvenster, gevolgd door een expliciete bevestigknop. Zonder
 * verrekende credit is er geen schijnkeuze: alleen "Goedkeuren".
 */
export function PtCancellationRow({
  requestId,
  firstName,
  lastName,
  email,
  profileId,
  sessionLabel,
  startAt,
  endAt,
  reason,
  hasCredit,
  creditLabel,
  withinWindow,
  cancelWindowHours,
  createdAt,
}: PtCancellationRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [withRestitution, setWithRestitution] = useState(withinWindow);
  const [error, setError] = useState<string | null>(null);

  const start = new Date(startAt);
  const end = new Date(endAt);
  const name =
    [firstName, lastName].filter(Boolean).join(" ") || email || "Lid";

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await resolvePtCancellation({
        requestId,
        approve: true,
        ...(hasCredit ? { withRestitution } : {}),
      });
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  function confirmReject() {
    setError(null);
    startTransition(async () => {
      const res = await resolvePtCancellation({
        requestId,
        approve: false,
        note: rejectNote.trim() || undefined,
      });
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

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
          <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted/80">
            Aangevraagd {formatRelativeWhen(new Date(createdAt))}
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-2 mt-3">
          <div>
            <dt className="tmc-eyebrow">Sessie</dt>
            <dd className="text-sm text-text mt-1">
              {sessionLabel}
              <br />
              {formatWeekdayDate(start)} · {formatTimeRange(start, end)}
            </dd>
          </div>
          <div>
            <dt className="tmc-eyebrow">Reden van het lid</dt>
            <dd className="text-sm text-text mt-1">
              {/* COPY: confirm met Marlon */}
              {reason || "Geen reden opgegeven"}
            </dd>
          </div>
          <div>
            <dt className="tmc-eyebrow">Annuleringsvenster</dt>
            <dd className="text-sm text-text mt-1">
              {/* COPY: confirm met Marlon */}
              {withinWindow
                ? `Binnen het annuleringsvenster van ${cancelWindowHours} uur`
                : `Buiten het annuleringsvenster van ${cancelWindowHours} uur`}
            </dd>
          </div>
        </dl>
        {error && (
          <p role="alert" className="mt-3 text-xs text-[color:var(--danger)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 md:items-end md:w-[280px]">
        {!rejectMode ? (
          <div className="flex flex-col gap-2 w-full">
            {hasCredit ? (
              <>
                <button
                  type="button"
                  onClick={() => setWithRestitution(true)}
                  className={`w-full text-left px-4 py-3 border transition-colors cursor-pointer ${
                    withRestitution
                      ? "border-accent text-accent"
                      : "border-[color:var(--ink-500)] text-text hover:border-accent hover:text-accent"
                  }`}
                >
                  {/* COPY: confirm met Marlon */}
                  <span className="block text-xs font-medium uppercase tracking-[0.1em]">
                    Goedkeuren met restitutie
                  </span>
                  <span className="block text-sm text-text-muted mt-1">
                    {firstName || name} krijgt 1 {creditLabel} terug.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setWithRestitution(false)}
                  className={`w-full text-left px-4 py-3 border transition-colors cursor-pointer ${
                    !withRestitution
                      ? "border-accent text-accent"
                      : "border-[color:var(--ink-500)] text-text hover:border-accent hover:text-accent"
                  }`}
                >
                  {/* COPY: confirm met Marlon */}
                  <span className="block text-xs font-medium uppercase tracking-[0.1em]">
                    Goedkeuren zonder restitutie
                  </span>
                  <span className="block text-sm text-text-muted mt-1">
                    Er gaat geen credit terug.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={approve}
                  disabled={pending}
                  className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  {pending ? "Bezig" : "Bevestig goedkeuring"}
                </button>
              </>
            ) : (
              <>
                <p className="text-text-muted text-sm">
                  {/* COPY: confirm met Marlon */}
                  Voor deze boeking is geen credit verrekend. Er wordt niets
                  terugbetaald of verrekend.
                </p>
                <button
                  type="button"
                  onClick={approve}
                  disabled={pending}
                  className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  {pending ? "Bezig" : "Goedkeuren"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={pending}
              className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Afwijzen
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            <label className="flex flex-col gap-1.5">
              {/* COPY: confirm met Marlon */}
              <span className="tmc-eyebrow">Toelichting (optioneel)</span>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Korte toelichting voor het lid"
                rows={3}
                className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent resize-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmReject}
                disabled={pending}
                className="inline-flex items-center justify-center px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/60 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                {pending ? "Bezig" : "Bevestig afwijzing"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectMode(false);
                  setRejectNote("");
                }}
                className="text-[11px] uppercase tracking-[0.16em] text-text-muted hover:text-text transition-colors px-3 cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Terug
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
