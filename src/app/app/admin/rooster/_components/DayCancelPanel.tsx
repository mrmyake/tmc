"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import {
  adminCancelDay,
  adminPreviewDayCancellation,
  type AdminActionResult,
  type DayCancellationPreview,
} from "@/lib/admin/session-actions";
import { formatTime, formatWeekdayDateHeading } from "@/lib/format-date";

interface DayCancelPanelProps {
  /** Amsterdamse datum "yyyy-mm-dd", of null als het paneel dicht is. */
  isoDate: string | null;
  onClose: () => void;
}

const clubEase: [number, number, number, number] = [0.2, 0.7, 0.1, 1];

/**
 * Alle nog niet begonnen lessen op een dag annuleren, bv. bij een feestdag
 * (spec-session-overrides.md). Toont eerst wat er geraakt wordt, uit de
 * alleen-lezen RPC admin_preview_day_cancellation, en vraagt een reden.
 */
export function DayCancelPanel({ isoDate, onClose }: DayCancelPanelProps) {
  const [pending, startTransition] = useTransition();
  // Voorbeeld hoort bij een datum; een oud antwoord voor een andere dag
  // telt niet, zodat er geen reset in een effect nodig is.
  const [loaded, setLoaded] = useState<{
    date: string;
    preview: DayCancellationPreview | null;
    error: string | null;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AdminActionResult | null>(null);

  const open = Boolean(isoDate);
  const current = loaded && loaded.date === isoDate ? loaded : null;
  const preview = current?.preview ?? null;
  const loadError = current?.error ?? null;

  useEffect(() => {
    if (!isoDate) return;
    let stale = false;
    adminPreviewDayCancellation(isoDate).then((res) => {
      if (stale) return;
      setLoaded(
        res.ok
          ? { date: isoDate, preview: res.preview, error: null }
          : { date: isoDate, preview: null, error: res.message },
      );
    });
    return () => {
      stale = true;
    };
  }, [isoDate]);

  function close() {
    setReason("");
    setResult(null);
    setLoaded(null);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function confirm() {
    if (!isoDate || !reason.trim()) return;
    startTransition(async () => {
      const res = await adminCancelDay({ isoDate, reason: reason.trim() });
      setResult(res);
      if (res.ok) window.setTimeout(close, 1800);
    });
  }

  const dateLabel = isoDate ? formatWeekdayDateHeading(new Date(`${isoDate}T12:00:00Z`)) : "";
  const nothingToCancel = preview !== null && preview.sessionCount === 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Sluit"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: clubEase }}
            className="fixed inset-0 z-40 bg-bg/55 backdrop-blur-sm cursor-default"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-cancel-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: clubEase }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[560px] bg-bg border-l border-[color:var(--ink-500)] flex flex-col text-text"
          >
            <div className="flex items-start justify-between p-8">
              <span className="tmc-eyebrow tmc-eyebrow--accent">
                {/* COPY: confirm met Marlon */}
                Dag annuleren
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Sluit paneel"
                className="text-text-muted transition-colors duration-300 hover:text-text cursor-pointer"
              >
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-8 pb-6 flex-1 overflow-y-auto">
              <h2
                id="day-cancel-title"
                className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl leading-[1.05] tracking-[-0.02em] mb-6"
              >
                {dateLabel}
              </h2>

              {!preview && !loadError && (
                <p className="text-text-muted text-sm">
                  {/* COPY: confirm met Marlon */}
                  Overzicht laden...
                </p>
              )}
              {loadError && (
                <p role="alert" className="text-sm text-[color:var(--danger)]">
                  {loadError}
                </p>
              )}

              {preview && (
                <>
                  {nothingToCancel ? (
                    <p className="text-text-muted text-sm mb-6">
                      {/* COPY: confirm met Marlon */}
                      Er zijn op deze dag geen lessen meer die nog moeten
                      beginnen.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-text-muted leading-relaxed mb-6">
                        {/* COPY: confirm met Marlon */}
                        Deze lessen worden geannuleerd. Leden, wachtlijst en
                        gasten krijgen bericht; tegoed, abonnementsplekken en
                        gastpassen komen terug, en betaalde proeflessen worden
                        terugbetaald.
                      </p>

                      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mb-8 text-sm">
                        {/* COPY: confirm met Marlon */}
                        <Count label="Lessen" value={preview.sessionCount} />
                        {/* COPY: confirm met Marlon */}
                        <Count label="Boekingen" value={preview.bookingCount} />
                        {/* COPY: confirm met Marlon */}
                        <Count label="Wachtlijst" value={preview.waitlistCount} />
                        {/* COPY: confirm met Marlon */}
                        <Count label="Gasten" value={preview.guestCount} />
                        {/* COPY: confirm met Marlon */}
                        <Count label="Proeflessen" value={preview.trialCount} />
                      </dl>

                      <ul className="mb-8 flex flex-col gap-1 text-sm">
                        {preview.sessions.map((s) => (
                          <li key={s.id} className="text-text-muted">
                            <span className="text-text">
                              {formatTime(new Date(s.startAt))}
                            </span>{" "}
                            {s.className ?? "Sessie"}
                          </li>
                        ))}
                      </ul>

                      {preview.startedOrPastCount > 0 && (
                        <p className="text-xs text-text-muted mb-6">
                          {/* COPY: confirm met Marlon */}
                          {preview.startedOrPastCount} les(sen) op deze dag zijn
                          al begonnen of voorbij en blijven ongewijzigd.
                        </p>
                      )}

                      <AdminField label="Reden">
                        <AdminInput
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          // COPY: confirm met Marlon
                          placeholder="Bv. feestdag"
                          disabled={pending}
                        />
                      </AdminField>
                    </>
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
              {preview && !nothingToCancel && (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || !reason.trim() || Boolean(result?.ok)}
                  className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-[color:var(--danger)]/60 text-[color:var(--danger)] transition-colors hover:bg-[color:var(--danger)]/10 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {pending
                    ? "Bezig"
                    : // COPY: confirm met Marlon
                      `Bevestig: ${preview.sessionCount} les(sen) annuleren`}
                </button>
              )}
              <button
                type="button"
                onClick={close}
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

function Count({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text text-right tabular-nums">{value}</dd>
    </>
  );
}
