"use client";

import { formatWeekdayDate } from "@/lib/format-date";
import { amsterdamClock, reminderWillBeSent } from "@/lib/member/vrij-trainen-slots";
import type { OwnSlotBooking } from "@/lib/member/vrij-trainen-query";

/**
 * In plaats van het raster als het lid op deze dag al vrij traint. Een
 * vrij-trainen-boeking per dag: een andere tijd betekent annuleren en
 * opnieuw kiezen.
 */
export function BookedSlotCard({
  booking,
  justBooked,
  cancelWindowMinutes,
  nowMs,
  pending,
  onCancel,
}: {
  booking: OwnSlotBooking;
  justBooked: boolean;
  cancelWindowMinutes: number;
  nowMs: number;
  pending: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(booking.slotStartAt);
  const end = Date.parse(booking.slotEndAt);

  return (
    <section className="rounded-lg border border-accent/60 bg-bg-elevated p-6">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        {/* COPY: confirm met Marlon */}
        {justBooked ? "Geboekt" : "Je traint"}
      </span>
      <p className="font-[family-name:var(--font-playfair)] text-4xl sm:text-5xl text-text leading-none tracking-[-0.02em] tabular-nums whitespace-nowrap">
        {amsterdamClock(start)}
        <span className="text-text-muted"> tot </span>
        {amsterdamClock(end)}
      </p>
      <p className="mt-3 text-text-muted first-letter:uppercase">{formatWeekdayDate(new Date(start))}</p>

      {reminderWillBeSent(booking.slotStartAt, nowMs) && (
        <p className="mt-5 text-sm text-text">
          {/* COPY: confirm met Marlon */}
          Je krijgt een dag van tevoren een herinnering.
        </p>
      )}
      <p className="mt-3 text-sm text-text-muted leading-relaxed">
        {/* COPY: confirm met Marlon */}
        Annuleren kan tot {cancelWindowMinutes} minuten voor je start. Andere
        tijd nodig? Annuleer deze boeking en kies opnieuw; je kunt één keer per
        dag vrij trainen boeken.
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="mt-6 rounded px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] border border-[color:var(--ink-500)] text-text hover:border-[color:var(--danger)] hover:text-[color:var(--danger)] transition-colors duration-300 disabled:opacity-40 cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        {pending ? "Bezig met annuleren" : "Boeking annuleren"}
      </button>
    </section>
  );
}
