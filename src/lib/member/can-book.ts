import { planCovers, type PlanType } from "./plan-coverage";

export interface CanBookSession {
  id: string;
  start_at: string;
  status: string;
  pillar: string;
  age_category: string;
  capacity: number;
}

export interface CanBookMembership {
  id: string;
  plan_type: string;
  frequency_cap: number | null;
  credits_remaining: number | null;
}

export interface CanBookProfile {
  age_category: string;
  active_strikes: number;
  strikes_block_until: string | null;
}

export interface CanBookUsage {
  bookedCountThisSession: number;
  bookingsSameDay: number;
  bookingsSamePillarThisWeek: number;
}

export interface CanBookSettings {
  booking_window_days: number;
  fair_use_daily_max: number;
  no_show_strike_threshold: number;
  no_show_block_days: number;
}

export type CanBookResult =
  | {
      allowed: true;
      coveringMembership: CanBookMembership | null;
      /** True when paying via drop-in is required (no covering membership). */
      requiresPayment: boolean;
    }
  | {
      allowed: false;
      reason:
        | "age_mismatch"
        | "booking_window_closed"
        | "session_not_scheduled"
        | "session_in_past"
        | "capacity_full"
        | "strike_blocked"
        | "weekly_cap_reached"
        | "daily_cap_reached"
        | "no_coverage";
      canJoinWaitlist?: boolean;
    };

export function canBook(params: {
  session: CanBookSession;
  profile: CanBookProfile;
  memberships: CanBookMembership[];
  usage: CanBookUsage;
  settings: CanBookSettings;
  now: Date;
}): CanBookResult {
  const { session, profile, memberships, usage, settings, now } = params;

  if (profile.age_category !== session.age_category) {
    return { allowed: false, reason: "age_mismatch" };
  }

  const startAt = new Date(session.start_at);
  const windowEnd = new Date(
    now.getTime() + settings.booking_window_days * 86400000,
  );
  if (startAt > windowEnd) {
    return { allowed: false, reason: "booking_window_closed" };
  }

  if (session.status !== "scheduled") {
    return { allowed: false, reason: "session_not_scheduled" };
  }
  if (startAt <= now) {
    return { allowed: false, reason: "session_in_past" };
  }

  if (usage.bookedCountThisSession >= session.capacity) {
    return { allowed: false, reason: "capacity_full", canJoinWaitlist: true };
  }

  if (
    profile.active_strikes >= settings.no_show_strike_threshold &&
    profile.strikes_block_until &&
    new Date(profile.strikes_block_until) > now
  ) {
    return { allowed: false, reason: "strike_blocked" };
  }

  if (usage.bookingsSameDay >= settings.fair_use_daily_max) {
    return { allowed: false, reason: "daily_cap_reached" };
  }

  const covering = memberships.find((m) =>
    planCovers(m.plan_type, session.pillar),
  );

  if (covering) {
    if (
      covering.frequency_cap !== null &&
      usage.bookingsSamePillarThisWeek >= covering.frequency_cap
    ) {
      return { allowed: false, reason: "weekly_cap_reached" };
    }
    return {
      allowed: true,
      coveringMembership: covering,
      requiresPayment: false,
    };
  }

  const tenRideCard = memberships.find(
    (m) =>
      (m.plan_type satisfies string as PlanType) === "ten_ride_card" &&
      (m.credits_remaining ?? 0) > 0 &&
      planCovers("ten_ride_card", session.pillar),
  );
  if (tenRideCard) {
    return {
      allowed: true,
      coveringMembership: tenRideCard,
      requiresPayment: false,
    };
  }

  return { allowed: false, reason: "no_coverage" };
}

export const REASON_COPY: Record<
  Exclude<Extract<CanBookResult, { allowed: false }>["reason"], never>,
  string
> = {
  age_mismatch: "Deze sessie valt buiten jouw leeftijdscategorie.",
  booking_window_closed: "Nog niet open voor boeking.",
  session_not_scheduled: "Deze sessie is niet meer beschikbaar.",
  session_in_past: "Deze sessie is al voorbij.",
  capacity_full: "Vol. Je kunt je op de wachtlijst zetten.",
  strike_blocked:
    "Door meerdere no-shows is boeken tijdelijk geblokkeerd. Neem contact op als je vragen hebt.",
  weekly_cap_reached:
    "Je weekcap voor deze discipline is bereikt. Volgende week weer.",
  daily_cap_reached: "Maximaal twee sessies per dag.",
  no_coverage: "Deze sessie valt buiten je huidige abonnement.",
};
