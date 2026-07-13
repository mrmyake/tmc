import { amsterdamParts, formatDateLong, todayIsoAmsterdam } from "@/lib/format-date";

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
  | { kind: "payment_failed" }
  | { kind: "other"; label: string };

// Bestaande, al elders geshipte labels (MembershipHeroCard.tsx) — geen
// nieuwe copy, alleen hergebruikt voor statussen die niet in de landing-
// varianten uit copy-ledenomgeving-landing.md §2 voorkomen (of, voor
// 'paused', als defensieve fallback wanneer pause_effective_date
// onverwacht ontbreekt — in productie zet admin_pause_membership die
// altijd samen met de status, maar test-fixtures zijn niet altijd zo strikt).
const FALLBACK_STATUS_LABEL: Record<string, string> = {
  pending: "Betaling in behandeling",
  paused: "Gepauzeerd",
};

/**
 * Vertaalt een membership-rij naar één van de statusregel-varianten uit
 * copy-ledenomgeving-landing.md §2, plus payment_failed (niet in de
 * goedgekeurde copy-set, zie resolveStatusLineDisplay) en een generieke
 * fallback voor pending (wel een geldige ACTIVE_STATUSES-waarde, zie
 * /app/abonnement, maar geen landing-specifieke variant).
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
  if (membership.status === "payment_failed") {
    return { kind: "payment_failed" };
  }
  return {
    kind: "other",
    label: FALLBACK_STATUS_LABEL[membership.status] ?? membership.status,
  };
}

export interface ResolvedStatusLine {
  text: string;
  tone: "default" | "warning" | "danger";
}

/**
 * Vertaalt een StatusLineVariant naar de uiteindelijke, weergaveklare tekst
 * plus een semantische tone. Gedeeld tussen beide design-varianten zodat de
 * copy nooit uiteen kan lopen — alleen de presentatie van `tone` verschilt
 * per skin (kleur/accent), de tekst zelf niet.
 */
export function resolveStatusLineDisplay(
  variant: StatusLineVariant,
): ResolvedStatusLine {
  switch (variant.kind) {
    case "active_fixed":
      // COPY: akkoord Marlon 2026-07-12
      return {
        text: `Actief · vaste periode tot ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`,
        tone: "default",
      };
    case "active_rolling":
      // COPY: akkoord Marlon 2026-07-12
      return {
        text: `Actief · per ${variant.cycleWeeks} weken opzegbaar`,
        tone: "default",
      };
    case "pause_planned":
      // COPY: akkoord Marlon 2026-07-12
      return {
        text: `Pauze gepland vanaf ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`,
        tone: "warning",
      };
    case "paused":
      // COPY: akkoord Marlon 2026-07-12
      return {
        text: `Gepauzeerd sinds ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`,
        tone: "warning",
      };
    case "cancellation_planned":
      // COPY: akkoord Marlon 2026-07-12
      return {
        text: `Je lidmaatschap loopt af op ${formatDateLong(new Date(`${variant.date}T00:00:00`))}`,
        tone: "warning",
      };
    case "payment_failed":
      // COPY: confirm met Marlon — geen goedgekeurde variant in
      // copy-ledenomgeving-landing.md §2 (die kent vijf statusregel-
      // varianten, payment_failed hoort er niet bij). Zachte, duidelijke
      // formulering i.p.v. kaal "Betaling mislukt"; definitieve tekst aan
      // Marlon.
      return {
        text: "Je laatste betaling is niet gelukt. Los dit op om actief te blijven.",
        tone: "danger",
      };
    case "other":
      return { text: variant.label, tone: "default" };
  }
}

/**
 * Stippenrij voor het tegoed-blok: index i is `true` (gevuld) voor een
 * verbruikte rit, `false` (leeg) voor een resterende — zelfde semantiek als
 * mockup-leden-overzicht.html (`.d.used` = gevuld). Gedeeld zodat beide
 * design-varianten exact dezelfde vulling tonen.
 */
export function creditDots(remaining: number, total: number): boolean[] {
  const used = Math.max(0, total - remaining);
  return Array.from({ length: total }, (_, i) => i < used);
}
