"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import { StatusBadge, type SessionStatus } from "@/components/ui/StatusBadge";
import { durationMinutes, formatTime } from "@/lib/format-date";

export interface SessionRowData {
  id: string;
  startAt: Date;
  endAt: Date;
  className: string;
  trainerName: string;
  pillar: string;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  /** Totale bezetting (leden + proeflessen + gasten) uit de view. */
  takenCount: number;
  /** NULL betekent onbeperkt; bron: v_session_availability. */
  spotsAvailable: number | null;
  status: SessionStatus;
  bookingId: string | null;
  /** "Ingecheckt 09:14" (post-check-in) of "Check in bij de tablet" (pre). */
  checkInHint?: string | null;
  checkedIn?: boolean;
  /**
   * Volledige REASON_COPY-tekst achter een niet-boekbaar-status; alleen
   * gezet voor de canBook()-afgeleide statussen. Getoond als title-tooltip
   * op de badge.
   */
  reasonText?: string | null;
}

interface SessionRowProps {
  session: SessionRowData;
  onOpen: (session: SessionRowData) => void;
}

// Structureel: blijft zo tot het lid zelf iets wijzigt (ander abonnement).
// Geen vervolgstap door op de rij te klikken, dus niet-klikbaar.
const STRUCTURAL_STATUSES: SessionStatus[] = ["no_coverage", "age_mismatch"];
// Tijdelijk: "nu even niet, later wel". Ook niet-klikbaar (geen zinnige
// vervolgstap), BEHALVE "full" — die houdt zijn bestaande wachtlijst-actie.
const TEMPORARY_STATUSES: SessionStatus[] = [
  "limit_reached",
  "window_closed",
  "strike_blocked",
];

export function SessionRow({ session, onOpen }: SessionRowProps) {
  const isStructural = STRUCTURAL_STATUSES.includes(session.status);
  const isTemporaryReason = TEMPORARY_STATUSES.includes(session.status);

  // Niet-klikbaar: de bestaande past/cancelled/ongoing, plus alle nieuwe
  // redenen behalve "full" (die behoudt de wachtlijst-actie in de sheet).
  // Niet-klikbare rijen renderen als <div>, niet als <button disabled>: de
  // no_coverage-rij bevat een echte <a>-link, en een <a> mag niet genest
  // zitten in een <button> (ongeldige HTML, en een disabled button vuurt
  // sowieso geen klik- of toetsenbord-events af).
  const disabled =
    session.status === "past" ||
    session.status === "cancelled" ||
    session.status === "ongoing" ||
    isStructural ||
    isTemporaryReason;

  // Twee dim-tiers, niet één: structureel (+ de bestaande past/cancelled/
  // ongoing) blijft de donkerste stone-600, precies zoals vandaag. Tijdelijke
  // redenen (incl. "full", die wel klikbaar blijft) krijgen een lichtere,
  // minder "dode" demping zodat het verschil tussen "nu even niet" en
  // "structureel niet" ook zichtbaar is, niet alleen in de badge-tekst.
  const mutedStrong =
    session.status === "past" ||
    session.status === "cancelled" ||
    session.status === "ongoing" ||
    isStructural;
  const mutedWeak = session.status === "full" || isTemporaryReason;

  // Positief oplichten: geboekt en boekbaar-binnen-abonnement krijgen een
  // Ink-800 kaartvulling (bestaande Cards-conventie, zie DashboardNextClass
  // e.a.) zodat ze het oog trekken zonder dat er een schreeuwende kleur bij
  // komt. De rest blijft een vlakke rij met alleen de bestaande divider.
  const lit = session.status === "booked" || session.status === "open";

  const sharedClassName = `w-full grid grid-cols-[72px_1fr_auto_auto] items-center gap-6 text-left transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
    lit
      ? "bg-bg-elevated rounded-lg px-5 py-5 my-1 border border-transparent hover:border-accent/40"
      : "py-6 border-t border-[color:var(--ink-500)]/60"
  } ${
    disabled
      ? "cursor-default text-[color:var(--stone-600)]"
      : "cursor-pointer text-text " + (lit ? "" : "hover:bg-bg-elevated/60")
  }`;

  const content = (
    <>
      <span
        className={`font-[family-name:var(--font-playfair)] text-lg leading-none ${
          mutedStrong
            ? "text-[color:var(--stone-600)]"
            : mutedWeak
              ? "text-[color:var(--stone-500)]"
              : "text-text-muted"
        }`}
      >
        {formatTime(session.startAt)}
      </span>
      <span className="flex flex-col gap-1 min-w-0">
        <span
          className={`font-[family-name:var(--font-playfair)] text-2xl md:text-3xl leading-[1.05] tracking-[-0.01em] ${
            mutedStrong
              ? "text-[color:var(--stone-600)]"
              : mutedWeak
                ? "text-[color:var(--stone-500)]"
                : "text-text"
          }`}
        >
          {session.className}
        </span>
        <span
          className={`text-xs ${
            mutedStrong || mutedWeak
              ? "text-[color:var(--stone-600)]"
              : "text-text-muted"
          }`}
        >
          met {session.trainerName} ·{" "}
          {durationMinutes(session.startAt, session.endAt)} min
        </span>
        {session.checkInHint && (
          <span
            className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
              session.checkedIn
                ? "text-[color:var(--success)]"
                : "text-accent"
            }`}
          >
            {session.checkInHint}
          </span>
        )}
        {/* Structureel maar wel iets aan te doen: bij no_coverage (niet bij
            age_mismatch, dat verandert niet met een ander abonnement) een
            stille, niet-champagne verwijzing naar het abonnement. */}
        {session.status === "no_coverage" && (
          <a
            href="/app/abonnement"
            className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium tracking-[0.06em] text-text-muted hover:text-text transition-colors w-fit"
          >
            <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />
            {/* COPY: confirm met Marlon */}
            Bekijk abonnement
          </a>
        )}
      </span>
      <StatusBadge
        status={session.status}
        spotsAvailable={
          // Zelfde bron als de vol-status en de RPC-gate; ontbreekt de
          // view-rij (race), val dan terug op volledige capaciteit.
          session.capacity === null
            ? null
            : Math.max(0, session.spotsAvailable ?? session.capacity)
        }
        reasonText={session.reasonText}
      />
      <ChevronRight
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className={disabled ? "text-transparent" : "text-text-muted/70"}
      />
    </>
  );

  if (disabled) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className={sharedClassName}
    >
      {content}
    </button>
  );
}
