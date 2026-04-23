declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

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
