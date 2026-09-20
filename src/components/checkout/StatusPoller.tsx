"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PollOutcome } from "@/lib/orders/status-actions";

interface Props {
  /** Gebonden server action die de huidige status ophaalt; zie status-actions.ts. */
  check: () => Promise<PollOutcome>;
  intervalMs?: number;
  timeoutMs?: number;
  /** Tekst tijdens het wachten. */
  pendingLabel: string;
}

/**
 * Pollt de betaalstatus op een returnpagina tot de webhook heeft
 * verwerkt (workstream A, spec-ios-app.md). De pagina zelf is een server
 * component die de status uit de database leest; dit component vraagt die
 * status periodiek opnieuw op via een server action en laat de pagina met
 * router.refresh() opnieuw renderen zodra de status terminaal is. Zo
 * blijft de copy per status op één plek (de pagina) staan.
 *
 * Bron van waarheid is de database, gevuld door de Mollie-webhook. Blijft
 * die uit (Mollie herhaalt tot 26 uur, zie spec-facturatie.md 6.5), dan
 * stopt het pollen na de timeout met een duidelijke melding en een knop om
 * handmatig te verversen; geen oneindige spinner.
 */
export function StatusPoller({
  check,
  intervalMs = 3000,
  timeoutMs = 90_000,
  pendingLabel,
}: Props) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Startmoment pas in het effect gezet: geen impure call tijdens render.
  const startedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (startedAt.current === 0) startedAt.current = Date.now();

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt.current >= timeoutMs) {
        setTimedOut(true);
        return;
      }
      let outcome: PollOutcome = "pending";
      try {
        outcome = await check();
      } catch (err) {
        // Netwerk of server action even niet bereikbaar: gewoon nog eens.
        console.warn("[status-poller] check failed", err);
      }
      if (cancelled) return;
      if (outcome !== "pending") {
        router.refresh();
        return;
      }
      timer = setTimeout(() => void tick(), intervalMs);
    };

    timer = setTimeout(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [check, intervalMs, timeoutMs, router]);

  if (timedOut) {
    return (
      <div
        role="status"
        className="mx-auto mb-8 max-w-md border border-bg-subtle bg-bg-elevated px-6 py-5 text-left"
      >
        {/* COPY: confirm met Marlon */}
        <p className="text-text text-sm font-medium mb-1">
          We hebben nog geen bevestiging van je betaling.
        </p>
        <p className="text-text-muted text-sm leading-relaxed mb-4">
          Dat kan bij sommige banken even duren. Je hoeft niets opnieuw te
          doen: is er betaald, dan wordt het vanzelf verwerkt en krijg je een
          bevestiging per mail. Blijft dit staan, neem dan contact met ons op.
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            startedAt.current = Date.now();
            setTimedOut(false);
            router.refresh();
            setRefreshing(false);
          }}
          className="text-xs uppercase tracking-[0.25em] text-accent hover:underline disabled:opacity-50"
        >
          {/* COPY: confirm met Marlon */}
          Opnieuw controleren
        </button>
      </div>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="mb-8 inline-flex items-center gap-3 text-text-muted text-sm"
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse"
      />
      {pendingLabel}
    </p>
  );
}
