"use client";

import type { AgendaSessionBlockData } from "./types";

interface SessionBlockProps {
  session: AgendaSessionBlockData;
  onSelect: (id: string) => void;
}

// COPY: confirm met Marlon
export const KIND_LABEL: Record<AgendaSessionBlockData["kind"], string> = {
  bookable: "PT",
  intake: "Intake",
  block: "Blok",
};

/**
 * Gedeeld met MonthGrid (PR I): dezelfde type-kleurcodering als de
 * week/dagweergave, zodat een sessie er in elke weergave hetzelfde
 * uitziet.
 */
export function kindTone(session: AgendaSessionBlockData): "danger" | "intake" | "block" | "accent" {
  // Bewust overlappende sessies (dubbelboeking) krijgen altijd de
  // terracotta danger-tone, ongeacht het type — dat is het signaal dat
  // hier iets aandacht nodig heeft, belangrijker dan het type zelf.
  if (session.overlapping) return "danger";
  if (session.kind === "intake") return "intake";
  if (session.kind === "block") return "block";
  return "accent";
}

const TONE_BORDER_CLASS: Record<ReturnType<typeof kindTone>, string> = {
  danger: "border-l-[color:var(--danger)]",
  intake: "border-l-[color:var(--warning)]",
  block: "border-l-[color:var(--stone-500)]",
  accent: "border-l-accent",
};

function kindToneClass(session: AgendaSessionBlockData): string {
  return TONE_BORDER_CLASS[kindTone(session)];
}

/** Gedeeld met MonthGrid (PR I). */
export function customerLabel(session: AgendaSessionBlockData): string {
  if (session.booking) {
    const name =
      `${session.booking.firstName} ${session.booking.lastName}`.trim();
    return session.booking.introduceeName
      ? `${name} + ${session.booking.introduceeName}`
      : name || "Klant";
  }
  if (session.prospect) return session.prospect.name;
  return KIND_LABEL[session.kind];
}

export function SessionBlock({ session, onSelect }: SessionBlockProps) {
  const isCancelled = session.status === "cancelled";
  const tone = kindToneClass(session);
  const widthPct = 100 / session.laneCount;
  const leftPct = widthPct * session.lane;

  return (
    <>
      {session.bufferBeforeMin > 0 && (
        <div
          aria-hidden
          style={{
            top: `${session.startOffsetMin - session.bufferBeforeMin}px`,
            height: `${session.bufferBeforeMin}px`,
            left: `calc(${leftPct}% + 2px)`,
            width: `calc(${widthPct}% - 4px)`,
          }}
          className="absolute bg-text-muted/[0.06] border-t border-dashed border-text-muted/20 pointer-events-none"
        />
      )}
      {session.bufferAfterMin > 0 && (
        <div
          aria-hidden
          style={{
            top: `${session.startOffsetMin + session.durationMin}px`,
            height: `${session.bufferAfterMin}px`,
            left: `calc(${leftPct}% + 2px)`,
            width: `calc(${widthPct}% - 4px)`,
          }}
          className="absolute bg-text-muted/[0.06] border-b border-dashed border-text-muted/20 pointer-events-none"
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          // C4-vervolg (kalender-klik-om-te-boeken): de dagkolom eronder
          // heeft zijn eigen onClick voor een leeg-moment-klik; zonder
          // stopPropagation zou een klik op een sessie ALSNOG die
          // leeg-moment-handler triggeren (currentTarget van de
          // kolom-handler verandert niet, alleen propagatie voorkomt dat
          // 'ie ook afgaat).
          e.stopPropagation();
          onSelect(session.id);
        }}
        style={{
          top: `${session.startOffsetMin}px`,
          height: `${Math.max(30, session.durationMin) - 2}px`,
          left: `calc(${leftPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
        }}
        className={`absolute z-10 flex flex-col items-start gap-0.5 px-3 py-2 border border-[color:var(--ink-500)] border-l-4 ${tone} bg-bg-elevated text-left transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:bg-bg-elevated/80 cursor-pointer overflow-hidden ${
          isCancelled ? "opacity-50 line-through decoration-text-muted/60" : ""
        }`}
        aria-label={`${KIND_LABEL[session.kind]} om ${session.startLabel}: ${customerLabel(session)}`}
      >
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
          {session.startLabel}
        </span>
        <span className="shrink-0 w-full truncate text-xs font-medium text-text leading-tight">
          {customerLabel(session)}
        </span>
        <span className="shrink-0 mt-auto text-[10px] text-text-muted leading-tight">
          {KIND_LABEL[session.kind]}
          {session.booking && session.booking.status !== "booked"
            ? ` · ${session.booking.status}`
            : ""}
        </span>
      </button>
    </>
  );
}
