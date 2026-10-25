import { cappedPillars, planCovers, type PlanType } from "./plan-coverage";

export interface CanBookSession {
  id: string;
  start_at: string;
  status: string;
  pillar: string;
  age_category: string;
  /** NULL betekent onbeperkt (kettlebell, vrij trainen). */
  capacity: number | null;
  /**
   * Alleen vrij trainen: begin van het gekozen slot. Venster en verleden
   * rekenen dan vanaf het slot, zoals book_class_session.
   */
  slot_start_at?: string | null;
}

export interface CanBookMembership {
  id: string;
  plan_type: string;
  frequency_cap: number | null;
  /**
   * Gedekte pillars van deze rij (memberships.covered_pillars). Bepaalt via
   * cappedPillars() welke pillars samen onder de weekcap vallen
   * (spec-weekcap-extra-les.md). Rittenkaarten hebben een lege lijst en
   * geen cap.
   */
  covered_pillars: readonly string[];
  credits_remaining: number | null;
  /** Optioneel voor bestaande callers; ontbreekt = geen vervaldatum. */
  credits_expires_at?: string | null;
}

export interface CanBookProfile {
  age_category: string;
  active_strikes: number;
  strikes_block_until: string | null;
}

export interface CanBookUsage {
  /**
   * Totale bezetting van de sessie zoals v_session_availability die telt
   * (leden-bookings plus trial_bookings pending/paid/attended), afgeleid
   * als `capacity - spots_available`. Bewust niet view.booked_count: die
   * telt alleen leden en zou hier "open" tonen waar de RPC weigert.
   */
  takenCountThisSession: number;
  /** Geboekte sessies op dezelfde dag, exclusief vrij trainen (telt niet mee). */
  bookingsSameDay: number;
  /**
   * Eigen boekingen met status booked in de ISO-week van de sessie, per
   * pillar, zonder bijgekochte extra lessen (drop_in_payment_id gevuld).
   * canBook() telt hieruit de capped pillars van de dekkende membership op,
   * zoals tmc.booking_gate. Geen check-ins: die hangen aan dezelfde boeking.
   */
  bookingsThisWeekByPillar: Readonly<Record<string, number>>;
}

export interface CanBookSettings {
  booking_window_days: number;
  fair_use_daily_max: number;
  no_show_strike_threshold: number;
  no_show_block_days: number;
  /**
   * Prijs van een extra les in centen uit tmc.extra_class_price voor de
   * leeftijdscategorie van het lid (spec-weekcap-extra-les.md); null als
   * bijkopen voor die categorie uit staat. Alleen weergave: de RPC bepaalt
   * de prijs opnieuw bij het afrekenen.
   */
  extraClassPriceCents: number | null;
}

/** Of een lid mag bijkopen, en voor hoeveel; op weekly_cap_reached en no_coverage. */
export interface ExtraClassOffer {
  available: boolean;
  priceCents: number | null;
}

/**
 * Een actief abonnement (geen rittenkaart of PT-pakket) is de voorwaarde
 * om een extra les te mogen bijkopen. De lijst is al gefilterd op status,
 * effective date en pauze, zoals de gate.
 */
export function hasActiveSubscription(memberships: readonly Pick<CanBookMembership, "plan_type">[]): boolean {
  return memberships.some((m) => m.plan_type !== "ten_ride_card" && m.plan_type !== "pt_package");
}

export function extraClassOffer(
  memberships: readonly Pick<CanBookMembership, "plan_type">[],
  priceCents: number | null,
): ExtraClassOffer {
  const available = hasActiveSubscription(memberships) && priceCents !== null;
  return { available, priceCents: available ? priceCents : null };
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
      /** Gezet bij weekly_cap_reached en no_coverage: bijkopen mogelijk en de prijs. */
      extraClass?: ExtraClassOffer;
    };

/**
 * Pillars waarover de weekcap van deze membership telt voor deze sessie.
 * Spiegel van de tak in tmc.booking_gate, inclusief het vangnet voor een rij
 * zonder covered_pillars maar met een cap: dan geldt de cap op de pillar
 * zelf.
 */
export function cappedPillarsFor(
  membership: Pick<CanBookMembership, "covered_pillars">,
  sessionPillar: string,
): string[] {
  const capped = cappedPillars(membership.covered_pillars);
  return capped.length === 0 ? [sessionPillar] : capped;
}

