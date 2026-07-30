declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";

/**
 * GA4 e-commerce item. Bewust zonder `price`/`quantity`/`currency`: de
 * configurator-events dragen géén bedragen — de enige autoritatieve prijs
 * komt server-side uit tmc.create_order (zie ConfigureStage/PayStage).
 */
type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category: string;
};

type EventParams = {
  event_category?: string;
  event_label?: string;
  value?: number;
  items?: AnalyticsItem[];
  [key: string]: string | number | boolean | AnalyticsItem[] | undefined;
};

/** Module-privaat: alle call-sites gaan via de getypeerde helpers hieronder. */
const trackEvent = (eventName: string, params?: EventParams) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
};

export const trackLead = (type: string, value: number = 1) => {
  trackEvent("generate_lead", {
    event_category: "lead_magnet",
    event_label: type,
    value,
  });
};

export const trackCTA = (buttonText: string, page: string) => {
  trackEvent("cta_click", {
    event_category: "engagement",
    event_label: buttonText,
    page_location: page,
  });
};

export const trackContact = (method: "phone" | "whatsapp" | "email") => {
  trackEvent(`click_${method}`, {
    event_category: "contact",
    event_label: `${method}_click`,
  });
};

export const trackFormStart = (formName: string) => {
  trackEvent("form_start", {
    event_category: "engagement",
    event_label: formName,
  });
};

// ---- Abonnement-configurator (/abonnement) ----

/**
 * Stap-weergave in de stage-machine ("configure" | "identify" | "pay").
 * Vult het gat dat de configurator tot nu toe volledig stil maakte tussen
 * pagina-load en `payment_start`.
 */
export const trackConfiguratorStageView = (stage: string): void => {
  trackEvent("configurator_stage_view", {
    event_category: "configurator",
    stage,
  });
};

/**
 * Eén expliciete configuratie-keuze: kaartselectie, de plus-30 vrij-trainen-
 * swap, de verlengde-toegang-addon of de 12/24-maanden-looptijd.
 *
 * `itemId` is de tmc.catalogue-slug van de rij die daadwerkelijk gefactureerd
 * wordt, gelezen uit de bestaande catalogus-resolutie — nooit zelf afgeleid.
 * Bevat bewust geen bedragen.
 */
export const trackConfiguratorSelect = (params: {
  itemId: string;
  family: string;
  frequency: string;
  commitmentMonths: number;
  addonVrijTrainen: boolean;
  addonExtendedAccess: boolean;
}): void => {
  trackEvent("configurator_select", {
    event_category: "configurator",
    item_id: params.itemId,
    family: params.family,
    frequency: params.frequency,
    commitment_months: params.commitmentMonths,
    addon_vrij_trainen: params.addonVrijTrainen,
    addon_extended_access: params.addonExtendedAccess,
  });
};

/**
 * Vervangt de oude `cta_click("Ga verder")`, die de gekozen variant niet
 * bevatte. Geen `value`/`currency`: dit event draagt bewust geen bedrag, dus
 * GA4 rapporteert hier €0 omzet — de betaalwaarde blijft bij `payment_start`
 * / `payment_success`.
 */
export const trackBeginCheckout = (params: {
  itemId: string;
  itemName: string;
  family: string;
}): void => {
  trackEvent("begin_checkout", {
    event_category: "configurator",
    items: [
      {
        item_id: params.itemId,
        item_name: params.itemName,
        item_category: params.family,
      },
    ],
  });
};

/**
 * Een checkout-poging die server-side geweigerd is: `create_order` gaf
 * {ok:false} (bv. `existing_membership`, `existing_open_order`, de EM/24m-
 * conflictgate), of de flow strandde vóór Mollie. Zonder dit event is die
 * uitval niet eens als uitval zichtbaar — GA4 ziet dan alleen een
 * `begin_checkout` zonder `payment_start`, precies zoals bij iemand die uit
 * eigen beweging afhaakt.
 *
 * `reason` is de machine-leesbare code uit createOrderAndCheckout, nooit de
 * Nederlandse foutcopy die de gebruiker ziet.
 */
export const trackCheckoutRejected = (params: {
  itemId: string;
  reason: string;
}): void => {
  trackEvent("checkout_rejected", {
    event_category: "configurator",
    item_id: params.itemId,
    reason: params.reason,
  });
};

// ---- Member app ----

export const trackScheduleDayView = (daysAhead: number) => {
  trackEvent("schedule_day_view", {
    event_category: "member_app",
    days_ahead: daysAhead,
  });
};

export const trackSchedulePaginateForward = (windowStart: string) => {
  trackEvent("schedule_paginate_forward", {
    event_category: "member_app",
    event_label: windowStart,
  });
};

export const trackMyBookingsTabSwitch = (tab: "upcoming" | "history") => {
  trackEvent("my_bookings_tab_switch", {
    event_category: "member_app",
    event_label: tab,
    tab,
  });
};

// ---- User identity ----

