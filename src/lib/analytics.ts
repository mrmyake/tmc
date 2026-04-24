declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = "G-2VFCDM4KRZ";

type EventParams = {
  event_category?: string;
  event_label?: string;
  value?: number;
  [key: string]: string | number | boolean | undefined;
};

export const trackEvent = (eventName: string, params?: EventParams) => {
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

export const trackOutbound = (destination: string) => {
  trackEvent("click_outbound", {
    event_category: "navigation",
    event_label: destination,
  });
};

// ---- Crowdfunding ----

export const trackViewItemList = (listName: string) => {
  trackEvent("view_item_list", {
    event_category: "crowdfunding",
    item_list_name: listName,
  });
};

export const trackSelectItem = (tierId: string, tierName: string) => {
  trackEvent("select_item", {
    event_category: "crowdfunding",
    event_label: tierName,
    tier_id: tierId,
  });
};

export const trackBeginCheckout = (
  tierId: string,
  tierName: string,
  value: number
) => {
  trackEvent("begin_checkout", {
    event_category: "crowdfunding",
    event_label: tierName,
    tier_id: tierId,
    value,
    currency: "EUR",
  });
};

export const trackPurchase = (params: {
  transactionId: string;
  tierId: string;
  tierName: string;
  value: number;
}) => {
  trackEvent("purchase", {
    event_category: "crowdfunding",
    transaction_id: params.transactionId,
    tier_id: params.tierId,
    event_label: params.tierName,
    value: params.value,
    currency: "EUR",
  });
};

export const trackShare = (
  method: "whatsapp" | "instagram" | "facebook" | "copy"
) => {
  trackEvent("share", {
    event_category: "crowdfunding",
    event_label: `share_${method}`,
    method,
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
  method: "magic_link" | "oauth" = "magic_link",
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