/** Som van de weektelling over de capped pillars. */
export function weeklyUsage(
  byPillar: Readonly<Record<string, number>>,
  capped: readonly string[],
): number {
  return capped.reduce((sum, p) => sum + (byPillar[p] ?? 0), 0);
}

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

  const startAt = new Date(session.slot_start_at ?? session.start_at);
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

  // Capaciteit NULL betekent onbeperkt (alleen kettlebell): nooit vol,
  // geen waitlist-pad. Zelfde overslag-tak als in de book_class_session RPC.
  // Een volle les is pas "vol, wachtlijst" als de overige checks slagen:
  // tmc.join_waitlist doet dezelfde checks als book_class_session (via
  // booking_gate) en weigert bijvoorbeeld zonder dekking met no_coverage of
  // boven de weekcap met weekly_cap_reached. Daarom onthouden we "vol" hier
  // en beslissen we onderaan, zodat de prefilter dezelfde reden toont als de
  // RPC zou geven.
  const full =
    session.capacity !== null &&
    usage.takenCountThisSession >= session.capacity;
  const capacityFull = {
    allowed: false,
    reason: "capacity_full",
    canJoinWaitlist: true,
  } as const;

  if (
    profile.active_strikes >= settings.no_show_strike_threshold &&
    profile.strikes_block_until &&
    new Date(profile.strikes_block_until) > now
  ) {
    return { allowed: false, reason: "strike_blocked" };
  }

  // Vrij trainen telt niet mee voor de daglimiet en wordt er ook niet door
  // geweigerd (spec-vrij-trainen-slots.md, parity met book_class_session).
  if (
    session.pillar !== "vrij_trainen" &&
    usage.bookingsSameDay >= settings.fair_use_daily_max
  ) {
    return { allowed: false, reason: "daily_cap_reached" };
  }

  const covering = memberships.find((m) =>
    planCovers(m.plan_type, session.pillar),
  );

  if (covering) {
    // Weekcap, hard en per abonnement (spec-weekcap-extra-les.md): telt de
    // eigen boekingen in de ISO-week over de capped pillars van de dekkende
    // membership (groepslessen samen; vrij trainen bij All Access valt
    // erbuiten en heeft geen cap). Zelfde tak als tmc.booking_gate.
    if (covering.frequency_cap !== null) {
      const capped = cappedPillarsFor(covering, session.pillar);
      if (
        capped.includes(session.pillar) &&
        weeklyUsage(usage.bookingsThisWeekByPillar, capped) >=
          covering.frequency_cap
      ) {
        return {
          allowed: false,
          reason: "weekly_cap_reached",
          extraClass: extraClassOffer(memberships, settings.extraClassPriceCents),
        };
      }
    }
    if (full) return capacityFull;
    return {
      allowed: true,
      coveringMembership: covering,
      requiresPayment: false,
    };
  }

  // Parity met book_class_session: kaart moet op het boekmoment geldig
  // zijn (expiry-besluit 2026-07-10); zelfde UTC-datum als current_date
  // op de DB.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const tenRideCard = memberships.find(
    (m) =>
      (m.plan_type satisfies string as PlanType) === "ten_ride_card" &&
      (m.credits_remaining ?? 0) > 0 &&
      (!m.credits_expires_at || m.credits_expires_at >= todayUtc) &&
      planCovers("ten_ride_card", session.pillar),
  );
  if (tenRideCard) {
    if (full) return capacityFull;
    return {
      allowed: true,
      coveringMembership: tenRideCard,
      requiresPayment: false,
    };
  }

  return {
    allowed: false,
    reason: "no_coverage",
    extraClass: extraClassOffer(memberships, settings.extraClassPriceCents),
  };
}

// COPY: confirm met Marlon
export const WEEKLY_CAP_REACHED_COPY = "Je weektegoed is op.";
// COPY: confirm met Marlon
export const NO_COVERAGE_COPY = "Deze les valt buiten je abonnement.";

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
  weekly_cap_reached: WEEKLY_CAP_REACHED_COPY,
  daily_cap_reached: "Maximaal twee sessies per dag.",
  // COPY: confirm met Marlon
  no_coverage: NO_COVERAGE_COPY,
};
