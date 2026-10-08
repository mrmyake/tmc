"use client";

import { type AdminSessionBlockData } from "./types";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";
import { pillarBorderLeft } from "@/lib/tone";

interface AdminSessionBlockProps {
  session: AdminSessionBlockData;
  onSelect: (id: string) => void;
}

export function AdminSessionBlock({ session, onSelect }: AdminSessionBlockProps) {
  const isCancelled = session.status === "cancelled";
  // Capaciteit NULL betekent onbeperkt (alleen kettlebell): nooit vol.
  // Totale bezetting (leden + proeflessen + gasten), zelfde telling als de
  // boek-gates.
  const full =
    session.capacity !== null && session.takenCount >= session.capacity;
  const tone = pillarBorderLeft(session.pillar);
  // Overlappende lessen staan in lanen naast elkaar (day-overlap-layout.ts).
  const widthPct = 100 / session.laneCount;
  const leftPct = widthPct * session.lane;
  // Vanaf drie lanen is een blok te smal voor trainer en bezetting: alleen
  // tijd en lestype, de rest staat in het bewerkpaneel.
  const compact = session.laneCount >= 3;

  return (
    <button
      type="button"
      onClick={() => onSelect(session.id)}
      style={{
        top: `${session.startOffsetMin}px`,
        height: `${Math.max(30, session.durationMin) - 2}px`,
        left: `calc(${leftPct}% + ${compact ? 2 : 4}px)`,
        width: `calc(${widthPct}% - ${compact ? 4 : 8}px)`,
      }}
      title={`${session.className} om ${session.startLabel}, ${session.trainerName}${isCancelled ? ", vervalt" : ""}`}
      className={`absolute ${isCancelled ? "z-0" : "z-10"} flex flex-col items-start gap-0.5 ${compact ? "px-1 py-1" : "px-3 py-2"} border border-[color:var(--ink-500)] border-l-4 ${tone} bg-bg-elevated text-left transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:bg-bg-elevated/80 cursor-pointer overflow-hidden ${
        isCancelled ? "opacity-40 border-dashed" : ""
      }`}
      aria-label={`${session.className} om ${session.startLabel}${isCancelled ? ", vervalt" : ""}`}
    >
      <span className={`text-[10px] font-medium uppercase text-text-muted ${compact ? "tracking-normal" : "tracking-[0.18em]"}`}>
        {session.startLabel}
        {isCancelled && !compact && (
          // Op de tijdregel, zodat het ook in een blok van een uur zichtbaar blijft.
          <span className="text-[color:var(--danger)]">
            {/* COPY: confirm met Marlon */}
            {" · "}Vervalt
          </span>
        )}
        {session.rescheduledFromLabel && !isCancelled && !compact && (
          <span className="text-accent normal-case tracking-normal">
            {/* COPY: confirm met Marlon */}
            {" "}(was {session.rescheduledFromLabel})
          </span>
        )}
      </span>
      <span
        className={`font-medium text-text leading-tight ${
          // Compact: korter lettertype en afbreken binnen het woord, zodat de
          // naam ook in een smalle laan zichtbaar blijft (volledige naam in de tooltip).
          compact ? "text-[10px] break-all line-clamp-4" : "text-xs line-clamp-2"
        } ${
          isCancelled ? "line-through decoration-text-muted/60" : ""
        }`}
      >
        {session.className}
      </span>
      {!compact && (
      <span className="text-[10px] text-text-muted leading-tight">
        {session.trainerName}
        {session.trainerReplaced && !isCancelled && (
          // COPY: confirm met Marlon
          <span className="text-accent"> · vervanging</span>
        )}
      </span>
      )}

      {!compact && (
      <span
        className={`text-[10px] mt-auto ${
          full ? "text-[color:var(--warning)]" : "text-text-muted"
        }`}
      >
        {session.capacity === null
          ? // COPY: confirm met Marlon
            `${session.takenCount} geboekt`
          : `${session.takenCount}/${session.capacity}`}{" "}
        · {PILLAR_LABELS[session.pillar as Pillar] ?? session.pillar}
      </span>
      )}
    </button>
  );
}
