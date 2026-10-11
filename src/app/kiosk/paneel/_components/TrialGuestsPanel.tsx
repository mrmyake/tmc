"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, RefreshCw, UserX } from "lucide-react";
import {
  kioskListTodayTrialGuests,
  kioskMarkTrialAttendance,
  type KioskTrialGuestRow,
} from "@/lib/kiosk/trial-attendance-actions";
import { trialSourceLabel } from "@/lib/opening-trial/rules";

const TIME_FMT = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Proefgasten van vandaag op het kioskpaneel, naast de ledencheck-in. Een
 * proefgast heeft geen profiel en staat dus niet in de zoeklijst; hier vinkt
 * de staf hem af (paid naar attended), draait dat terug, of markeert een
 * no-show en herstelt die. Label per bron: "Proefles, gratis"
 * (openingsperiode), "Proefles via code" of "Proefles". Zelfde kern als de
 * sessie-detailpagina's (markTrialAttendanceCore), zodat beide weergaven
 * hetzelfde laten zien.
 */
export function TrialGuestsPanel() {
  const [rows, setRows] = useState<KioskTrialGuestRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function refresh() {
    startTransition(async () => {
      setRows(await kioskListTodayTrialGuests());
    });
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, []);

  function setStatus(row: KioskTrialGuestRow, status: KioskTrialGuestRow["status"]) {
    const previous = row.status;
    setRows((prev) =>
      prev.map((r) => (r.trialBookingId === row.trialBookingId ? { ...r, status } : r)),
    );
    setMessage(null);
    startTransition(async () => {
      const res = await kioskMarkTrialAttendance({
        sessionId: row.sessionId,
        trialBookingId: row.trialBookingId,
        status,
      });
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.trialBookingId === row.trialBookingId ? { ...r, status: previous } : r,
          ),
        );
        setMessage({ tone: "error", text: res.message });
        return;
      }
      setMessage({ tone: "success", text: res.message });
      window.setTimeout(() => setMessage(null), 2500);
    });
  }

  return (
    <section aria-labelledby="trial-guests-title" className="flex flex-col min-h-0">
      <div className="flex items-baseline justify-between mb-5">
        <h2
          id="trial-guests-title"
          className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text"
        >
          {/* COPY: confirm met Marlon */}
          Proefgasten vandaag
          <span className="ml-3 text-text-muted text-sm">({rows.length})</span>
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          aria-label="Ververs proefgasten"
          className="w-9 h-9 flex items-center justify-center text-text-muted hover:text-accent transition-colors duration-300 cursor-pointer"
        >
          <RefreshCw size={16} strokeWidth={1.5} />
        </button>
      </div>
      <div className="border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60">
        {rows.length === 0 ? (
          <p className="py-8 text-text-muted text-sm">
            {/* COPY: confirm met Marlon */}
            Geen proefgasten vandaag.
          </p>
        ) : (
          rows.map((r) => {
            const isAttended = r.status === "attended";
            const isNoShow = r.status === "no_show";
            return (
              <div key={r.trialBookingId} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-text text-sm truncate">
                    {r.name}
                    {r.isTest && (
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-text-muted border border-text-muted/40 px-1.5 py-0.5">
                        {/* COPY: confirm met Marlon */}
                        Test
                      </span>
                    )}
                  </p>
                  <p className="text-text-muted text-[11px]">
                    {TIME_FMT.format(new Date(r.startAt))} tot {TIME_FMT.format(new Date(r.endAt))} ·{" "}
                    {r.className} · {trialSourceLabel({ source: r.source, status: r.status })}
                    {isAttended && (
                      <span className="ml-2 text-[color:var(--success)] uppercase tracking-[0.18em]">
                        {/* COPY: confirm met Marlon */}
                        Aanwezig
                      </span>
                    )}
                    {isNoShow && (
                      <span className="ml-2 text-[color:var(--danger)] uppercase tracking-[0.18em]">
                        {/* COPY: confirm met Marlon */}
                        No-show
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus(r, isAttended ? "paid" : "attended")}
                    disabled={pending}
                    aria-pressed={isAttended}
                    aria-label={
                      isAttended
                        ? `Markeer ${r.name} als niet aanwezig`
                        : `Check ${r.name} in`
                    }
                    className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-colors duration-300 cursor-pointer disabled:opacity-50 ${
                      isAttended
                        ? "bg-[color:var(--success)] border-[color:var(--success)] text-bg"
                        : "bg-transparent border-text-muted/40 text-text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    <Check size={20} strokeWidth={2.2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(r, isNoShow ? "paid" : "no_show")}
                    disabled={pending}
                    aria-pressed={isNoShow}
                    aria-label={
                      isNoShow ? `Herstel status voor ${r.name}` : `Markeer ${r.name} als no-show`
                    }
                    className={`w-9 h-9 rounded-full border flex items-center justify-center transition-colors duration-300 cursor-pointer disabled:opacity-50 ${
                      isNoShow
                        ? "bg-[color:var(--danger)]/10 border-[color:var(--danger)]/60 text-[color:var(--danger)]"
                        : "bg-transparent border-text-muted/30 text-text-muted hover:border-[color:var(--danger)]/60 hover:text-[color:var(--danger)]"
                    }`}
                  >
                    <UserX size={15} strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {message && (
        <p
          role={message.tone === "success" ? "status" : "alert"}
          className={`mt-3 text-sm ${
            message.tone === "success" ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
