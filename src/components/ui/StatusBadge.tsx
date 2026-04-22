export type SessionStatus =
  | "booked"
  | "waitlisted"
  | "open"
  | "full"
  | "past"
  | "cancelled"
  | "attended"
  | "no_show";

interface StatusBadgeProps {
  status: SessionStatus;
  spotsAvailable?: number;
}

export function StatusBadge({ status, spotsAvailable }: StatusBadgeProps) {
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
  if (status === "full") {
    return (
      <span className={`${base} text-[color:var(--stone-600)]`} aria-label="Vol">
        Vol
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
      {spotsAvailable ?? 0} {spotsAvailable === 1 ? "plek" : "plekken"}
    </span>
  );
}
