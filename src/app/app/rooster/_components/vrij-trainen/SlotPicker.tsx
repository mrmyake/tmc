"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  amsterdamParts,
  formatWeekdayDate,
  parseIsoDateToAmsterdamMidnight,
} from "@/lib/format-date";
import { cancelBooking, createBooking } from "@/lib/member/booking-actions";
import {
  DEFAULT_SLOT_DURATION,
  durationLabel,
  amsterdamClock,
  isStartBookable,
  QUARTER_MS,
  type QuarterCell,
} from "@/lib/member/vrij-trainen-slots";
import { presenceForWeekday, type PresenceWindow } from "@/lib/presence";
import type { VrijTrainenPickerData } from "@/lib/member/vrij-trainen-query";
import { SlotDayStrip } from "./SlotDayStrip";
import { DurationPicker } from "./DurationPicker";
import { SlotGrid } from "./SlotGrid";
import { SlotFooter } from "./SlotFooter";
import { BookedSlotCard } from "./BookedSlotCard";
import { useSlotSelection } from "./useSlotSelection";

type Message = { tone: "success" | "error"; text: string } | null;

/**
 * Slotkiezer voor vrij trainen (spec-vrij-trainen-slots.md). De server levert
 * de beschikbaarheid van de gekozen dag; deze component houdt alleen de keuze
 * (duur en starttijd) vast. De database beslist bij het boeken: bij slot_full
 * of slot_blocked (iemand was net eerder) laden we het raster opnieuw en
 * wissen we de keuze.
 */
