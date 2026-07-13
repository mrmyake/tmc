import { Calendar, Clock, Users } from "lucide-react";
import { Chip } from "./Chip";

export type SessionStatus =
  | "booked"
  | "waitlisted"
  | "open"
  | "full"
  | "ongoing"
  | "past"
  | "cancelled"
  | "attended"
  | "no_show"
  // Vanaf hier: niet-boekbaar-redenen uit canBook() (src/lib/member/can-book.ts),
  // gespiegeld aan de RPC book_class_session. Twee tiers: tijdelijk (nu even
  // niet, later wel) versus structureel (buiten abonnement/leeftijd, blijft
  // zo tot het lid zelf iets wijzigt). Zie rooster/page.tsx voor de mapping
  // van canBook()'s reason naar deze statussen.
  | "limit_reached"
  | "window_closed"
  | "strike_blocked"
  | "no_coverage"
  | "age_mismatch";

interface StatusBadgeProps {
  status: SessionStatus;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  spotsAvailable?: number | null;
  /**
   * Volledige REASON_COPY-tekst voor de niet-boekbaar-statussen; gebruikt
   * als title-tooltip zodat de specifieke reden (bv. dag- vs weeklimiet)
   * ook toegankelijk is zonder een tweede kleur of icoon te verzinnen.
   */
  reasonText?: string | null;
}

export function StatusBadge({
  status,
  spotsAvailable,
  reasonText,
}: StatusBadgeProps) {
  const base =
    "inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em]";

  if (status === "booked") {
    return (
      <span
        className={`${base} text-[color:var(--success)]`}
        aria-label="Geboekt"
      >
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]"
        />
        Geboekt
      </span>
    );
  }
  if (status === "attended") {
    return (
      <span
        className={`${base} text-[color:var(--success)]`}
        aria-label="Bijgewoond"
      >
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--success)]"
        />
        Bijgewoond
      </span>
    );
  }
  if (status === "no_show") {
    return (
      <span
        className={`${base} text-[color:var(--danger)]`}
        aria-label="Niet verschenen"
      >
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--danger)]"
        />
        Niet verschenen
      </span>
    );
  }
  if (status === "waitlisted") {
    return (
      <span className={`${base} text-text-muted`} aria-label="Op wachtlijst">
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-text-muted"
        />
        Wachtlijst
      </span>
    );
  }
  // Tijdelijk-tier: "nu even niet, later wel". Chip (tone="muted") + icoon,
  // zodat de reden ook zonder kleurperceptie leesbaar is. Elke tekst is
  // uniek, dus kleur is nooit het enige signaal.
  if (status === "full") {
    return (
      <Chip
        tone="muted"
        icon={<Users size={12} strokeWidth={1.5} />}
        className="normal-case tracking-normal"
        title={reasonText ?? undefined}
      >
        {/* COPY: confirm met Marlon */}
        Vol · wachtlijst
      </Chip>
    );
  }
  if (status === "limit_reached") {
    return (
      <Chip
        tone="muted"
        icon={<Calendar size={12} strokeWidth={1.5} />}
        title={reasonText ?? undefined}
      >
        {/* COPY: confirm met Marlon */}
        Limiet bereikt
      </Chip>
    );
  }
  if (status === "window_closed") {
    return (
      <Chip
        tone="muted"
        icon={<Clock size={12} strokeWidth={1.5} />}
        title={reasonText ?? undefined}
      >
        {/* COPY: confirm met Marlon */}
        Nog niet open
      </Chip>
    );
  }
  if (status === "strike_blocked") {
    return (
      <Chip tone="muted" dot={false} title={reasonText ?? undefined}>
        {/* COPY: confirm met Marlon */}
        Tijdelijk geblokkeerd
      </Chip>
    );
  }
  // Structureel-tier: blijft zo tot het lid zelf iets wijzigt (ander
  // abonnement; leeftijdscategorie kan een lid niet zelf aanpassen). Zelfde
  // donkere stone-600 als past/cancelled hieronder, bewust GEEN icoon: de
  // tekst zelf ("Buiten abonnement" / eigen leeftijdscategorie-tekst) is al
  // het onderscheidende signaal, en het scherm bij no_coverage krijgt zijn
  // eigen "Bekijk abonnement"-link in de rij (zie SessionRow), niet hier.
  if (status === "no_coverage") {
    return (
      <span
        className={`${base} text-[color:var(--stone-600)]`}
        aria-label="Buiten abonnement"
        title={reasonText ?? undefined}
      >
        {/* COPY: confirm met Marlon */}
        Buiten abonnement
      </span>
    );
  }
  if (status === "age_mismatch") {
    return (
      <span
        className={`${base} text-[color:var(--stone-600)]`}
        aria-label="Andere leeftijdscategorie"
        title={reasonText ?? undefined}
      >
        {/* COPY: confirm met Marlon */}
        Andere leeftijdscategorie
      </span>
    );
  }
  if (status === "ongoing") {
    return (
      <span
        className={`${base} text-[color:var(--stone-600)]`}
        aria-label="Loopt nu"
      >
        <span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--stone-600)] animate-pulse"
        />
        Loopt nu
      </span>
    );
  }
  if (status === "past") {
    return (
      <span
        className={`${base} text-[color:var(--stone-600)]`}
        aria-label="Afgelopen"
      >
        Afgelopen
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span
        className={`${base} text-[color:var(--stone-600)]`}
        aria-label="Geannuleerd"
      >
        Geannuleerd
      </span>
    );
  }
  return (
    <span className={`${base} text-accent`} aria-label="Open">
      {spotsAvailable === null
        ? // COPY: confirm met Marlon
          "Onbeperkt"
        : `${spotsAvailable ?? 0} ${spotsAvailable === 1 ? "plek" : "plekken"}`}
    </span>
  );
}
