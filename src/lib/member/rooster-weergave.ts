import { cappedPillars, planCovers } from "./plan-coverage";
import { extraClassOffer } from "./can-book";

/**
 * Welke weergave /app/rooster toont (spec-rooster-vrij-trainen.md, besluiten
 * 2026-10-31). Dit is alleen een weergavekeuze: wat een lid per les of slot
 * kan blijft bepaald door canBook() en tmc.booking_gate. De functie hergebruikt
 * planCovers, hasActiveSubscription en extraClassOffer en voegt geen eigen
 * dekkingsregels toe.
 *
 * Een rittenkaart heeft bewust een lege covered_pillars-kolom: een gevulde
 * kolom zou check-in/core.ts als abonnement behandelen en dan geen credit
 * afschrijven. Rittenkaartdekking komt daarom uit planCovers op plan_type,
 * met een bruikbaarheidscheck op tegoed en vervaldatum.
 */

export interface RoosterMembership {
  plan_type: string;
  status: string;
  covered_pillars: readonly string[] | null;
  frequency_cap: number | null;
  credits_remaining: number | null;
  credits_expires_at: string | null;
  cancellation_effective_date: string | null;
}

/** Bruikbaar rittenkaarttegoed: som van de ritten, vroegste vervaldatum. */
export interface RideCredit {
  rides: number;
  /** yyyy-mm-dd, of null als geen van de bruikbare kaarten verloopt. */
  expiresAt: string | null;
}

export type LessenScherm =
  | { kind: "normaal"; ride: RideCredit | null }
  /** Scherm B: abonnement zonder groepslessen, los bijboeken met prijs. */
  | { kind: "niet-in-abonnement"; priceCents: number }
  | { kind: "gepauzeerd" };

export type VrijScherm =
  | { kind: "gedekt"; cap: number | null }
  | { kind: "gepauzeerd" }
  /** Scherm C: slotmodus, abonnement zonder vrij trainen, bijkopen met prijs. */
  | { kind: "extra"; upfrontExtraOffer: { priceCents: number } }
  /** Abonnement zonder vrij trainen, zonder koopoptie (check-in-modus of geen prijs). */
  | { kind: "niet-in-abonnement" }
  /** Scherm D: geen actief abonnement. */
  | { kind: "open-studio"; ride: RideCredit | null; hasRideCard: boolean };

export interface RoosterWeergave {
  defaultTab: "lessen" | "vrij";
  ride: RideCredit | null;
  lessen: LessenScherm;
  vrij: VrijScherm;
}

const NON_SUBSCRIPTION = new Set(["ten_ride_card", "pt_package"]);

export function isSubscription(m: Pick<RoosterMembership, "plan_type">): boolean {
  return !NON_SUBSCRIPTION.has(m.plan_type);
}

/**
 * Zelfde filter als tmc.booking_gate: een lopende opzegging telt nog mee tot
 * en met de effectieve datum, gepauzeerd telt nooit mee.
 */
export function isMembershipActiveOn(
  m: Pick<RoosterMembership, "status" | "cancellation_effective_date">,
  dateIso: string,
): boolean {
  return (
    m.status === "active" ||
    (m.status === "cancellation_requested" &&
      m.cancellation_effective_date != null &&
      m.cancellation_effective_date >= dateIso)
  );
}

/** Rittenkaart met tegoed die op `todayIso` (Amsterdam) nog geldt. */
export function isUsableRideCard(m: RoosterMembership, todayIso: string): boolean {
  return (
    m.plan_type === "ten_ride_card" &&
    isMembershipActiveOn(m, todayIso) &&
    (m.credits_remaining ?? 0) > 0 &&
    (m.credits_expires_at == null || m.credits_expires_at >= todayIso) &&
    planCovers("ten_ride_card", "yoga_mobility")
  );
}

function coversLessonsByColumn(m: RoosterMembership): boolean {
  return (m.covered_pillars ?? []).some((p) => p !== "vrij_trainen");
}

