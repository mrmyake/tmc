"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { TrialRow } from "@/lib/admin/attendance-actions";
import { adminCancelTrialBooking, retryPaymentRefund } from "@/lib/admin/trial-booking-actions";
import { AvatarBubble } from "./AvatarBubble";

// COPY: confirm met Marlon
const REFUND_LABEL: Record<TrialRow["refund"] extends infer R ? (R extends { status: infer S } ? S & string : never) : never, { label: string; tone: ChipTone }> = {
  requested: { label: "Terugbetaling aangevraagd", tone: "warning" },
  queued: { label: "Terugbetaling in wachtrij", tone: "warning" },
  pending: { label: "Terugbetaling onderweg", tone: "accent" },
  processing: { label: "Terugbetaling onderweg", tone: "accent" },
  refunded: { label: "Terugbetaald", tone: "success" },
  failed: { label: "Terugbetaling mislukt", tone: "danger" },
  canceled: { label: "Terugbetaling vervallen", tone: "muted" },
};

function euro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} euro`;
}

/**
 * Proeflessen op de sessie-detailpagina en in het rooster-zijpaneel, naast
 * leden en gasten (spec-community-growth.md §1 "Annulering door de
 * studio"). Alleen tonen en, voor admins, annuleren met verplichte reden en
 * de terugbetaling opnieuw indienen. Geen aanwezigheidsmodel.
 */
export function TrialBookingsBlock({
  trials: initialTrials,
  sessionId,
  canManage,
}: {
  trials: TrialRow[];
  sessionId: string;
  canManage: boolean;
}) {
  const [trials, setTrials] = useState<TrialRow[]>(initialTrials);
  const [cancelFor, setCancelFor] = useState<TrialRow | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Nieuwe props na een refetch van de ouder (selfFetch in het rooster-
  // zijpaneel): state afleiden tijdens de render, geen effect.
  const [syncedTrials, setSyncedTrials] = useState(initialTrials);
  if (syncedTrials !== initialTrials) {
    setSyncedTrials(initialTrials);
    setTrials(initialTrials);
  }

  useEffect(() => {
    if (cancelFor && dialogRef.current) dialogRef.current.showModal();
  }, [cancelFor]);

  const active = trials.filter((t) => t.status !== "cancelled");
  const cancelled = trials.filter((t) => t.status === "cancelled");
  if (trials.length === 0) return null;

  function openCancel(t: TrialRow) {
    setReason("");
    setMessage(null);
    setCancelFor(t);
  }

  function closeCancel() {
    dialogRef.current?.close();
    setCancelFor(null);
  }

  function confirmCancel() {
    if (!cancelFor) return;
    const target = cancelFor;
    startTransition(async () => {
      const res = await adminCancelTrialBooking({
        trialBookingId: target.trialBookingId,
        reason,
        sessionId,
      });
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) {
        setTrials((prev) =>
          prev.map((t) =>
            t.trialBookingId === target.trialBookingId
              ? {
                  ...t,
                  status: "cancelled",
                  cancelledAt: new Date().toISOString(),
                  cancellationReason: reason.trim(),
                  refund:
                    t.pricePaidCents > 0
                      ? {
                          refundId: "",
                          status: res.message.includes("niet bij Mollie") ? "failed" : "pending",
                          amountCents: t.pricePaidCents,
                          requestedAt: new Date().toISOString(),
                          lastError: null,
                          retryable: res.message.includes("niet bij Mollie"),
                        }
                      : null,
                }
              : t,
          ),
        );
        closeCancel();
      }
    });
  }

  function retry(t: TrialRow) {
    if (!t.refund?.refundId) return;
    const refundId = t.refund.refundId;
    startTransition(async () => {
      const res = await retryPaymentRefund({ refundId, sessionId });
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) {
        setTrials((prev) =>
          prev.map((x) =>
            x.trialBookingId === t.trialBookingId && x.refund
              ? { ...x, refund: { ...x.refund, status: "pending", retryable: false, lastError: null } }
              : x,
          ),
        );
      }
    });
  }

  function RefundChip({ t }: { t: TrialRow }) {
    if (!t.refund) return null;
    const meta = REFUND_LABEL[t.refund.status];
    return (
      <span className="inline-flex items-center gap-3">
        <Chip tone={meta.tone} title={t.refund.lastError ?? undefined}>
          {meta.label} ({euro(t.refund.amountCents)})
        </Chip>
        {canManage && t.refund.retryable && t.refund.refundId && (
          <button
            type="button"
            onClick={() => retry(t)}
            disabled={pending}
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent hover:underline disabled:opacity-50 cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            Terugbetaling opnieuw proberen
          </button>
        )}
      </span>
    );
  }

  return (
    <>
      {active.length > 0 && (
        <div className="mb-8">
          <span className="tmc-eyebrow block mb-4">
            {/* COPY: confirm met Marlon */}
            Proeflessen ({active.length})
          </span>
          <ul className="flex flex-col divide-y divide-[color:var(--ink-500)]/60">
            {active.map((t) => (
              <li key={t.trialBookingId} className="flex flex-wrap items-center gap-4 py-5">
                <AvatarBubble
                  firstName={t.name.split(" ")[0] ?? t.name}
                  lastName={t.name.split(" ").slice(1).join(" ")}
                  avatarUrl={null}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm font-medium truncate">{t.name}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent border border-accent/40 px-2 py-0.5">
                      {/* COPY: confirm met Marlon */}
                      {t.isFree ? "Proefles via code" : `Proefles ${euro(t.pricePaidCents)}`}
                    </span>
                    {t.isTest && (
                      <Chip tone="muted">
                        {/* COPY: confirm met Marlon */}
                        Test
                      </Chip>
                    )}
                    {t.status !== "paid" && <StatusBadge status={t.status === "attended" ? "attended" : "no_show"} />}
                  </div>
                </div>
                {canManage && t.status === "paid" && (
                  <button
                    type="button"
                    onClick={() => openCancel(t)}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 border border-[color:var(--danger)]/40 text-[color:var(--danger)] text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-2 hover:bg-[color:var(--danger)]/10 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {/* COPY: confirm met Marlon */}
                    Annuleren
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="mb-8" open={cancelled.some((t) => t.refund && t.refund.status !== "refunded")}>
          <summary className="tmc-eyebrow cursor-pointer text-text-muted hover:text-text transition-colors">
            {/* COPY: confirm met Marlon */}
            Geannuleerde proeflessen ({cancelled.length})
          </summary>
          <ul className="mt-4 flex flex-col divide-y divide-[color:var(--ink-500)]/40">
            {cancelled.map((t) => (
              <li key={t.trialBookingId} className="flex flex-wrap items-center gap-4 py-3">
                <span className="text-sm text-text-muted">{t.name}</span>
                {t.cancellationReason && (
                  <span className="text-xs text-text-muted/70 truncate max-w-[40ch]" title={t.cancellationReason}>
                    {t.cancellationReason}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-3">
                  <RefundChip t={t} />
                  <StatusBadge status="cancelled" />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {message && (
        <p
          role={message.tone === "success" ? "status" : "alert"}
          className={`mb-6 text-sm ${
            message.tone === "success" ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
          }`}
        >
          {message.text}
        </p>
      )}

      {canManage && cancelFor && (
        <dialog
          ref={dialogRef}
          onClose={closeCancel}
          className="bg-bg border border-[color:var(--ink-500)] text-text p-8 w-[min(92vw,480px)] backdrop:bg-bg/55 backdrop:backdrop-blur-sm"
        >
          <h3 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl tracking-[-0.01em] mb-2">
            {/* COPY: confirm met Marlon */}
            Proefles annuleren
          </h3>
          <p className="text-text-muted text-sm mb-6">
            {/* COPY: confirm met Marlon */}
            Voor {cancelFor.name}. De plek komt vrij en de bezoeker krijgt een mail met de reden.
            {cancelFor.isFree
              ? " De proefcode is daarna weer te gebruiken."
              : ` Het betaalde bedrag (${euro(cancelFor.pricePaidCents)}) wordt volledig teruggestort via Mollie.`}
          </p>
          <label className="flex flex-col gap-2 mb-6">
            {/* COPY: confirm met Marlon */}
            <span className="tmc-eyebrow">Reden (verplicht, gaat in de mail)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              // COPY: confirm met Marlon
              placeholder="Bv. de les gaat niet door, of dubbel geboekt"
              className="bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-sm text-text focus:outline-none focus:border-accent resize-none"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeCancel}
              className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              Terug
            </button>
            <button
              type="button"
              onClick={confirmCancel}
              disabled={pending || !reason.trim()}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-[color:var(--danger)] text-bg border border-[color:var(--danger)] transition-all duration-500 hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {pending ? "Bezig" : "Annuleer proefles"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
