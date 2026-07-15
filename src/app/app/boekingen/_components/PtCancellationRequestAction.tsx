"use client";

import { useState, useTransition } from "react";
import { requestPtCancellation } from "@/lib/member/pt-cancellation-actions";

interface PtCancellationRequestActionProps {
  ptBookingId: string;
  hasPendingCancellation: boolean;
}

/**
 * PT-agenda PR E2: het lid muteert nooit direct, alleen een verzoek dat
 * staf later afhandelt (zie requestPtCancellation). Drie standen:
 * subtiele link -> uitgeklapt redenveld + bevestigstap -> "aangevraagd"
 * status. Vormtaal gespiegeld op UpcomingRow (border-knoppen, uppercase
 * tracking), maar bewust geen prominente rode annuleerknop: dit is een
 * verzoek, geen directe mutatie.
 */
export function PtCancellationRequestAction({
  ptBookingId,
  hasPendingCancellation,
}: PtCancellationRequestActionProps) {
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hasPendingCancellation || submitted) {
    return (
      <div className="flex flex-col items-end gap-1 max-w-[240px] text-right">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
          {/* COPY: confirm met Marlon */}
          Annulering aangevraagd
        </span>
        <p className="text-text-muted text-xs leading-relaxed">
          {/* COPY: confirm met Marlon */}
          Marlon behandelt je verzoek. Tot die tijd blijft de sessie gewoon
          gepland.
        </p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-accent cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        Annulering aanvragen
      </button>
    );
  }

  function doRequest() {
    startTransition(async () => {
      let res;
      try {
        res = await requestPtCancellation(ptBookingId, reason);
      } catch {
        // Zelfde patroon als UpcomingRow: de fetch zelf kan falen (bv.
        // offline in de PWA), dat is geen { ok: false } maar een thrown
        // exception. Vang 'm hier af zodat de inline foutmelding werkt.
        setError(
          "Geen verbinding. Controleer je internet en probeer het opnieuw.",
        );
        return;
      }
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSubmitted(true);
      setExpanded(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-3 w-full max-w-[260px]">
      <p className="text-text-muted text-xs leading-relaxed text-right">
        {/* COPY: confirm met Marlon */}
        Dit is een verzoek, geen directe annulering. Je sessie blijft gepland
        tot Marlon heeft beslist.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={2000}
        placeholder="Reden (optioneel)"
        rows={3}
        disabled={pending}
        className="w-full bg-transparent border border-text-muted/30 px-3 py-2 text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-accent disabled:opacity-50"
      />
      {error && (
        <p role="alert" className="text-[color:var(--danger)] text-xs">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
          }}
          disabled={pending}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Terug
        </button>
        <button
          type="button"
          onClick={doRequest}
          disabled={pending}
          className="px-4 py-2 border border-text-muted/30 uppercase tracking-[0.18em] text-[11px] font-medium transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig" : "Verzoek versturen"}
        </button>
      </div>
    </div>
  );
}