function coversVrijByColumn(m: RoosterMembership): boolean {
  return (m.covered_pillars ?? []).includes("vrij_trainen");
}

/**
 * @param memberships  active, cancellation_requested en paused rijen van het
 *   lid, nieuwste eerst (de volgorde bepaalt welke rij de weekcap op vrij
 *   trainen levert). pt_package telt nergens mee.
 */
export function bepaalRoosterWeergave(params: {
  memberships: readonly RoosterMembership[];
  /** booking_settings.vrij_trainen_booking_enabled. */
  vrijBookingEnabled: boolean;
  /** Vandaag als yyyy-mm-dd in Amsterdam (todayIsoAmsterdam). */
  todayIso: string;
  /** extra_class_price uit de server; null betekent bijkopen uit. */
  extraClassPriceCents: number | null;
}): RoosterWeergave {
  const { vrijBookingEnabled, todayIso, extraClassPriceCents } = params;
  const memberships = params.memberships.filter((m) => m.plan_type !== "pt_package");

  const subs = memberships.filter(isSubscription);
  const activeSubs = subs.filter((m) => isMembershipActiveOn(m, todayIso));
  const pausedSubs = subs.filter((m) => m.status === "paused");

  const usableRides = memberships.filter((m) => isUsableRideCard(m, todayIso));
  const expiries = usableRides
    .map((m) => m.credits_expires_at)
    .filter((d): d is string => d != null)
    .sort();
  const ride: RideCredit | null =
    usableRides.length > 0
      ? {
          rides: usableRides.reduce((sum, m) => sum + (m.credits_remaining ?? 0), 0),
          expiresAt: expiries[0] ?? null,
        }
      : null;

  // Standaardtab: dekking telt ook als het abonnement gepauzeerd is.
  const coversLessons = ride !== null || subs.some(coversLessonsByColumn);
  const coversVrij = subs.some(coversVrijByColumn);
  const defaultTab: "lessen" | "vrij" = coversVrij && !coversLessons ? "vrij" : "lessen";

  const offer = extraClassOffer(activeSubs, extraClassPriceCents);

  // Groepslessen-tab.
  let lessen: LessenScherm;
  if (ride !== null || activeSubs.some(coversLessonsByColumn)) {
    lessen = { kind: "normaal", ride };
  } else if (activeSubs.length > 0 && offer.available && offer.priceCents !== null) {
    lessen = { kind: "niet-in-abonnement", priceCents: offer.priceCents };
  } else if (activeSubs.length === 0 && pausedSubs.length > 0) {
    lessen = { kind: "gepauzeerd" };
  } else {
    lessen = { kind: "normaal", ride: null };
  }

  // Vrij trainen-tab.
  let vrij: VrijScherm;
  if (activeSubs.some(coversVrijByColumn)) {
    // Weekcap van de nieuwste rij die vrij trainen dekt. Null als vrij
    // trainen buiten de cap valt (All Access).
    const newest = subs.find(coversVrijByColumn);
    const capped = newest !== undefined && cappedPillars(newest.covered_pillars).includes("vrij_trainen");
    vrij = { kind: "gedekt", cap: capped ? (newest.frequency_cap ?? null) : null };
  } else if (pausedSubs.some(coversVrijByColumn)) {
    vrij = { kind: "gepauzeerd" };
  } else if (activeSubs.length > 0) {
    vrij =
      vrijBookingEnabled && offer.available && offer.priceCents !== null
        ? { kind: "extra", upfrontExtraOffer: { priceCents: offer.priceCents } }
        : { kind: "niet-in-abonnement" };
  } else if (pausedSubs.length > 0) {
    vrij = { kind: "gepauzeerd" };
  } else {
    vrij = {
      kind: "open-studio",
      ride,
      hasRideCard: memberships.some((m) => m.plan_type === "ten_ride_card"),
    };
  }

  return { defaultTab, ride, lessen, vrij };
}