export function SlotPicker({
  data,
  presence,
}: {
  data: VrijTrainenPickerData;
  /** De vensters komen uit tmc.trainer_presence_windows (enige bron). */
  presence: { name: string; rows: readonly PresenceWindow[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duration, setDuration] = useState<number>(DEFAULT_SLOT_DURATION);
  // De keuze onthoudt bij welke dag hij hoort; op een andere dag telt hij niet.
  const [selection, setSelection] = useState<{ date: string; start: string } | null>(null);
  const [message, setMessage] = useState<Message>(null);
  // "Toch boeken" hoort bij precies de start waarvoor de weekcap-melding kwam.
  const [confirmOverCapFor, setConfirmOverCapFor] = useState<string | null>(null);
  // Direct na boeken toont de kaart "Geboekt" in plaats van "Je traint".
  const [justBookedDate, setJustBookedDate] = useState<string | null>(null);
  const { nowMs, rows, selected, selectedStartMs, slotQuarterMs } = useSlotSelection({
    quarters: data.quarters,
    duration,
    selectedDate: data.selectedDate,
    selection,
  });
  const confirmOverCap = selected !== null && confirmOverCapFor === selected;

  const dayDate = parseIsoDateToAmsterdamMidnight(data.selectedDate)!;
  const weekday = amsterdamParts(dayDate).weekday;
  const dayPresence = { name: presence.name, ...presenceForWeekday(presence.rows, weekday) };
  const summary = `${formatWeekdayDate(dayDate)} · ${durationLabel(duration)}`;

  function onSelect(cell: QuarterCell) {
    setMessage(null);
    setConfirmOverCapFor(null);
    setSelection({ date: data.selectedDate, start: cell.quarterStart });
  }

  function book(acknowledgeOverCap = false) {
    if (!data.session || !selected) return;
    const sessionId = data.session.id;
    const startAt = selected;
    setMessage(null);
    startTransition(async () => {
      let res;
      try {
        res = await createBooking(sessionId, {
          slot: { startAt, minutes: duration },
          acknowledgeOverCap,
        });
      } catch {
        // COPY: confirm met Marlon
        setMessage({ tone: "error", text: "Geen verbinding. Controleer je internet en probeer het opnieuw." });
        return;
      }
      if (res.ok) {
        setConfirmOverCapFor(null);
        setSelection(null);
        setJustBookedDate(data.selectedDate);
        router.refresh();
        return;
      }
      if (res.needsConfirmation) {
        setConfirmOverCapFor(startAt);
        setMessage({ tone: "error", text: res.message });
        return;
      }
      if (res.reason === "slot_full" || res.reason === "slot_blocked") {
        setSelection(null);
        setMessage({
          tone: "error",
          // COPY: confirm met Marlon
          text: "Net iemand je voor: dit tijdslot is niet meer vrij. We hebben de tijden bijgewerkt, kies opnieuw.",
        });
        router.refresh();
        return;
      }
      setMessage({ tone: "error", text: res.message });
    });
  }

  function cancel(bookingId: string) {
    setMessage(null);
    startTransition(async () => {
      let res;
      try {
        res = await cancelBooking(bookingId);
      } catch {
        // COPY: confirm met Marlon
        setMessage({ tone: "error", text: "Geen verbinding. Controleer je internet en probeer het opnieuw." });
        return;
      }
      setMessage({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) {
        setJustBookedDate(null);
        router.refresh();
      }
    });
  }

  const footerSelection =
    selectedStartMs !== null
      ? { startMs: selectedStartMs, endMs: selectedStartMs + (duration / 15) * QUARTER_MS }
      : null;

  return (
    <div>
      <div className="mb-6">
        <SlotDayStrip days={data.days} selectedDate={data.selectedDate} />
      </div>

      {message && (
        <p
          role={message.tone === "success" ? "status" : "alert"}
          className={`mb-5 text-sm ${
            message.tone === "success" ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
          }`}
        >
          {message.text}
        </p>
      )}

      {!data.session ? (
        <p className="text-text-muted text-sm py-8">
          {/* COPY: confirm met Marlon */}
          Er staan nog geen vrij-trainen-dagen open. Probeer het later opnieuw.
        </p>
      ) : data.ownBooking ? (
        <BookedSlotCard
          booking={data.ownBooking}
          justBooked={justBookedDate === data.selectedDate}
          cancelWindowMinutes={data.cancelWindowMinutes}
          nowMs={nowMs}
          pending={pending}
          onCancel={() => cancel(data.ownBooking!.id)}
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside className="mb-6 lg:mb-0 lg:sticky lg:top-24 lg:rounded-lg lg:border lg:border-[color:var(--ink-500)]/60 lg:bg-bg-elevated lg:p-6">
            <div className="hidden lg:block mb-6">
              <span className="tmc-eyebrow block mb-2">
                {/* COPY: confirm met Marlon */}
                Open studio
              </span>
              <p className="font-[family-name:var(--font-playfair)] text-2xl leading-tight text-text">
                {formatWeekdayDate(dayDate)}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {/* COPY: confirm met Marlon */}
                {amsterdamClock(Date.parse(data.session.startAt))} tot{" "}
                {amsterdamClock(Date.parse(data.session.endAt))}
              </p>
            </div>

            <div className="lg:mb-6">
              <span className="tmc-eyebrow block mb-3">
                {/* COPY: confirm met Marlon */}
                Hoe lang?
              </span>
              <DurationPicker
                value={duration}
                onChange={(m) => {
                  setMessage(null);
                  setConfirmOverCapFor(null);
                  if (selected && !isStartBookable(data.quarters, selected, m, nowMs)) {
                    setSelection(null);
                  }
                  setDuration(m);
                }}
              />
            </div>

            <div className="hidden lg:block">
              <SlotFooter
                layout="panel"
                summary={summary}
                selection={footerSelection}
                pending={pending}
                onBook={() => book(false)}
              />
            </div>
          </aside>

          <div>
            <SlotGrid
              rows={rows}
              weekday={weekday}
              presence={dayPresence}
              selectedStartMs={selectedStartMs}
              slotQuarterMs={slotQuarterMs}
              onSelect={onSelect}
            />

            {confirmOverCap && selected && (
              <button
                type="button"
                disabled={pending}
                onClick={() => book(true)}
                className="mt-5 min-h-11 rounded px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] border border-accent text-accent cursor-pointer disabled:opacity-40"
              >
                {/* COPY: confirm met Marlon */}
                Toch boeken
              </button>
            )}

            <div className="lg:hidden">
              <SlotFooter
                summary={summary}
                selection={footerSelection}
                pending={pending}
                onBook={() => book(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