/**
 * Set of clear GA4 `user_id`. Alleen de opaque Supabase UUID — geen
 * email of andere PII. Vereist consent-granted state (anders stil
 * falen zodat we Consent Mode v2 niet breken).
 *
 * Roep aan bij SIGNED_IN (ook initial mount als sessie al bestaat) en
 * met `null` bij SIGNED_OUT. Ontsluit cross-device cohort-analyse en
 * lifecycle-attributie.
 */
export const setUserId = (userId: string | null): void => {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("config", GA_MEASUREMENT_ID, {
    user_id: userId,
    send_page_view: false,
  });
};

// ---- Portal login ----

export const trackPortalLogin = (
  method: "otp" | "oauth" = "otp",
): void => {
  trackEvent("portal_login", {
    event_category: "portal",
    method,
  });
};

// ---- Booking lifecycle ----

export const trackBookingStart = (params: {
  sessionId: string;
  classType: string;
  pillar: string;
  trainerId?: string;
}): void => {
  trackEvent("booking_start", {
    event_category: "booking",
    session_id: params.sessionId,
    class_type: params.classType,
    pillar: params.pillar,
    trainer_id: params.trainerId,
  });
};

export const trackBookingComplete = (params: {
  sessionId: string;
  classType: string;
  pillar: string;
  planType: string;
  creditCharged: boolean;
  hoursBeforeStart: number;
}): void => {
  trackEvent("booking_complete", {
    event_category: "booking",
    session_id: params.sessionId,
    class_type: params.classType,
    pillar: params.pillar,
    plan_type: params.planType,
    credit_charged: params.creditCharged ? 1 : 0,
    hours_before_start: Math.round(params.hoursBeforeStart),
  });
};

export const trackBookingCancel = (params: {
  sessionId: string;
  pillar: string;
  hoursBeforeStart: number;
  withinWindow: boolean;
  reason?: string;
}): void => {
  trackEvent("booking_cancel", {
    event_category: "booking",
    session_id: params.sessionId,
    pillar: params.pillar,
    hours_before_start: Math.round(params.hoursBeforeStart),
    within_window: params.withinWindow ? 1 : 0,
    reason: params.reason,
  });
};

// ---- Waitlist ----

export const trackWaitlistJoin = (params: {
  sessionId: string;
  classType: string;
  position: number;
}): void => {
  trackEvent("waitlist_join", {
    event_category: "booking",
    session_id: params.sessionId,
    class_type: params.classType,
    waitlist_position: params.position,
  });
};

// ---- Rooster filter ----

export const trackRoosterFilter = (pillar: string | null): void => {
  trackEvent("rooster_filter", {
    event_category: "portal",
    pillar: pillar ?? "all",
  });
};

// ---- Membership lifecycle ----

export const trackMembershipView = (currentPlan: string): void => {
  trackEvent("membership_view", {
    event_category: "membership",
    current_plan: currentPlan,
  });
};

export const trackMembershipPauseRequest = (params: {
  weeks: number;
  reason?: string;
}): void => {
  trackEvent("membership_pause_request", {
    event_category: "membership",
    weeks: params.weeks,
    reason: params.reason,
  });
};

export const trackMembershipCancelAttempt = (params: {
  withinLockIn: boolean;
  currentPlan: string;
}): void => {
  trackEvent("membership_cancel_attempt", {
    event_category: "membership",
    within_lock_in: params.withinLockIn ? 1 : 0,
    current_plan: params.currentPlan,
  });
};

export const trackMembershipCancelComplete = (params: {
  currentPlan: string;
  effectiveDate: string;
  daysUntilEffective: number;
}): void => {
  trackEvent("membership_cancel_complete", {
    event_category: "membership",
    current_plan: params.currentPlan,
    effective_date: params.effectiveDate,
    days_until_effective: params.daysUntilEffective,
  });
};

// ---- Profile & onboarding ----

export const trackProfileUpdate = (fieldsChanged: string[]): void => {
  trackEvent("profile_update", {
    event_category: "portal",
    fields_changed: fieldsChanged.join(","),
    fields_count: fieldsChanged.length,
  });
};

export const trackHealthIntakeStart = (): void => {
  trackEvent("health_intake_start", { event_category: "onboarding" });
};

export const trackHealthIntakeComplete = (): void => {
  trackEvent("health_intake_complete", { event_category: "onboarding" });
};

// ---- Payment (member side) ----

export const trackPaymentStart = (params: {
  amount: number;
  context: "first_membership" | "upgrade" | "pt_package" | "ten_ride_card";
  planVariant?: string;
}): void => {
  trackEvent("payment_start", {
    event_category: "payment",
    value: params.amount,
    currency: "EUR",
    context: params.context,
    plan_variant: params.planVariant,
  });
};

export const trackPaymentSuccess = (params: {
  amount: number;
  context: string;
  transactionId: string;
}): void => {
  trackEvent("payment_success", {
    event_category: "payment",
    value: params.amount,
    currency: "EUR",
    context: params.context,
    transaction_id: params.transactionId,
  });
};

export const trackPaymentFailed = (params: {
  amount: number;
  context: string;
  reason: string;
}): void => {
  trackEvent("payment_failed", {
    event_category: "payment",
    value: params.amount,
    currency: "EUR",
    context: params.context,
    reason: params.reason,
  });
};
