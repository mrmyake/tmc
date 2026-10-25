"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getExtraClassBookingState,
  type ExtraClassBookingState,
} from "@/lib/member/extra-class-actions";

/**
 * Terugkeer van de Mollie-checkout van een extra les
 * (/app/boekingen?extra=<bookingId>, spec-weekcap-extra-les.md). De webhook
 * zet de rij op booked of cancelled; dit blok vraagt de status elke drie
 * seconden op tot die terminaal is, en ververst dan de pagina zodat de
 * boeking in de lijst staat. Na een minuut stopt het pollen met een
 * duidelijke tekst; geen oneindige spinner (zelfde patroon als StatusPoller).
 */
export function ExtraClassReturnNotice({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ExtraClassBookingState>("pending");
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (startedAt.current === 0) startedAt.current = Date.now();

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt.current >= 60_000) {
        setTimedOut(true);
        return;
      }
      let next: ExtraClassBookingState = "pending";
      try {
        next = await getExtraClassBookingState(bookingId);
      } catch (err) {
        console.warn("[extra-class-return] check failed", err);
      }
      if (cancelled) return;
      if (next !== "pending") {
        setState(next);
        router.refresh();
        return;
      }
      timer = setTimeout(tick, 3000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [bookingId, router]);

  const tone =
    state === "booked"
      ? "border-[color:var(--success)]/40 text-[color:var(--success)]"
      : state === "cancelled"
        ? "border-[color:var(--danger)]/40 text-[color:var(--danger)]"
        : "border-[color:var(--ink-500)] text-text-muted";

  return (
    <div role="status" className={`mb-10 text-sm p-4 border ${tone}`}>
      {state === "booked" && (
        <>
          {/* COPY: confirm met Marlon */}
          Je betaling is binnen. De extra les staat in je agenda.
        </>
      )}
      {state === "cancelled" && (
        <>
          {/* COPY: confirm met Marlon */}
          De betaling is niet gelukt of afgebroken. De plek is weer vrij; je
          kunt de les opnieuw boeken.
        </>
      )}
      {state === "unknown" && (
        <>
          {/* COPY: confirm met Marlon */}
          We konden deze boeking niet vinden. Kijk in je agenda hieronder.
        </>
      )}
      {state === "pending" && !timedOut && (
        <>
          {/* COPY: confirm met Marlon */}
          Even geduld, we wachten op de bevestiging van je betaling.
        </>
      )}
      {state === "pending" && timedOut && (
        <>
          {/* COPY: confirm met Marlon */}
          De bevestiging laat op zich wachten. Zodra de betaling binnen is,
          verschijnt de les in je agenda; je krijgt dan ook een mail.
        </>
      )}
    </div>
  );
}
