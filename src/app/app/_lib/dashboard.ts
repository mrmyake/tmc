import { amsterdamParts, todayIsoAmsterdam } from "@/lib/format-date";

/** Tijd-van-dag-dynamische aanhef. Amsterdam-wall-clock, zelfde bron als de rest van de app. */
export function resolveSalutation(now: Date): "Goeiemorgen" | "Goeiemiddag" | "Goeienavond" {
  const { hour } = amsterdamParts(now);
  if (hour < 12) return "Goeiemorgen";
  if (hour < 18) return "Goeiemiddag";
  return "Goeienavond";
}

/** Initialen uit voor- en achternaam, voor de avatar-bubble. */
export function initialsOf(firstName: string, lastName: string | null): string {
  const first = firstName.trim().charAt(0);
  const last = (lastName ?? "").trim().charAt(0);
  return `${first}${last}`.toUpperCase() || "?";
}

export interface StatusLineMembership {
  status: string;
  billing_cycle_weeks: number | null;
  commit_end_date: string | null;
  pause_effective_date: string | null;
  cancellation_effective_date: string | null;
}

export type StatusLineVariant =
  | { kind: "active_fixed"; date: string }
  | { kind: "active_rolling"; cycleWeeks: number }
  | { kind: "pause_planned"; date: string }
  | { kind: "paused"; date: string }
  | { kind: "cancellation_planned"; date: string }
  | { kind: "other"; label: string };

// Bestaande, al elders geshipte labels (MembershipHeroCard.tsx) — geen
// nieuwe copy, alleen hergebruikt voor statussen die niet in de 5
// landing-varianten uit copy-ledenomgeving-landing.md §2 voorkomen (of,
// voor 'paused', als defensieve fallback wanneer pause_effective_date
// onverwacht ontbreekt — in productie zet admin_pause_membership die
// altijd samen met de status, maar test-fixtures zijn niet altijd zo strikt).
const FALLBACK_STATUS_LABEL: Record<string, string> = {
  pending: "Betaling in behandeling",
  payment_failed: "Betaling mislukt",
  paused: "Gepauzeerd",
};

/**
 * Vertaalt een membership-rij naar één van de vijf statusregel-varianten
 * uit copy-ledenomgeving-landing.md §2, of een fallback voor pending/
 * payment_failed (niet in die vijf, maar wel een geldige ACTIVE_STATUSES-
 * waarde — zie /app/abonnement).
 */
export function resolveStatusLine(
  membership: StatusLineMembership,
): StatusLineVariant {
  if (membership.status === "paused") {
    return membership.pause_effective_date
      ? { kind: "paused", date: membership.pause_effective_date }
      : { kind: "other", label: FALLBACK_STATUS_LABEL.paused };
  }
  if (membership.status === "active" && membership.pause_effective_date) {
    return { kind: "pause_planned", date: membership.pause_effective_date };
  }
  if (
    membership.status === "cancellation_requested" &&
    membership.cancellation_effective_date
  ) {
    return {
      kind: "cancellation_planned",
      date: membership.cancellation_effective_date,
    };
  }
  if (membership.status === "active") {
    const today = todayIsoAmsterdam();
    if (membership.commit_end_date && membership.commit_end_date > today) {
      return { kind: "active_fixed", date: membership.commit_end_date };
    }
    return { kind: "active_rolling", cycleWeeks: membership.billing_cycle_weeks ?? 4 };
  }
  return {
    kind: "other",
    label: FALLBACK_STATUS_LABEL[membership.status] ?? membership.status,
  };
}
